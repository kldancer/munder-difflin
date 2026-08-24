import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  reduceRuntimeSession,
  type RuntimeApprovalRequest,
  type RuntimeEvent,
  type RuntimeSessionSnapshot,
  type RuntimeTurnInput
} from '../shared/agentRuntime';
import { CodexAppServerClient } from './codexAppServer';

type JsonObject = Record<string, unknown>;

interface DeliveryRecord {
  messageId: string;
  state: 'accepted' | 'completed' | 'uncertain' | 'failed';
  turnId?: string;
  updatedAt: number;
}

interface PersistedRuntime {
  version: 1;
  agentId: string;
  threadId?: string;
  sessionId?: string;
  turnId?: string;
  status: RuntimeSessionSnapshot['status'];
  instructionSources: string[];
  deliveries: DeliveryRecord[];
  updatedAt: number;
}

export interface NativeAgentStartOptions {
  agentId: string;
  agentName: string;
  role: string;
  cwd: string;
  agentDir: string;
  command: string;
  /** Test/packaging prefix inserted before the `app-server` subcommand. */
  commandArgs?: string[];
  env: NodeJS.ProcessEnv;
  model?: string;
  resumeThreadId?: string;
  requireResume?: boolean;
  writableRoots: string[];
}

export interface NativeAgentStartResult {
  ok: boolean;
  error?: string;
  resumed?: boolean;
  snapshot?: RuntimeSessionSnapshot;
}

export interface NativeTurnResult {
  ok: boolean;
  error?: string;
  duplicate?: boolean;
  steered?: boolean;
  turnId?: string;
}

interface LiveRuntime {
  client: CodexAppServerClient;
  options: NativeAgentStartOptions;
  snapshot: RuntimeSessionSnapshot;
  deliveries: DeliveryRecord[];
  pendingMessageIds: string[];
  turnOutputs: Map<string, string>;
  restartAttempts: number;
  recovering: boolean;
  stopping: boolean;
}

export interface CodexNativeRuntimeManagerOptions {
  onEvent(agentId: string, event: RuntimeEvent): void;
  onSnapshot?(snapshot: RuntimeSessionSnapshot): void;
  onApproval?(agentId: string, request: RuntimeApprovalRequest): void;
  onTurnOutput?(agentId: string, result: { messageId: string; turnId: string; text: string }): void;
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function valueAt(value: unknown, ...keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    const row = object(current);
    if (!row) return undefined;
    current = row[key];
  }
  return current;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function runtimePath(agentDir: string): string {
  return join(agentDir, 'runtime.json');
}

function readPersisted(agentDir: string): PersistedRuntime | null {
  const path = runtimePath(agentDir);
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as PersistedRuntime;
    return parsed?.version === 1 && Array.isArray(parsed.deliveries) ? parsed : null;
  } catch {
    return null;
  }
}

function atomicWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${randomBytes(2).toString('hex')}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temp, path);
}

function boundedDeliveries(records: DeliveryRecord[]): DeliveryRecord[] {
  return records.slice(-100);
}

export function codexWorkspacePolicy(writableRoots: string[]): JsonObject {
  return {
    type: 'workspaceWrite',
    writableRoots: [...new Set(writableRoots)],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false
  };
}

function threadFacts(response: unknown): {
  threadId?: string;
  sessionId?: string;
  instructionSources: string[];
} {
  const rawSources = valueAt(response, 'instructionSources');
  return {
    threadId: text(valueAt(response, 'thread', 'id')),
    sessionId: text(valueAt(response, 'thread', 'sessionId')),
    instructionSources: Array.isArray(rawSources)
      ? rawSources.filter((entry): entry is string => typeof entry === 'string')
      : []
  };
}

function turnId(response: unknown): string | undefined {
  return text(valueAt(response, 'turn', 'id')) ?? text(valueAt(response, 'turnId'));
}

function turns(response: unknown): JsonObject[] {
  const rows = valueAt(response, 'thread', 'turns');
  return Array.isArray(rows) ? rows.map(object).filter((row): row is JsonObject => !!row) : [];
}

/** One isolated Codex App Server process per visible Codex employee. The ledger
 * stores only ids/state, never prompt or transcript content. */
export class CodexNativeRuntimeManager {
  private live = new Map<string, LiveRuntime>();

  constructor(private readonly options: CodexNativeRuntimeManagerOptions) {}

  has(agentId: string): boolean { return this.live.has(agentId); }

  list(): RuntimeSessionSnapshot[] { return [...this.live.values()].map((entry) => ({ ...entry.snapshot })); }

  snapshot(agentId: string): RuntimeSessionSnapshot | null {
    const entry = this.live.get(agentId);
    return entry ? { ...entry.snapshot } : null;
  }

  /** Read-only diagnostic fact used by bounded runtime probes; never exposed to
   * Renderer or persisted in Hive. */
  processId(agentId: string): number | undefined { return this.live.get(agentId)?.client.processId; }

  async start(options: NativeAgentStartOptions): Promise<NativeAgentStartResult> {
    if (this.live.has(options.agentId)) return { ok: false, error: `native runtime already exists: ${options.agentId}` };
    const persisted = readPersisted(options.agentDir);
    const snapshot: RuntimeSessionSnapshot = {
      agentId: options.agentId,
      mode: 'codex-native',
      status: 'booting',
      cwd: options.cwd,
      model: options.model,
      threadId: options.resumeThreadId ?? persisted?.threadId,
      sessionId: persisted?.sessionId,
      turnId: persisted?.turnId,
      instructionSources: persisted?.instructionSources ?? [],
      updatedAt: Date.now()
    };
    const entry = {} as LiveRuntime;
    const client = this.createClient(options);
    Object.assign(entry, {
      client,
      options,
      snapshot,
      deliveries: boundedDeliveries(persisted?.deliveries ?? []),
      pendingMessageIds: [],
      turnOutputs: new Map(),
      restartAttempts: 0,
      recovering: false,
      stopping: false
    });
    this.live.set(options.agentId, entry);
    this.publish(entry);
    try {
      await client.start();
      const resumeId = options.resumeThreadId ?? persisted?.threadId;
      let response: unknown;
      let resumed = false;
      if (resumeId) {
        try {
          response = await client.threadResume(resumeId, {
            cwd: options.cwd,
            model: options.model,
            approvalPolicy: 'on-request',
            sandbox: 'workspace-write',
            developerInstructions: this.developerInstructions(options)
          });
          resumed = true;
        } catch (error) {
          if (options.requireResume) throw error;
          response = await this.startThread(entry);
        }
      } else response = await this.startThread(entry);
      const facts = threadFacts(response);
      if (!facts.threadId) throw new Error('Codex App Server returned no thread id');
      entry.snapshot = {
        ...entry.snapshot,
        threadId: facts.threadId,
        sessionId: facts.sessionId,
        instructionSources: facts.instructionSources,
        status: 'idle',
        turnId: undefined,
        updatedAt: Date.now()
      };
      if (resumed && snapshot.turnId) this.reconcileTurn(entry, response, snapshot.turnId);
      else this.refreshUncertain(entry);
      this.publish(entry);
      return { ok: true, resumed, snapshot: { ...entry.snapshot } };
    } catch (error) {
      entry.snapshot = {
        ...entry.snapshot,
        status: 'failed',
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: Date.now()
      };
      this.publish(entry);
      await client.stop().catch(() => undefined);
      this.live.delete(options.agentId);
      return { ok: false, error: entry.snapshot.lastError };
    }
  }

  async submit(agentId: string, input: RuntimeTurnInput): Promise<NativeTurnResult> {
    const entry = this.live.get(agentId);
    if (!entry) return { ok: false, error: `native runtime is not running: ${agentId}` };
    const prior = entry.deliveries.find((record) => record.messageId === input.messageId);
    if (prior && prior.state !== 'failed') {
      return { ok: true, duplicate: true, turnId: prior.turnId };
    }
    const threadId = entry.snapshot.threadId;
    if (!threadId) return { ok: false, error: 'native runtime has no active thread' };
    try {
      if (entry.snapshot.turnId && entry.snapshot.status === 'running') {
        if (input.outputSchema !== undefined) {
          return { ok: false, error: 'structured planning must start as a new Turn; wait for the active Turn to finish' };
        }
        const result = await entry.client.turnSteer(threadId, entry.snapshot.turnId, input.text, input.messageId);
        const id = turnId(result) ?? entry.snapshot.turnId;
        this.recordDelivery(entry, { messageId: input.messageId, state: 'accepted', turnId: id, updatedAt: Date.now() });
        return { ok: true, steered: true, turnId: id };
      }
      entry.pendingMessageIds.push(input.messageId);
      const result = await entry.client.turnStart({
        threadId,
        text: input.text,
        clientUserMessageId: input.messageId,
        cwd: input.cwd ?? entry.options.cwd,
        model: entry.options.model,
        approvalPolicy: 'on-request',
        sandboxPolicy: codexWorkspacePolicy(entry.options.writableRoots),
        outputSchema: input.outputSchema,
        skillName: input.skillName,
        skillPath: input.skillPath
      });
      const id = turnId(result);
      this.recordDelivery(entry, { messageId: input.messageId, state: 'accepted', ...(id ? { turnId: id } : {}), updatedAt: Date.now() });
      if (id) {
        entry.snapshot = { ...entry.snapshot, turnId: id, status: 'running', updatedAt: Date.now() };
        this.publish(entry);
      }
      return { ok: true, turnId: id };
    } catch (error) {
      entry.pendingMessageIds = entry.pendingMessageIds.filter((id) => id !== input.messageId);
      this.recordDelivery(entry, {
        messageId: input.messageId,
        state: entry.client.running ? 'failed' : 'uncertain',
        updatedAt: Date.now()
      });
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async interrupt(agentId: string): Promise<{ ok: boolean; error?: string }> {
    const entry = this.live.get(agentId);
    if (!entry?.snapshot.threadId || !entry.snapshot.turnId) return { ok: false, error: 'no active turn' };
    try {
      await entry.client.turnInterrupt(entry.snapshot.threadId, entry.snapshot.turnId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async compact(agentId: string): Promise<{ ok: boolean; error?: string }> {
    const entry = this.live.get(agentId);
    if (!entry?.snapshot.threadId) return { ok: false, error: 'no active thread' };
    try { await entry.client.compact(entry.snapshot.threadId); return { ok: true }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  }

  async newThread(agentId: string): Promise<NativeAgentStartResult> {
    const entry = this.live.get(agentId);
    if (!entry) return { ok: false, error: 'native runtime is not running' };
    if (entry.snapshot.status === 'running' || entry.snapshot.status === 'awaiting-approval') {
      return { ok: false, error: 'cannot create a new thread while a turn is active' };
    }
    try {
      const response = await this.startThread(entry);
      const facts = threadFacts(response);
      if (!facts.threadId) throw new Error('Codex App Server returned no thread id');
      entry.snapshot = {
        ...entry.snapshot,
        threadId: facts.threadId,
        sessionId: facts.sessionId,
        turnId: undefined,
        status: 'idle',
        instructionSources: facts.instructionSources,
        lastError: undefined,
        updatedAt: Date.now()
      };
      this.publish(entry);
      return { ok: true, resumed: false, snapshot: { ...entry.snapshot } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async goal(agentId: string, objective?: string): Promise<unknown> {
    const entry = this.live.get(agentId);
    if (!entry?.snapshot.threadId) throw new Error('no active thread');
    return objective
      ? entry.client.goalStart(entry.snapshot.threadId, objective)
      : entry.client.goalRead(entry.snapshot.threadId);
  }

  async threads(agentId: string, limit = 24): Promise<unknown> {
    const entry = this.live.get(agentId);
    if (!entry) throw new Error('native runtime is not running');
    return entry.client.threadList(limit);
  }

  async readThread(agentId: string, threadId: string): Promise<unknown> {
    const entry = this.live.get(agentId);
    if (!entry) throw new Error('native runtime is not running');
    return entry.client.threadRead(threadId, true);
  }

  async forkThread(agentId: string, threadId: string): Promise<unknown> {
    const entry = this.live.get(agentId);
    if (!entry) throw new Error('native runtime is not running');
    return entry.client.threadFork(threadId, entry.options.cwd);
  }

  async skills(agentId: string): Promise<unknown> {
    const entry = this.live.get(agentId);
    if (!entry) throw new Error('native runtime is not running');
    return entry.client.skillsList([entry.options.cwd]);
  }

  respondApproval(agentId: string, requestId: string, accept: boolean): { ok: boolean; error?: string } {
    const entry = this.live.get(agentId);
    if (!entry) return { ok: false, error: 'native runtime is not running' };
    try {
      entry.client.respondApproval(requestId, accept ? 'accept' : 'decline');
      entry.snapshot = { ...entry.snapshot, status: 'running', updatedAt: Date.now() };
      this.publish(entry);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async stop(agentId: string): Promise<{ ok: boolean; error?: string }> {
    const entry = this.live.get(agentId);
    if (!entry) return { ok: false, error: `no native runtime: ${agentId}` };
    try {
      entry.stopping = true;
      if (entry.snapshot.status === 'running' && entry.snapshot.threadId && entry.snapshot.turnId) {
        await entry.client.turnInterrupt(entry.snapshot.threadId, entry.snapshot.turnId).catch(() => undefined);
      }
      await entry.client.stop();
      entry.snapshot = { ...entry.snapshot, status: 'offline', turnId: undefined, updatedAt: Date.now() };
      this.publish(entry);
      this.live.delete(agentId);
      return { ok: true };
    } catch (error) {
      this.live.delete(agentId);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.live.keys()].map((agentId) => this.stop(agentId)));
  }

  /** Revalidate native transports after the OS resumes. Running processes get a
   * read-only Thread probe; dead transports enter the same bounded, no-replay
   * recovery path used for an observed child-process exit. */
  async resumeAfterWake(): Promise<{ checked: number; recovered: number; failed: number }> {
    let recovered = 0;
    let failed = 0;
    const entries = [...this.live.values()];
    await Promise.all(entries.map(async (entry) => {
      if (entry.stopping) return;
      if (entry.client.running && entry.snapshot.threadId) {
        try {
          await entry.client.threadRead(entry.snapshot.threadId, false);
          return;
        } catch { /* fall through to bounded recovery */ }
      }
      await this.recover(entry);
      if (entry.snapshot.status === 'failed' || entry.snapshot.status === 'offline') failed += 1;
      else recovered += 1;
    }));
    return { checked: entries.length, recovered, failed };
  }

  private async startThread(entry: LiveRuntime): Promise<unknown> {
    return entry.client.threadStart({
      cwd: entry.options.cwd,
      model: entry.options.model,
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      developerInstructions: this.developerInstructions(entry.options)
    });
  }

  private developerInstructions(options: NativeAgentStartOptions): string {
    return `这是 Munder 原生员工 ${options.agentName}（${options.agentId}）的 Thread。遵守 Codex 已加载的分层 AGENTS.md；动态任务只来自当前 Turn，不重复粘贴角色合同。`;
  }

  private receive(agentId: string, event: RuntimeEvent): void {
    const entry = this.live.get(agentId);
    if (!entry) return;
    let effectiveEvent = event;
    if (event.type === 'runtime-status' && event.status === 'offline' && entry.snapshot.turnId && !entry.stopping) {
      const delivery = [...entry.deliveries].reverse().find((record) => record.turnId === entry.snapshot.turnId);
      if (delivery) this.recordDelivery(entry, { ...delivery, state: 'uncertain', updatedAt: event.at });
      effectiveEvent = {
        type: 'runtime-status',
        status: 'blocked',
        detail: 'App Server 已退出，正在恢复并核对上一个回合；不会自动重复提交。',
        at: event.at
      };
    }
    if ((effectiveEvent.type === 'assistant-delta' || effectiveEvent.type === 'assistant-message') && entry.snapshot.turnId) {
      const current = entry.turnOutputs.get(entry.snapshot.turnId) ?? '';
      entry.turnOutputs.set(
        entry.snapshot.turnId,
        (effectiveEvent.type === 'assistant-message' ? effectiveEvent.text : `${current}${effectiveEvent.text}`).slice(-256 * 1024)
      );
    }
    entry.snapshot = reduceRuntimeSession(entry.snapshot, effectiveEvent);
    if (effectiveEvent.type === 'turn-started') {
      const messageId = entry.pendingMessageIds.shift();
      if (messageId) this.recordDelivery(entry, { messageId, state: 'accepted', turnId: effectiveEvent.turnId, updatedAt: effectiveEvent.at });
    } else if (effectiveEvent.type === 'turn-completed' || effectiveEvent.type === 'turn-interrupted') {
      const delivery = [...entry.deliveries].reverse().find((record) => record.turnId === effectiveEvent.turnId);
      if (delivery) this.recordDelivery(entry, { ...delivery, state: 'completed', updatedAt: effectiveEvent.at });
      if (effectiveEvent.type === 'turn-completed' && delivery) {
        this.options.onTurnOutput?.(agentId, {
          messageId: delivery.messageId,
          turnId: effectiveEvent.turnId,
          text: entry.turnOutputs.get(effectiveEvent.turnId) ?? ''
        });
      }
      entry.turnOutputs.delete(effectiveEvent.turnId);
    } else if (effectiveEvent.type === 'turn-failed') {
      const delivery = [...entry.deliveries].reverse().find((record) => record.turnId === effectiveEvent.turnId);
      if (delivery) this.recordDelivery(entry, { ...delivery, state: 'failed', updatedAt: effectiveEvent.at });
      entry.turnOutputs.delete(effectiveEvent.turnId);
    }
    this.refreshUncertain(entry);
    if (!['assistant-delta', 'assistant-message', 'reasoning-delta', 'tool-started', 'tool-completed', 'warning'].includes(effectiveEvent.type)) {
      this.persist(entry);
    }
    this.options.onEvent(agentId, effectiveEvent);
    this.options.onSnapshot?.({ ...entry.snapshot });
    if (event.type === 'runtime-status' && event.status === 'offline' && !entry.stopping && !entry.recovering) {
      void this.recover(entry);
    }
  }

  private recordDelivery(entry: LiveRuntime, record: DeliveryRecord): void {
    entry.deliveries = boundedDeliveries([
      ...entry.deliveries.filter((candidate) => candidate.messageId !== record.messageId),
      record
    ]);
    this.persist(entry);
  }

  private publish(entry: LiveRuntime): void {
    this.persist(entry);
    this.options.onSnapshot?.({ ...entry.snapshot });
  }

  private persist(entry: LiveRuntime): void {
    const value: PersistedRuntime = {
      version: 1,
      agentId: entry.options.agentId,
      threadId: entry.snapshot.threadId,
      sessionId: entry.snapshot.sessionId,
      turnId: entry.snapshot.turnId,
      status: entry.snapshot.status,
      instructionSources: entry.snapshot.instructionSources,
      deliveries: boundedDeliveries(entry.deliveries),
      updatedAt: entry.snapshot.updatedAt
    };
    try { atomicWrite(runtimePath(entry.options.agentDir), value); } catch { /* runtime facts are best-effort */ }
  }

  private createClient(options: NativeAgentStartOptions): CodexAppServerClient {
    return new CodexAppServerClient({
      command: options.command,
      args: options.commandArgs,
      cwd: options.cwd,
      env: options.env,
      requestTimeoutMs: 45_000,
      onEvent: (event) => this.receive(options.agentId, event),
      onApproval: (request) => this.options.onApproval?.(options.agentId, { ...request, agentId: options.agentId }),
      onStderr: () => { /* stderr content is intentionally not retained */ }
    });
  }

  private refreshUncertain(entry: LiveRuntime): void {
    const ids = entry.deliveries.filter((record) => record.state === 'uncertain').map((record) => record.messageId);
    entry.snapshot = { ...entry.snapshot, uncertainDeliveries: ids.length ? ids : undefined };
  }

  private reconcileTurn(entry: LiveRuntime, response: unknown, priorTurnId: string): void {
    const turn = turns(response).find((candidate) => text(candidate.id) === priorTurnId);
    const status = text(turn?.status);
    const delivery = [...entry.deliveries].reverse().find((record) => record.turnId === priorTurnId);
    if (delivery && (status === 'completed' || status === 'interrupted')) {
      this.recordDelivery(entry, { ...delivery, state: 'completed', updatedAt: Date.now() });
      entry.snapshot = { ...entry.snapshot, turnId: undefined, status: 'idle', lastError: undefined };
    } else if (delivery && status === 'failed') {
      this.recordDelivery(entry, { ...delivery, state: 'failed', updatedAt: Date.now() });
      entry.snapshot = { ...entry.snapshot, turnId: undefined, status: 'failed', lastError: '崩溃前回合已失败。' };
    } else {
      if (delivery) this.recordDelivery(entry, { ...delivery, state: 'uncertain', updatedAt: Date.now() });
      entry.snapshot = {
        ...entry.snapshot,
        turnId: priorTurnId,
        status: 'blocked',
        lastError: '崩溃前回合状态无法确认；请查看最近 Session 后决定，不会自动重复提交。'
      };
    }
    this.refreshUncertain(entry);
  }

  private async recover(entry: LiveRuntime): Promise<void> {
    if (entry.recovering || entry.stopping) return;
    if (entry.restartAttempts >= 1) {
      entry.snapshot = {
        ...entry.snapshot,
        status: 'failed',
        lastError: 'App Server 再次退出；请使用逐 Agent PTY 回退或手动重启。',
        updatedAt: Date.now()
      };
      this.publish(entry);
      return;
    }
    entry.recovering = true;
    entry.restartAttempts += 1;
    const priorTurnId = entry.snapshot.turnId;
    try {
      await entry.client.stop().catch(() => undefined);
      entry.client = this.createClient(entry.options);
      await entry.client.start();
      const threadId = entry.snapshot.threadId;
      if (!threadId) throw new Error('no thread id available for recovery');
      const response = await entry.client.threadResume(threadId, {
        cwd: entry.options.cwd,
        model: entry.options.model,
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
        developerInstructions: this.developerInstructions(entry.options)
      });
      const facts = threadFacts(response);
      entry.snapshot = {
        ...entry.snapshot,
        threadId: facts.threadId ?? threadId,
        sessionId: facts.sessionId ?? entry.snapshot.sessionId,
        instructionSources: facts.instructionSources,
        status: 'idle',
        turnId: undefined,
        updatedAt: Date.now()
      };
      if (priorTurnId) this.reconcileTurn(entry, response, priorTurnId);
      else this.refreshUncertain(entry);
      this.publish(entry);
      this.options.onEvent(entry.options.agentId, {
        type: 'runtime-status',
        status: entry.snapshot.status,
        ...(entry.snapshot.lastError ? { detail: entry.snapshot.lastError } : {}),
        at: Date.now()
      });
    } catch (error) {
      entry.snapshot = {
        ...entry.snapshot,
        status: 'failed',
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: Date.now()
      };
      this.publish(entry);
    } finally {
      entry.recovering = false;
    }
  }
}
