import {
  existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import type { AgentProvider } from '../shared/agentProvider';
import type { HiveMessage, HiveTask, Registry } from './hive';
import {
  loadTeamOsPreparationCatalog,
  loadTeamOsSnapshot,
  resolveProjectWorkspace,
  type LoadTeamOsOptions
} from './teamOs';
import {
  TEAM_OS_PLAN_LIMITS,
  allocatePlan,
  buildStartFromConclusionPrompt,
  buildTeamOsPlanOutputSchema,
  validatePlanManifest,
  type TeamOsAllocationDecision,
  type TeamOsPlanManifest,
  type TeamOsPlanPhase,
  type TeamOsPlanRuntime,
  type TeamOsPlanTask
} from './teamOsPlan';

const STATE_FILE = 'state.json';
const REQUEST_FILE = 'request.json';
const SUBMIT_FILE = 'submit.json';
const PLAN_FILE = 'plan.json';
const MAX_REQUESTS = 100;

export interface TeamOsPlanningState extends TeamOsPlanRuntime {
  version: 1;
  requestId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  error?: { code: string; message: string };
}

export type StartFromConclusionResult =
  | { ok: true; requestId: string; projectId: string; prompt: string; nativePrompt: string; outputSchema: Record<string, unknown>; state: TeamOsPlanningState }
  | { ok: false; error: { code: string; message: string } };

export function listPlanningStates(harnessHome?: string): TeamOsPlanningState[] {
  if (!harnessHome) return [];
  try {
    const root = planningRoot(harnessHome);
    if (!existsSync(root)) return [];
    return readdirSync(root).slice(0, MAX_REQUESTS)
      .map((name) => join(root, name))
      .filter((path) => { try { return statSync(path).isDirectory() && !lstatSync(path).isSymbolicLink(); } catch { return false; } })
      .map((requestDir) => { try { return readState(requestDir); } catch { return null; } })
      .filter((state): state is TeamOsPlanningState => state !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export interface TeamOsPlanCoordinatorDeps {
  teamOsOptions(): LoadTeamOsOptions;
  harnessHome(): string | undefined;
  registry(): Registry;
  tasks(): unknown;
  addTask(task: HiveTask): boolean;
  send(partial: Partial<HiveMessage>, from: string): HiveMessage;
  spawn(decision: TeamOsAllocationDecision): Promise<{ ok: boolean; error?: string }>;
  reuse(decision: TeamOsAllocationDecision): Promise<{ ok: boolean; error?: string }>;
  emit(event: { requestId: string; phase: TeamOsPlanPhase; state: TeamOsPlanningState }): void;
}

function safeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
}

function atomicJson(path: string, value: unknown): void {
  const temp = `${path}.tmp-${process.pid}-${randomBytes(2).toString('hex')}`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  renameSync(temp, path);
}

function readJson(path: string, maxBytes = TEAM_OS_PLAN_LIMITS.manifestBytes): unknown {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('planning file must be a regular file');
  if (entry.size > maxBytes) throw new Error(`planning file exceeds ${maxBytes} bytes`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function planningRoot(harnessHome: string): string {
  if (!isAbsolute(harnessHome)) throw new Error('harnessHome must be absolute');
  return join(resolve(harnessHome), '.work', 'team-os', 'plans');
}

function projectFor(options: LoadTeamOsOptions, projectId?: string) {
  const snapshot = loadTeamOsSnapshot(options);
  if (snapshot.status !== 'ready') throw new Error(snapshot.error?.message ?? 'Team OS is unavailable');
  const ready = snapshot.projects.filter((project) => project.status === 'ready');
  if (projectId) {
    const selected = ready.find((project) => project.id === projectId);
    if (!selected) throw new Error(`project is not ready: ${projectId}`);
    return selected;
  }
  if (ready.length !== 1) throw new Error('project is ambiguous; choose one Team OS project');
  return ready[0];
}

/** Create one durable planning request and compile a prompt for Michael's
 * existing renderer queue. No Session is created or replaced here. */
export function startFromConclusion(args: {
  options: LoadTeamOsOptions;
  harnessHome?: string;
  projectId?: string;
  localWrite: boolean;
  now?: number;
}): StartFromConclusionResult {
  try {
    if (!args.harnessHome) throw new Error('harnessHome is not configured');
    const project = projectFor(args.options, args.projectId);
    const workspaceSnapshot = resolveProjectWorkspace(args.options, project.id);
    if (!workspaceSnapshot.ok) throw new Error(workspaceSnapshot.error?.message ?? 'workspace registry is unavailable');
    const catalog = loadTeamOsPreparationCatalog(args.options);
    if (catalog.status !== 'ready') throw new Error(catalog.error?.message ?? 'Team OS role catalog is unavailable');
    const requestId = safeId('plan');
    const root = planningRoot(args.harnessHome);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    if (readdirSync(root).length >= MAX_REQUESTS) throw new Error(`planning request limit ${MAX_REQUESTS} reached`);
    const requestDir = join(root, requestId);
    mkdirSync(requestDir, { mode: 0o700 });
    const createdAt = new Date(args.now ?? Date.now()).toISOString();
    const state: TeamOsPlanningState = {
      version: 1,
      requestId,
      projectId: project.id,
      phase: 'planning',
      createdAt,
      updatedAt: createdAt,
      tasks: {}
    };
    const submitPath = join(requestDir, SUBMIT_FILE);
    atomicJson(join(requestDir, REQUEST_FILE), {
      version: 1, requestId, projectId: project.id, localWrite: args.localWrite === true,
      createdAt, submitPath
    });
    atomicJson(join(requestDir, STATE_FILE), state);
    return {
      ok: true,
      requestId,
      projectId: project.id,
      prompt: buildStartFromConclusionPrompt({
        requestId, project, workspaces: workspaceSnapshot.workspaces,
        submitPath, localWrite: args.localWrite === true,
        roleIds: catalog.roles.map((role) => role.id),
        capabilityProfileIds: catalog.capabilityProfiles.map((profile) => profile.id)
      }),
      nativePrompt: buildStartFromConclusionPrompt({
        requestId, project, workspaces: workspaceSnapshot.workspaces,
        submitPath, localWrite: args.localWrite === true, delivery: 'structured',
        roleIds: catalog.roles.map((role) => role.id),
        capabilityProfileIds: catalog.capabilityProfiles.map((profile) => profile.id)
      }),
      outputSchema: buildTeamOsPlanOutputSchema({
        requestId, projectId: project.id, localWrite: args.localWrite === true
      }),
      state
    };
  } catch (error) {
    return { ok: false, error: { code: 'PLAN_START_FAILED', message: error instanceof Error ? error.message : String(error) } };
  }
}

export function submitPlanningResult(args: {
  harnessHome?: string;
  requestId: string;
  value: unknown;
}): { ok: true } | { ok: false; error: { code: string; message: string } } {
  try {
    if (!args.harnessHome) throw new Error('harnessHome is not configured');
    if (!/^plan-[a-z0-9-]+$/i.test(args.requestId)) throw new Error('invalid planning request id');
    const requestDir = join(planningRoot(args.harnessHome), args.requestId);
    const state = readState(requestDir);
    if (state.requestId !== args.requestId || state.phase !== 'planning') {
      throw new Error(`planning request is not accepting a result: ${state.phase}`);
    }
    let value = args.value;
    if (typeof value === 'string') {
      if (Buffer.byteLength(value, 'utf8') > TEAM_OS_PLAN_LIMITS.manifestBytes) throw new Error('planning result is too large');
      value = JSON.parse(value);
    }
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded, 'utf8') > TEAM_OS_PLAN_LIMITS.manifestBytes) throw new Error('planning result is too large');
    atomicJson(join(requestDir, SUBMIT_FILE), value);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: { code: 'PLAN_RESULT_REJECTED', message: error instanceof Error ? error.message : String(error) } };
  }
}

function readState(requestDir: string): TeamOsPlanningState {
  return readJson(join(requestDir, STATE_FILE)) as TeamOsPlanningState;
}

function writeState(requestDir: string, state: TeamOsPlanningState): void {
  state.updatedAt = new Date().toISOString();
  atomicJson(join(requestDir, STATE_FILE), state);
}

function hiveTaskId(requestId: string, taskId: string): string {
  return `${requestId}--${taskId}`;
}

function hiveTasks(raw: unknown): HiveTask[] {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as { tasks?: unknown } : {};
  return Array.isArray(value.tasks) ? value.tasks as HiveTask[] : [];
}

function syncRuntime(plan: TeamOsPlanManifest, state: TeamOsPlanningState, ledger: HiveTask[]): void {
  const byId = new Map(ledger.map((task) => [task.id, task]));
  for (const task of plan.tasks) {
    const current = state.tasks[task.id] ?? { status: 'planned' as const };
    const card = byId.get(hiveTaskId(plan.requestId, task.id));
    if (!card) { state.tasks[task.id] = current; continue; }
    state.tasks[task.id] = {
      ...current,
      status: card.status,
      ...(card.assignee ? { agentId: card.assignee } : {})
    };
    if (card.status === 'done' && !state.tasks[task.id].completedAt) state.tasks[task.id].completedAt = new Date().toISOString();
  }
}

function taskMessage(plan: TeamOsPlanManifest, task: TeamOsPlanTask): string {
  return [
    `OBJECTIVE: ${task.objective}`,
    `CONTEXT: Team OS plan ${plan.requestId}; project ${plan.projectId}; workspace ${task.workspaceKey ?? 'project-root'}; cwd ${task.cwd}`,
    `CONSTRAINTS: role=${task.roleLabel} (${task.roleId}); capabilities=${task.capabilityProfileIds.join(', ') || 'none'}; read=${task.read.join(', ') || 'none'}; write=${task.write.join(', ') || 'none'}; authorization localWrite=${plan.authorization.localWrite}, git/remote/production/destructive=false; stop=${task.stopConditions.join('; ')}`,
    `DONE WHEN: ${task.acceptance.join('; ')}${task.validation.length ? `; validation: ${task.validation.join('; ')}` : ''}`,
    'Reply to Michael through your outbox with decisions, changed paths, validation and blockers. Update the assigned task card; do not widen authorization.'
  ].join('\n');
}

export class TeamOsPlanCoordinator {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private deps: TeamOsPlanCoordinatorDeps) {}

  start(intervalMs = 2_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, intervalMs);
    this.timer.unref?.();
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const harnessHome = this.deps.harnessHome();
      if (!harnessHome) return;
      const root = planningRoot(harnessHome);
      if (!existsSync(root)) return;
      const dirs = readdirSync(root).slice(0, MAX_REQUESTS)
        .map((name) => join(root, name))
        .filter((path) => { try { return statSync(path).isDirectory() && !lstatSync(path).isSymbolicLink(); } catch { return false; } });
      for (const requestDir of dirs) await this.tickRequest(requestDir);
    } finally {
      this.ticking = false;
    }
  }

  private fail(requestDir: string, state: TeamOsPlanningState, code: string, message: string): void {
    state.phase = 'failed';
    state.error = { code, message };
    writeState(requestDir, state);
    this.deps.emit({ requestId: state.requestId, phase: state.phase, state });
  }

  private async tickRequest(requestDir: string): Promise<void> {
    let state: TeamOsPlanningState;
    try { state = readState(requestDir); }
    catch { return; }
    if (['completed', 'failed', 'stopped'].includes(state.phase)) return;
    const options = this.deps.teamOsOptions();
    let plan: TeamOsPlanManifest;
    try {
      if (!existsSync(join(requestDir, PLAN_FILE))) {
        if (!existsSync(join(requestDir, SUBMIT_FILE))) return;
        const request = readJson(join(requestDir, REQUEST_FILE)) as { requestId: string; projectId: string; localWrite: boolean };
        const project = projectFor(options, request.projectId);
        const catalog = loadTeamOsPreparationCatalog(options);
        if (catalog.status !== 'ready') throw new Error(catalog.error?.message ?? 'role catalog is unavailable');
        const workspaces = resolveProjectWorkspace(options, project.id);
        if (!workspaces.ok) throw new Error(workspaces.error?.message ?? 'workspace registry is unavailable');
        const submitted = readJson(join(requestDir, SUBMIT_FILE));
        const validated = validatePlanManifest(submitted, {
          requestId: request.requestId, project, roles: catalog.roles,
          capabilityProfiles: catalog.capabilityProfiles, workspaces: workspaces.workspaces,
          allowLocalWrite: request.localWrite === true
        });
        if (!validated.ok) throw new Error(validated.error.message);
        plan = validated.plan;
        atomicJson(join(requestDir, PLAN_FILE), plan);
        state.tasks = Object.fromEntries(plan.tasks.map((task) => [task.id, { status: 'planned' }]));
        state.phase = 'ready';
        writeState(requestDir, state);
        this.deps.emit({ requestId: state.requestId, phase: state.phase, state });
      } else {
        plan = readJson(join(requestDir, PLAN_FILE)) as TeamOsPlanManifest;
      }
    } catch (error) {
      this.fail(requestDir, state, 'PLAN_VALIDATION_FAILED', error instanceof Error ? error.message : String(error));
      return;
    }

    const ledger = hiveTasks(this.deps.tasks());
    syncRuntime(plan, state, ledger);
    const registry = this.deps.registry();
    const allocation = allocatePlan(plan, Object.entries(registry.agents).map(([agentId, agent]) => ({
      id: agentId, name: agent.name, role: agent.role, cwd: agent.cwd, status: agent.status,
      archived: agent.archived, provider: agent.provider, sessionId: agent.sessionId
    })), state);
    state.phase = allocation.phase;
    for (const decision of allocation.decisions) {
      const task = plan.tasks.find((candidate) => candidate.id === decision.taskId)!;
      if (decision.mode === 'spawn') {
        const spawned = await this.deps.spawn(decision);
        if (!spawned.ok) {
          state.tasks[task.id] = { status: 'failed', agentId: decision.agentId };
          this.fail(requestDir, state, 'AGENT_SPAWN_FAILED', spawned.error ?? `unable to spawn ${decision.agentId}`);
          return;
        }
      } else {
        const reused = await this.deps.reuse(decision);
        if (!reused.ok) {
          state.tasks[task.id] = { status: 'failed', agentId: decision.agentId };
          this.fail(requestDir, state, 'AGENT_REUSE_FAILED', reused.error ?? `unable to reuse ${decision.agentId}`);
          return;
        }
      }
      const card: HiveTask = {
        id: hiveTaskId(plan.requestId, task.id),
        title: task.title,
        description: task.objective,
        assignee: decision.agentId,
        status: 'doing',
        dependsOn: task.dependsOn.map((dependency) => hiveTaskId(plan.requestId, dependency)),
        priority: 5,
        createdAt: new Date().toISOString()
      };
      if (!this.deps.addTask(card) && !ledger.some((existing) => existing.id === card.id)) {
        this.fail(requestDir, state, 'TASK_CREATE_FAILED', `unable to create task ${task.id}`);
        return;
      }
      const message = this.deps.send({
        to: decision.agentId,
        conversation: plan.requestId,
        act: 'request',
        subject: `Team OS 计划任务：${task.title}`,
        body: taskMessage(plan, task),
        requires_reply: true
      }, 'god');
      state.tasks[task.id] = {
        status: 'doing', agentId: decision.agentId,
        dispatchedAt: message.created_at
      };
    }
    writeState(requestDir, state);
    this.deps.emit({ requestId: state.requestId, phase: state.phase, state });
  }
}
