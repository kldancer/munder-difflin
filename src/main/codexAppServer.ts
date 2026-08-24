import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface as ReadLineInterface } from 'node:readline';
import type {
  AgentRuntimeStatus,
  RuntimeApprovalRequest,
  RuntimeCapabilities,
  RuntimeEvent,
  RuntimeUsage
} from '../shared/agentRuntime';

type JsonObject = Record<string, unknown>;

export interface CodexAppServerOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
  clientName?: string;
  clientVersion?: string;
  onEvent?: (event: RuntimeEvent) => void;
  onApproval?: (request: RuntimeApprovalRequest) => void;
  onStderr?: (level: 'warning') => void;
  spawnProcess?: typeof spawn;
}

interface PendingRequest {
  method: string;
  timer: NodeJS.Timeout;
  resolve(value: unknown): void;
  reject(error: Error): void;
}

interface PendingApproval {
  kind: RuntimeApprovalRequest['kind'];
  wireId: string | number;
  requestedPermissions?: JsonObject;
}

export interface CodexThreadStartOptions {
  cwd: string;
  model?: string;
  modelProvider?: string;
  approvalPolicy?: unknown;
  sandbox?: unknown;
  config?: JsonObject;
  baseInstructions?: string;
  developerInstructions?: string;
  personality?: string;
  ephemeral?: boolean;
}

export interface CodexTurnStartOptions {
  threadId: string;
  text: string;
  clientUserMessageId: string;
  cwd?: string;
  model?: string;
  effort?: string;
  approvalPolicy?: unknown;
  sandboxPolicy?: unknown;
  outputSchema?: unknown;
  skillName?: string;
  skillPath?: string;
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nested(value: unknown, ...keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    const row = object(current);
    if (!row) return undefined;
    current = row[key];
  }
  return current;
}

function approvalKind(method: string): RuntimeApprovalRequest['kind'] | null {
  if (method === 'item/commandExecution/requestApproval') return 'command';
  if (method === 'item/fileChange/requestApproval') return 'file-change';
  if (method === 'item/permissions/requestApproval') return 'permissions';
  return null;
}

function approvalRequest(id: string, method: string, params: unknown): RuntimeApprovalRequest | null {
  const kind = approvalKind(method);
  const p = object(params);
  if (!kind || !p) return null;
  const command = string(p.command) ?? string(nested(p, 'command', 'command'));
  const cwd = string(p.cwd) ?? string(nested(p, 'command', 'cwd'));
  const rawPermissions = object(p.permissions);
  const network = object(rawPermissions?.network);
  const fileSystem = object(rawPermissions?.fileSystem);
  const permissions = [
    network ? `网络：${network.enabled === true ? '启用' : network.enabled === false ? '禁用' : '按请求'}` : undefined,
    fileSystem ? '额外文件系统范围' : undefined
  ].filter((entry): entry is string => !!entry);
  const reason = string(p.reason) ?? string(p.description) ?? string(p.message);
  const title = kind === 'command'
    ? 'Codex 请求执行命令'
    : kind === 'file-change'
      ? 'Codex 请求修改文件'
      : 'Codex 请求额外权限';
  return {
    id,
    kind,
    title,
    detail: reason ?? command ?? (permissions.join('，') || '请确认本次运行请求。'),
    ...(command ? { command } : {}),
    ...(cwd ? { cwd } : {}),
    ...(permissions.length ? { permissions } : {})
  };
}

function usageFrom(params: unknown): RuntimeUsage | null {
  const usageEnvelope = object(nested(params, 'tokenUsage'))
    ?? object(nested(params, 'usage'))
    ?? object(params);
  const source = object(usageEnvelope?.total) ?? usageEnvelope;
  if (!source) return null;
  const usage: RuntimeUsage = {
    inputTokens: number(source.inputTokens) ?? number(source.input_tokens),
    cachedInputTokens: number(source.cachedInputTokens) ?? number(source.cached_input_tokens),
    outputTokens: number(source.outputTokens) ?? number(source.output_tokens),
    totalTokens: number(source.totalTokens) ?? number(source.total_tokens),
    contextWindow: number(usageEnvelope?.modelContextWindow)
      ?? number(usageEnvelope?.contextWindow)
      ?? number(source.contextWindow)
      ?? number(source.context_window)
  };
  return Object.values(usage).some((value) => value !== undefined) ? usage : null;
}

function itemLabel(item: JsonObject | null): string {
  if (!item) return '工具';
  const type = string(item.type) ?? 'tool';
  return string(item.name) ?? string(item.command) ?? string(item.path) ?? type;
}

const TOOL_ITEM_TYPES = new Set([
  'collabAgentToolCall',
  'commandExecution',
  'dynamicToolCall',
  'fileChange',
  'imageGeneration',
  'imageView',
  'mcpToolCall',
  'subAgentActivity',
  'webSearch'
]);

const KNOWN_NON_RUNTIME_NOTIFICATIONS = new Set([
  'account/rateLimits/updated',
  'mcpServer/startupStatus/updated',
  'remoteControl/status/changed',
  'serverRequest/resolved',
  'thread/goal/cleared',
  'thread/goal/updated',
  'thread/name/updated',
  'thread/settings/updated'
]);

function isKnownNonRuntimeNotification(method: string): boolean {
  return method === 'item/started'
    || method === 'item/completed'
    || KNOWN_NON_RUNTIME_NOTIFICATIONS.has(method);
}

/** Convert unstable App Server notifications into the small runtime vocabulary
 * owned by Munder. Unknown notifications are deliberately non-fatal. */
export function normalizeCodexNotification(method: string, params: unknown, at = Date.now()): RuntimeEvent[] {
  const p = object(params) ?? {};
  const threadId = string(p.threadId) ?? string(nested(p, 'thread', 'id'));
  const turnId = string(p.turnId) ?? string(nested(p, 'turn', 'id'));
  const item = object(p.item);
  const itemId = string(p.itemId) ?? string(item?.id) ?? 'unknown';
  const out: RuntimeEvent[] = [];

  if (method === 'thread/started' && threadId) {
    out.push({ type: 'thread-started', threadId, sessionId: string(nested(p, 'thread', 'sessionId')), at });
    const sources = nested(p, 'thread', 'instructionSources');
    if (Array.isArray(sources)) {
      const paths = sources.map((entry) => string(object(entry)?.path) ?? string(entry)).filter((entry): entry is string => !!entry);
      if (paths.length) out.push({ type: 'instruction-sources', paths, at });
    }
  } else if (method === 'thread/status/changed') {
    const raw = string(p.status) ?? string(nested(p, 'status', 'type'));
    const status: AgentRuntimeStatus = raw === 'active' ? 'running' : raw === 'idle' ? 'idle' : raw === 'systemError' ? 'failed' : 'offline';
    out.push({ type: 'runtime-status', status, at, ...(raw ? { detail: raw } : {}) });
  } else if (method === 'turn/started' && threadId && turnId) {
    out.push({ type: 'turn-started', threadId, turnId, at });
    out.push({ type: 'runtime-status', status: 'running', at });
  } else if (method === 'turn/completed' && threadId && turnId) {
    const rawStatus = string(nested(p, 'turn', 'status')) ?? string(p.status) ?? 'completed';
    const completedItems = nested(p, 'turn', 'items');
    if (Array.isArray(completedItems)) {
      const finalMessage = [...completedItems].reverse()
        .map(object)
        .find((candidate) => string(candidate?.type) === 'agentMessage' && string(candidate?.text));
      if (finalMessage) out.push({ type: 'assistant-message', text: string(finalMessage.text)!, at });
    }
    if (rawStatus === 'interrupted') out.push({ type: 'turn-interrupted', threadId, turnId, at });
    else if (rawStatus === 'failed') {
      out.push({
        type: 'turn-failed', threadId, turnId,
        message: string(nested(p, 'turn', 'error', 'message')) ?? string(nested(p, 'error', 'message')) ?? string(p.error) ?? 'Codex turn failed',
        at
      });
    } else out.push({ type: 'turn-completed', threadId, turnId, at });
    out.push({ type: 'runtime-status', status: rawStatus === 'failed' ? 'failed' : 'idle', at, detail: rawStatus });
  } else if (method.endsWith('/delta')) {
    const delta = string(p.delta) ?? string(p.text) ?? string(nested(p, 'delta', 'text'));
    if (delta) {
      out.push(method.includes('reasoning')
        ? { type: 'reasoning-delta', text: delta, at }
        : { type: 'assistant-delta', text: delta, at });
    }
  } else if (method === 'item/started') {
    if (item && TOOL_ITEM_TYPES.has(string(item.type) ?? '')) {
      out.push({ type: 'tool-started', itemId, label: itemLabel(item), at });
    }
  } else if (method === 'item/completed') {
    if (item && string(item.type) === 'contextCompaction' && threadId) {
      out.push({ type: 'compacted', threadId, at });
    } else if (item && string(item.type) === 'agentMessage' && string(item.text)) {
      out.push({ type: 'assistant-message', text: string(item.text)!, at });
    } else if (item && TOOL_ITEM_TYPES.has(string(item.type) ?? '')) {
      const raw = string(item.status) ?? string(p.status);
      out.push({ type: 'tool-completed', itemId, label: itemLabel(item), ok: raw !== 'failed', at });
    }
  } else if (method.includes('tokenUsage')) {
    const usage = usageFrom(params);
    if (usage) out.push({ type: 'usage', usage, at });
  } else if (method === 'thread/compacted' && threadId) {
    out.push({ type: 'compacted', threadId, at });
  } else if (method === 'error') {
    out.push({
      type: 'warning', code: nested(p, 'willRetry') === true ? 'CODEX_RETRYING' : 'CODEX_ERROR',
      message: string(nested(p, 'error', 'message')) ?? 'Codex runtime error', at
    });
  }
  return out;
}

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private lines: ReadLineInterface | null = null;
  private nextId = 1;
  private pending = new Map<string, PendingRequest>();
  private approvals = new Map<string, PendingApproval>();
  private stopped = false;
  private initialized = false;
  private exitPromise: Promise<void> | null = null;
  private resolveExit: (() => void) | null = null;

  constructor(private readonly options: CodexAppServerOptions) {}

  get running(): boolean { return this.child !== null && this.child.exitCode === null && !this.stopped; }
  get processId(): number | undefined { return this.child?.pid; }

  async start(): Promise<RuntimeCapabilities> {
    if (this.running && this.initialized) return this.capabilities();
    this.stopped = false;
    const spawnProcess = this.options.spawnProcess ?? spawn;
    this.child = spawnProcess(this.options.command, [...(this.options.args ?? []), 'app-server'], {
      cwd: this.options.cwd,
      env: this.options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    }) as ChildProcessWithoutNullStreams;
    const child = this.child;
    this.exitPromise = new Promise<void>((resolve) => { this.resolveExit = resolve; });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    this.lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.lines.on('line', (line) => this.handleLine(line));
    child.stderr.on('data', () => this.options.onStderr?.('warning'));
    child.once('error', (error) => this.handleExit(error));
    child.once('exit', (code, signal) => this.handleExit(
      this.stopped ? undefined : new Error(`Codex App Server exited (${code ?? signal ?? 'unknown'})`)
    ));
    try {
      await this.request('initialize', {
        clientInfo: {
          name: this.options.clientName ?? 'munder-difflin',
          title: 'Munder Difflin',
          version: this.options.clientVersion ?? '0.4.4'
        },
        capabilities: { experimentalApi: true, requestAttestation: false }
      });
      this.notify('initialized');
      this.initialized = true;
      this.emit({ type: 'runtime-status', status: 'idle', at: Date.now() });
      return this.capabilities();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  capabilities(): RuntimeCapabilities {
    return {
      mode: 'codex-native',
      available: this.running && this.initialized,
      threadStart: true,
      threadResume: true,
      threadFork: true,
      threadList: true,
      turnStart: true,
      turnSteer: true,
      turnInterrupt: true,
      approvals: true,
      goals: true,
      compaction: true,
      skills: true,
      structuredOutput: true,
      sandboxWritableRoots: true
    };
  }

  request(method: string, params: unknown = {}): Promise<unknown> {
    const child = this.child;
    if (!child || child.exitCode !== null || this.stopped) return Promise.reject(new Error('Codex App Server is not running'));
    const id = String(this.nextId++);
    const timeoutMs = this.options.requestTimeoutMs ?? 30_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { method, timer, resolve, reject });
      child.stdin.write(`${JSON.stringify({ method, id, params })}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(error);
      });
    });
  }

  notify(method: string, params?: unknown): void {
    const child = this.child;
    if (!child || child.exitCode !== null || this.stopped) throw new Error('Codex App Server is not running');
    child.stdin.write(`${JSON.stringify({ method, ...(params === undefined ? {} : { params }) })}\n`);
  }

  threadStart(options: CodexThreadStartOptions): Promise<unknown> {
    return this.request('thread/start', options);
  }

  threadResume(threadId: string, options: Omit<CodexThreadStartOptions, 'cwd'> & { cwd?: string } = {}): Promise<unknown> {
    return this.request('thread/resume', { threadId, ...options });
  }

  threadFork(threadId: string, cwd?: string): Promise<unknown> {
    return this.request('thread/fork', { threadId, ...(cwd ? { cwd } : {}) });
  }

  threadList(limit = 24, cursor?: string): Promise<unknown> {
    return this.request('thread/list', { limit, ...(cursor ? { cursor } : {}) });
  }

  threadRead(threadId: string, includeTurns = true): Promise<unknown> {
    return this.request('thread/read', { threadId, includeTurns });
  }

  turnStart(options: CodexTurnStartOptions): Promise<unknown> {
    const input: JsonObject[] = [{ type: 'text', text: options.text, text_elements: [] }];
    if (options.skillName && options.skillPath) {
      input.unshift({ type: 'skill', name: options.skillName, path: options.skillPath });
    }
    return this.request('turn/start', {
      threadId: options.threadId,
      clientUserMessageId: options.clientUserMessageId,
      input,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort } : {}),
      ...(options.approvalPolicy !== undefined ? { approvalPolicy: options.approvalPolicy } : {}),
      ...(options.sandboxPolicy !== undefined ? { sandboxPolicy: options.sandboxPolicy } : {}),
      ...(options.outputSchema !== undefined ? { outputSchema: options.outputSchema } : {})
    });
  }

  turnSteer(threadId: string, turnId: string, text: string, clientUserMessageId: string): Promise<unknown> {
    return this.request('turn/steer', {
      threadId,
      expectedTurnId: turnId,
      clientUserMessageId,
      input: [{ type: 'text', text, text_elements: [] }]
    });
  }

  turnInterrupt(threadId: string, turnId: string): Promise<unknown> {
    return this.request('turn/interrupt', { threadId, turnId });
  }

  compact(threadId: string): Promise<unknown> {
    return this.request('thread/compact/start', { threadId });
  }

  goalRead(threadId: string): Promise<unknown> {
    return this.request('thread/goal/get', { threadId });
  }

  goalStart(threadId: string, objective: string): Promise<unknown> {
    return this.request('thread/goal/set', { threadId, objective, status: 'active' });
  }

  skillsList(cwds: string[]): Promise<unknown> {
    return this.request('skills/list', { cwds });
  }

  respondApproval(requestId: string, decision: 'accept' | 'decline'): void {
    const child = this.child;
    if (!child || child.exitCode !== null || this.stopped) throw new Error('Codex App Server is not running');
    const pending = this.approvals.get(requestId);
    if (!pending) throw new Error(`unknown approval request: ${requestId}`);
    this.approvals.delete(requestId);
    const result = pending.kind === 'permissions'
      ? {
          permissions: decision === 'accept'
            ? this.grantedPermissions(pending.requestedPermissions)
            : {},
          scope: 'turn'
        }
      : { decision };
    child.stdin.write(`${JSON.stringify({ id: pending.wireId, result })}\n`);
  }

  async stop(timeoutMs = 2_000): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.stopped = true;
    this.initialized = false;
    try { child.stdin.end(); } catch { /* already closed */ }
    try { child.kill('SIGTERM'); } catch { /* already exited */ }
    const exited = this.exitPromise ?? Promise.resolve();
    let timer: NodeJS.Timeout | null = null;
    await Promise.race([
      exited,
      new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); })
    ]);
    if (timer) clearTimeout(timer);
    if (child.exitCode === null) {
      try { child.kill('SIGKILL'); } catch { /* already exited */ }
    }
    this.handleExit();
  }

  private handleLine(line: string): void {
    let message: JsonObject;
    try {
      const parsed = JSON.parse(line);
      const row = object(parsed);
      if (!row) throw new Error('protocol line is not an object');
      message = row;
    } catch {
      const error = new Error('Codex App Server emitted invalid JSON on stdout');
      this.emit({ type: 'warning', code: 'INVALID_STDOUT_JSON', message: error.message, at: Date.now() });
      this.failPending(error);
      return;
    }
    const id = message.id === undefined ? undefined : String(message.id);
    if (id && this.pending.has(id) && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) {
      const pending = this.pending.get(id)!;
      clearTimeout(pending.timer);
      this.pending.delete(id);
      if (Object.hasOwn(message, 'error')) {
        const error = object(message.error);
        pending.reject(new Error(string(error?.message) ?? `${pending.method} failed`));
      } else pending.resolve(message.result);
      return;
    }
    const method = string(message.method);
    if (!method) return;
    if (id) {
      const approval = approvalRequest(id, method, message.params);
      if (approval) {
        const row = object(message.params);
        this.approvals.set(id, {
          kind: approval.kind,
          wireId: typeof message.id === 'number' ? message.id : id,
          ...(approval.kind === 'permissions' && object(row?.permissions)
            ? { requestedPermissions: object(row?.permissions)! }
            : {})
        });
        this.emit({ type: 'runtime-status', status: 'awaiting-approval', at: Date.now() });
        this.emit({ type: 'approval-requested', request: approval, at: Date.now() });
        this.options.onApproval?.(approval);
        return;
      }
    }
    const events = normalizeCodexNotification(method, message.params);
    if (!events.length) {
      if (isKnownNonRuntimeNotification(method)) return;
      this.emit({ type: 'warning', code: 'UNKNOWN_NOTIFICATION', message: method, at: Date.now() });
      return;
    }
    for (const event of events) this.emit(event);
  }

  private emit(event: RuntimeEvent): void {
    this.options.onEvent?.(event);
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.approvals.clear();
  }

  private grantedPermissions(requested: JsonObject | undefined): JsonObject {
    if (!requested) return {};
    const network = object(requested.network);
    const fileSystem = object(requested.fileSystem);
    return {
      ...(network ? { network } : {}),
      ...(fileSystem ? { fileSystem } : {})
    };
  }

  private handleExit(error?: Error): void {
    if (error) {
      this.failPending(error);
      this.emit({ type: 'runtime-status', status: 'offline', detail: error.message, at: Date.now() });
    }
    this.lines?.close();
    this.lines = null;
    this.child = null;
    this.initialized = false;
    this.resolveExit?.();
    this.resolveExit = null;
  }
}
