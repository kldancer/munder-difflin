import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { TeamOsCapabilityProfile, TeamOsProjectSnapshot, TeamOsRole, TeamOsWorkspace } from './teamOs';

export const TEAM_OS_PLAN_LIMITS = {
  tasks: 12,
  gates: 12,
  pathsPerTask: 24,
  listItems: 16,
  maxParallel: 6,
  manifestBytes: 128 * 1024
} as const;

export type TeamOsPlanPhase =
  | 'planning' | 'ready' | 'executing' | 'verifying'
  | 'awaiting-human' | 'blocked' | 'completed' | 'failed' | 'stopped';

export interface TeamOsPlanAuthorization {
  localWrite: boolean;
  gitWrite: false;
  remoteWrite: false;
  productionWrite: false;
  destructive: false;
}

export interface TeamOsPlanTask {
  id: string;
  title: string;
  objective: string;
  roleId: string;
  roleLabel: string;
  capabilityProfileIds: string[];
  workspaceKey: string | null;
  cwd: string;
  dependsOn: string[];
  read: string[];
  write: string[];
  acceptance: string[];
  validation: string[];
  stopConditions: string[];
  targetMinutes: number | null;
  hardStopMinutes: number | null;
}

export interface TeamOsPlanManifest {
  version: 1;
  requestId: string;
  projectId: string;
  outcome: string;
  nonGoals: string[];
  authorization: TeamOsPlanAuthorization;
  tasks: TeamOsPlanTask[];
  gates: Array<{ id: string; label: string; taskIds: string[]; evidence: string[] }>;
}

/** JSON Schema used only as a model-output constraint. Authorization, role,
 * workspace, DAG and write-set correctness remain Main-process decisions in
 * validatePlanManifest; schema validity never grants authority. */
export function buildTeamOsPlanOutputSchema(args: {
  requestId: string;
  projectId: string;
  localWrite: boolean;
}): Record<string, unknown> {
  const stringArray = { type: 'array', maxItems: TEAM_OS_PLAN_LIMITS.listItems, items: { type: 'string' } };
  const pathArray = { type: 'array', maxItems: TEAM_OS_PLAN_LIMITS.pathsPerTask, items: { type: 'string' } };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'requestId', 'projectId', 'outcome', 'nonGoals', 'authorization', 'tasks', 'gates'],
    properties: {
      version: { type: 'integer', enum: [1] },
      requestId: { type: 'string', enum: [args.requestId] },
      projectId: { type: 'string', enum: [args.projectId] },
      outcome: { type: 'string' },
      nonGoals: stringArray,
      authorization: {
        type: 'object', additionalProperties: false,
        required: ['localWrite', 'gitWrite', 'remoteWrite', 'productionWrite', 'destructive'],
        properties: {
          localWrite: { type: 'boolean', enum: [args.localWrite] },
          gitWrite: { type: 'boolean', enum: [false] }, remoteWrite: { type: 'boolean', enum: [false] },
          productionWrite: { type: 'boolean', enum: [false] }, destructive: { type: 'boolean', enum: [false] }
        }
      },
      tasks: {
        type: 'array', minItems: 1, maxItems: TEAM_OS_PLAN_LIMITS.tasks,
        items: {
          type: 'object', additionalProperties: false,
          required: [
            'id', 'title', 'objective', 'roleId', 'capabilityProfileIds', 'workspaceKey',
            'dependsOn', 'read', 'write', 'acceptance', 'validation', 'stopConditions',
            'targetMinutes', 'hardStopMinutes'
          ],
          properties: {
            id: { type: 'string' }, title: { type: 'string' }, objective: { type: 'string' },
            roleId: { type: 'string' }, capabilityProfileIds: stringArray,
            workspaceKey: { type: ['string', 'null'] }, dependsOn: stringArray,
            read: pathArray, write: pathArray, acceptance: stringArray,
            validation: stringArray, stopConditions: stringArray,
            targetMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 1440 },
            hardStopMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 1440 }
          }
        }
      },
      gates: {
        type: 'array', maxItems: TEAM_OS_PLAN_LIMITS.gates,
        items: {
          type: 'object', additionalProperties: false,
          required: ['id', 'label', 'taskIds', 'evidence'],
          properties: { id: { type: 'string' }, label: { type: 'string' }, taskIds: stringArray, evidence: stringArray }
        }
      }
    }
  };
}

export interface TeamOsPlanValidationContext {
  requestId: string;
  project: TeamOsProjectSnapshot;
  roles: TeamOsRole[];
  capabilityProfiles: TeamOsCapabilityProfile[];
  workspaces: TeamOsWorkspace[];
  allowLocalWrite: boolean;
}

export type TeamOsPlanValidationResult =
  | { ok: true; plan: TeamOsPlanManifest }
  | { ok: false; error: { code: string; message: string } };

export interface TeamOsLiveAgent {
  id: string;
  name: string;
  role?: string;
  cwd: string;
  status: 'idle' | 'working' | 'blocked' | 'gone';
  archived?: boolean;
  provider?: string;
  sessionId?: string;
}

export interface TeamOsPlanTaskRuntime {
  status: 'planned' | 'todo' | 'doing' | 'blocked' | 'done' | 'failed' | 'stopped';
  agentId?: string;
  dispatchedAt?: string;
  completedAt?: string;
}

export interface TeamOsPlanRuntime {
  phase: TeamOsPlanPhase;
  tasks: Record<string, TeamOsPlanTaskRuntime>;
}

export interface TeamOsAllocationDecision {
  taskId: string;
  agentId: string;
  mode: 'reuse' | 'spawn';
  /** Continue only when this same plan already used the instance; an unrelated
   * plan reuses the visible role slot but starts a fresh CLI Session. */
  sessionMode: 'continue' | 'fresh';
  roleId: string;
  roleLabel: string;
  cwd: string;
  provider?: string;
  resumeSessionId?: string;
}

/** Persist the exact executable/argv recipe used by an automatically provisioned
 * worker. The renderer stores one command string and tokenizes it again on the
 * next app start, so arguments containing spaces must remain one token. */
export function formatTeamOsSpawnCommand(executable: string, args: string[]): string {
  const quote = (value: string): string => {
    if (!/[\s'\"]/.test(value)) return value;
    if (!value.includes("'")) return `'${value}'`;
    if (!value.includes('"')) return `"${value}"`;
    throw new Error('Team OS spawn arguments cannot contain both quote styles');
  };
  return [executable, ...args].map(quote).join(' ');
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown, field: string, max = 4_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${field} must be a non-empty string no longer than ${max} characters`);
  }
  return value.trim();
}

function id(value: unknown, field: string): string {
  const valueText = text(value, field, 80);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(valueText)) throw new Error(`${field} has an invalid id`);
  return valueText;
}

function list(
  value: unknown,
  field: string,
  { required = false, limit = TEAM_OS_PLAN_LIMITS.listItems }: { required?: boolean; limit?: number } = {}
): string[] {
  if (!Array.isArray(value) || value.length > limit || (required && value.length === 0)) {
    throw new Error(`${field} must contain ${required ? '1 to ' : 'at most '}${limit} items`);
  }
  return value.map((entry, index) => text(entry, `${field}[${index}]`, 2_048));
}

function minutes(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1_440) {
    throw new Error(`${field} must be an integer between 1 and 1440`);
  }
  return value;
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function scopePath(raw: string, cwd: string, roots: string[], field: string): string {
  const candidate = resolve(cwd, raw);
  if (!roots.some((root) => inside(root, candidate))) throw new Error(`${field} is outside registered project workspaces`);
  return candidate;
}

function overlaps(a: string, b: string): boolean {
  return inside(a, b) || inside(b, a);
}

function hasDependency(tasks: Map<string, TeamOsPlanTask>, from: string, target: string, seen = new Set<string>()): boolean {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return (tasks.get(from)?.dependsOn ?? []).some((dependency) => hasDependency(tasks, dependency, target, seen));
}

function maxParallelWidth(tasks: TeamOsPlanTask[]): number {
  const depth = new Map<string, number>();
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visit = (task: TeamOsPlanTask): number => {
    const cached = depth.get(task.id);
    if (cached != null) return cached;
    const value = task.dependsOn.length === 0 ? 0 : 1 + Math.max(...task.dependsOn.map((dependency) => visit(byId.get(dependency)!)));
    depth.set(task.id, value);
    return value;
  };
  for (const task of tasks) visit(task);
  const widths = new Map<number, number>();
  for (const value of depth.values()) widths.set(value, (widths.get(value) ?? 0) + 1);
  return Math.max(0, ...widths.values());
}

/** Validate and normalize Michael's plan without making any model or runtime call. */
export function validatePlanManifest(input: unknown, context: TeamOsPlanValidationContext): TeamOsPlanValidationResult {
  try {
    const raw = record(input);
    if (!raw || raw.version !== 1) throw new Error('plan must be a version 1 object');
    const requestId = id(raw.requestId, 'requestId');
    if (requestId !== context.requestId) throw new Error('requestId does not match the active planning request');
    const projectId = id(raw.projectId, 'projectId');
    if (projectId !== context.project.id || !context.project.root) throw new Error('projectId does not match the active project');
    const auth = record(raw.authorization) ?? {};
    const localWrite = auth.localWrite === true;
    if (localWrite && !context.allowLocalWrite) throw new Error('localWrite was not authorized by the start request');
    if (localWrite && context.project.constraints.allowRuntimeWrite === false) {
      throw new Error('localWrite is disabled by the project adapter');
    }
    for (const forbidden of ['gitWrite', 'remoteWrite', 'productionWrite', 'destructive']) {
      if (auth[forbidden] === true) throw new Error(`${forbidden} is outside the start-from-conclusion authorization`);
    }
    if (!Array.isArray(raw.tasks) || raw.tasks.length === 0 || raw.tasks.length > TEAM_OS_PLAN_LIMITS.tasks) {
      throw new Error(`tasks must contain 1 to ${TEAM_OS_PLAN_LIMITS.tasks} items`);
    }
    const roles = new Map(context.roles.map((role) => [role.id, role]));
    const profiles = new Set(context.capabilityProfiles.map((profile) => profile.id));
    const workspaceMap = new Map(context.workspaces.map((workspace) => [workspace.key, workspace]));
    const roots = [...new Set([context.project.root, ...context.workspaces.filter((workspace) => workspace.directory).map((workspace) => workspace.path)])];
    const seen = new Set<string>();
    const tasks = raw.tasks.map((entry, index): TeamOsPlanTask => {
      const row = record(entry);
      if (!row) throw new Error(`tasks[${index}] must be an object`);
      const taskId = id(row.id, `tasks[${index}].id`);
      if (seen.has(taskId)) throw new Error(`duplicate task id: ${taskId}`);
      seen.add(taskId);
      const roleId = id(row.roleId, `tasks[${index}].roleId`);
      const role = roles.get(roleId);
      if (!role) throw new Error(`unknown role: ${roleId}`);
      const capabilityProfileIds = list(row.capabilityProfileIds ?? [], `tasks[${index}].capabilityProfileIds`, { limit: 8 })
        .map((profileId, profileIndex) => id(profileId, `tasks[${index}].capabilityProfileIds[${profileIndex}]`));
      for (const profileId of capabilityProfileIds) if (!profiles.has(profileId)) throw new Error(`unknown capability profile: ${profileId}`);
      const workspaceKey = row.workspaceKey == null || row.workspaceKey === '' ? null : id(row.workspaceKey, `tasks[${index}].workspaceKey`);
      const workspace = workspaceKey ? workspaceMap.get(workspaceKey) : undefined;
      if (workspaceKey && (!workspace || !workspace.directory)) throw new Error(`workspace is unavailable: ${workspaceKey}`);
      const cwd = workspace?.path ?? context.project.root!;
      const read = list(row.read ?? [], `tasks[${index}].read`, { limit: TEAM_OS_PLAN_LIMITS.pathsPerTask })
        .map((path, pathIndex) => scopePath(path, cwd, roots, `tasks[${index}].read[${pathIndex}]`));
      const write = list(row.write ?? [], `tasks[${index}].write`, { limit: TEAM_OS_PLAN_LIMITS.pathsPerTask })
        .map((path, pathIndex) => scopePath(path, cwd, roots, `tasks[${index}].write[${pathIndex}]`));
      if (!localWrite && write.length > 0) throw new Error(`tasks[${index}].write requires localWrite authorization`);
      const targetMinutes = minutes(row.targetMinutes, `tasks[${index}].targetMinutes`);
      const hardStopMinutes = minutes(row.hardStopMinutes, `tasks[${index}].hardStopMinutes`);
      if (targetMinutes != null && hardStopMinutes != null && hardStopMinutes < targetMinutes) {
        throw new Error(`tasks[${index}] hardStopMinutes must be >= targetMinutes`);
      }
      return {
        id: taskId,
        title: text(row.title, `tasks[${index}].title`, 240),
        objective: text(row.objective, `tasks[${index}].objective`),
        roleId,
        roleLabel: role.label,
        capabilityProfileIds: [...new Set(capabilityProfileIds)],
        workspaceKey,
        cwd,
        dependsOn: list(row.dependsOn ?? [], `tasks[${index}].dependsOn`).map((dependency, dependencyIndex) => id(dependency, `tasks[${index}].dependsOn[${dependencyIndex}]`)),
        read,
        write,
        acceptance: list(row.acceptance, `tasks[${index}].acceptance`, { required: true }),
        validation: list(row.validation ?? [], `tasks[${index}].validation`),
        stopConditions: list(row.stopConditions, `tasks[${index}].stopConditions`, { required: true }),
        targetMinutes,
        hardStopMinutes
      };
    });
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    for (const task of tasks) {
      for (const dependency of task.dependsOn) {
        if (!taskMap.has(dependency)) throw new Error(`task ${task.id} depends on unknown task ${dependency}`);
        if (dependency === task.id || hasDependency(taskMap, dependency, task.id)) throw new Error(`task DAG contains a cycle involving ${task.id}`);
      }
    }
    if (maxParallelWidth(tasks) > TEAM_OS_PLAN_LIMITS.maxParallel) {
      throw new Error(`plan exceeds the ${TEAM_OS_PLAN_LIMITS.maxParallel} concurrent lane limit`);
    }
    for (let left = 0; left < tasks.length; left++) {
      for (let right = left + 1; right < tasks.length; right++) {
        if (!tasks[left].write.some((a) => tasks[right].write.some((b) => overlaps(a, b)))) continue;
        if (!hasDependency(taskMap, tasks[left].id, tasks[right].id) && !hasDependency(taskMap, tasks[right].id, tasks[left].id)) {
          throw new Error(`parallel tasks ${tasks[left].id} and ${tasks[right].id} have overlapping write scopes`);
        }
      }
    }
    const rawGates = raw.gates ?? [];
    if (!Array.isArray(rawGates) || rawGates.length > TEAM_OS_PLAN_LIMITS.gates) throw new Error(`gates must contain at most ${TEAM_OS_PLAN_LIMITS.gates} items`);
    const gates = rawGates.map((entry, index) => {
      const row = record(entry);
      if (!row) throw new Error(`gates[${index}] must be an object`);
      const taskIds = list(row.taskIds, `gates[${index}].taskIds`, { required: true }).map((taskId) => id(taskId, `gates[${index}].taskIds`));
      for (const taskId of taskIds) if (!taskMap.has(taskId)) throw new Error(`gate references unknown task: ${taskId}`);
      return { id: id(row.id, `gates[${index}].id`), label: text(row.label, `gates[${index}].label`, 240), taskIds, evidence: list(row.evidence, `gates[${index}].evidence`, { required: true }) };
    });
    return { ok: true, plan: {
      version: 1,
      requestId,
      projectId,
      outcome: text(raw.outcome, 'outcome'),
      nonGoals: list(raw.nonGoals ?? [], 'nonGoals'),
      authorization: { localWrite, gitWrite: false, remoteWrite: false, productionWrite: false, destructive: false },
      tasks,
      gates
    } };
  } catch (error) {
    return { ok: false, error: { code: 'PLAN_INVALID', message: error instanceof Error ? error.message : String(error) } };
  }
}

function spawnId(roleId: string, agents: TeamOsLiveAgent[], reserved: Set<string>): string {
  for (let index = 1; index <= 99; index++) {
    const candidate = `${roleId}-${index}`;
    if (!agents.some((agent) => agent.id === candidate) && !reserved.has(candidate)) return candidate;
  }
  throw new Error(`unable to allocate an agent id for role ${roleId}`);
}

/** Select only dependency-ready work. Existing idle role instances are reused;
 * concurrent lanes reserve distinct instances and otherwise request a spawn. */
export function allocatePlan(
  plan: TeamOsPlanManifest,
  liveRoster: TeamOsLiveAgent[],
  runtime: TeamOsPlanRuntime
): { phase: TeamOsPlanPhase; decisions: TeamOsAllocationDecision[] } {
  const done = new Set(Object.entries(runtime.tasks).filter(([, state]) => state.status === 'done').map(([taskId]) => taskId));
  if (plan.tasks.every((task) => done.has(task.id))) return { phase: 'completed', decisions: [] };
  if (Object.values(runtime.tasks).some((state) => state.status === 'blocked')) return { phase: 'awaiting-human', decisions: [] };
  if (Object.values(runtime.tasks).some((state) => state.status === 'failed')) return { phase: 'failed', decisions: [] };
  const reserved = new Set(Object.values(runtime.tasks)
    .filter((state) => state.agentId && !['done', 'failed', 'stopped'].includes(state.status))
    .map((state) => state.agentId!));
  const decisions: TeamOsAllocationDecision[] = [];
  const usedByThisPlan = new Set(Object.values(runtime.tasks)
    .map((state) => state.agentId)
    .filter((agentId): agentId is string => !!agentId));
  for (const task of plan.tasks) {
    const state = runtime.tasks[task.id] ?? { status: 'planned' as const };
    if (state.status !== 'planned' || !task.dependsOn.every((dependency) => done.has(dependency))) continue;
    const reusable = liveRoster.find((agent) =>
      !agent.archived && agent.status === 'idle' && agent.role === task.roleId
      && agent.cwd === task.cwd && !reserved.has(agent.id));
    const agentId = reusable?.id ?? spawnId(task.roleId, liveRoster, reserved);
    reserved.add(agentId);
    decisions.push({
      taskId: task.id,
      agentId,
      mode: reusable ? 'reuse' : 'spawn',
      sessionMode: reusable && usedByThisPlan.has(reusable.id) ? 'continue' : 'fresh',
      roleId: task.roleId,
      roleLabel: task.roleLabel,
      cwd: task.cwd,
      ...(reusable?.provider ? { provider: reusable.provider } : {}),
      ...(reusable?.sessionId ? { resumeSessionId: reusable.sessionId } : {})
    });
  }
  const active = Object.values(runtime.tasks).some((state) => state.status === 'doing');
  return { phase: active || decisions.length > 0 ? 'executing' : 'ready', decisions };
}

/** Prompt compiled into Michael's existing queue. It tells the same Session to
 * read project authority and submit one bounded manifest; no second model runs. */
export function buildStartFromConclusionPrompt(args: {
  requestId: string;
  project: TeamOsProjectSnapshot;
  workspaces: TeamOsWorkspace[];
  submitPath: string;
  localWrite: boolean;
  delivery?: 'file' | 'structured';
  roleIds?: string[];
  capabilityProfileIds?: string[];
}): string {
  const references = args.project.references.filter((reference) => reference.exists)
    .map((reference) => `- ${reference.group}.${reference.key}: ${reference.absolutePath}`);
  const workspaceLines = args.workspaces.map((workspace) =>
    `- ${workspace.key}: ${workspace.path} (${workspace.kind}; ${workspace.mode}; ${workspace.directory ? '可用' : '不可用'})`);
  return [
    '# Team OS：按结论开始推进',
    `规划请求：${args.requestId}`,
    `项目：${args.project.name}（${args.project.id}）`,
    `项目根目录：${args.project.root}`,
    '',
    '你仍处于刚才与用户讨论的同一个 Session。以刚才达成的结论为业务意图，不要让用户重新填写工作单。',
    '先实际读取下列项目权威，再形成最小完整计划；不要把文档正文复制进计划：',
    ...references,
    '',
    '可选 workspace（只按需要选择）：',
    ...workspaceLines,
    '',
    `可用职业 roleId：${args.roleIds?.join('、') || '以 Team OS catalog 为准'}`,
    `可用能力画像 capabilityProfileId：${args.capabilityProfileIds?.join('、') || '以 Team OS catalog 为准'}`,
    '',
    args.delivery === 'structured'
      ? '直接返回一个 version=1 的 JSON Plan Manifest；不要自行写 submit.json，Main Process 会原子保存结构化结果。'
      : '输出一个 version=1 的 JSON Plan Manifest，并原子写入：',
    ...(args.delivery === 'structured' ? [] : [
      args.submitPath,
      '可先写同目录临时文件，再 rename；不要在文件中保存 Transcript、密钥或环境秘密。'
    ]),
    '',
    'Manifest 顶层字段：version、requestId、projectId、outcome、nonGoals、authorization、tasks、gates。',
    'authorization 只能是 localWrite=' + String(args.localWrite) + '，且 gitWrite/remoteWrite/productionWrite/destructive 必须全部为 false。',
    '每个 task：id、title、objective、roleId、capabilityProfileIds、workspaceKey、dependsOn、read、write、acceptance、validation、stopConditions、targetMinutes、hardStopMinutes。',
    '路径相对 task workspace 解析；真正并行的 task 写集合必须互斥，同写集合必须通过 dependsOn 串行化。',
    '默认单一端到端 owner；只有能力缺口、可独立验收且写集合互斥时才增加并行角色。',
    'gates 每项包含 id、label、taskIds、evidence。',
    args.delivery === 'structured'
      ? '只返回符合 schema 的 JSON；系统将负责校验、落盘、创建卡片、复用/创建 Agent、Session 和后续 Gate 投影。'
      : '写完后用一句话告诉用户计划已提交；系统将负责校验、创建卡片、复用/创建 Agent、Session、PTY 和后续 Gate 投影。'
  ].join('\n');
}
