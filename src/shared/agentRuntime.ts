export type AgentRuntimeMode = 'codex-native' | 'pty';

export type AgentRuntimeStatus =
  | 'booting'
  | 'idle'
  | 'running'
  | 'awaiting-approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'offline';

export interface RuntimeCapabilities {
  mode: AgentRuntimeMode;
  available: boolean;
  threadStart: boolean;
  threadResume: boolean;
  threadFork: boolean;
  threadList: boolean;
  turnStart: boolean;
  turnSteer: boolean;
  turnInterrupt: boolean;
  approvals: boolean;
  goals: boolean;
  compaction: boolean;
  skills: boolean;
  structuredOutput: boolean;
  sandboxWritableRoots: boolean;
  protocolVersion?: string;
  error?: string;
}

export interface RuntimeUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextWindow?: number;
}

export type RuntimeApprovalKind = 'command' | 'file-change' | 'permissions';

export interface RuntimeApprovalRequest {
  id: string;
  agentId?: string;
  kind: RuntimeApprovalKind;
  title: string;
  detail: string;
  command?: string;
  cwd?: string;
  permissions?: string[];
}

export type RuntimeEvent =
  | { type: 'runtime-status'; status: AgentRuntimeStatus; at: number; detail?: string }
  | { type: 'thread-started'; threadId: string; sessionId?: string; at: number }
  | { type: 'turn-started'; threadId: string; turnId: string; at: number }
  | { type: 'turn-completed'; threadId: string; turnId: string; at: number }
  | { type: 'turn-interrupted'; threadId: string; turnId: string; at: number }
  | { type: 'turn-failed'; threadId: string; turnId: string; message: string; at: number }
  | { type: 'assistant-delta'; text: string; at: number }
  | { type: 'assistant-message'; text: string; at: number }
  | { type: 'reasoning-delta'; text: string; at: number }
  | { type: 'tool-started'; itemId: string; label: string; at: number }
  | { type: 'tool-completed'; itemId: string; label: string; ok: boolean; at: number }
  | { type: 'approval-requested'; request: RuntimeApprovalRequest; at: number }
  | { type: 'usage'; usage: RuntimeUsage; at: number }
  | { type: 'compacted'; threadId: string; at: number }
  | { type: 'instruction-sources'; paths: string[]; at: number }
  | { type: 'warning'; code: string; message: string; at: number };

export interface RuntimeSessionSnapshot {
  agentId: string;
  mode: AgentRuntimeMode;
  status: AgentRuntimeStatus;
  threadId?: string;
  sessionId?: string;
  turnId?: string;
  cwd: string;
  model?: string;
  instructionSources: string[];
  usage?: RuntimeUsage;
  /** Message ids accepted before a process failure whose terminal Turn state
   * could not be reconciled. Content is never persisted here. */
  uncertainDeliveries?: string[];
  lastError?: string;
  updatedAt: number;
}

export interface RuntimeTurnInput {
  text: string;
  messageId: string;
  cwd?: string;
  outputSchema?: unknown;
  skillName?: string;
  skillPath?: string;
}

export function reduceRuntimeSession(
  current: RuntimeSessionSnapshot,
  event: RuntimeEvent
): RuntimeSessionSnapshot {
  const next: RuntimeSessionSnapshot = { ...current, updatedAt: event.at };
  switch (event.type) {
    case 'runtime-status':
      next.status = event.status;
      if (event.status === 'failed' || event.status === 'offline') next.lastError = event.detail;
      return next;
    case 'thread-started':
      return { ...next, threadId: event.threadId, sessionId: event.sessionId ?? next.sessionId, status: 'idle' };
    case 'turn-started':
      return { ...next, threadId: event.threadId, turnId: event.turnId, status: 'running', lastError: undefined };
    case 'turn-completed':
      return { ...next, threadId: event.threadId, turnId: undefined, status: 'idle' };
    case 'turn-interrupted':
      return { ...next, threadId: event.threadId, turnId: undefined, status: 'idle' };
    case 'turn-failed':
      return { ...next, threadId: event.threadId, turnId: undefined, status: 'failed', lastError: event.message };
    case 'approval-requested':
      return { ...next, status: 'awaiting-approval' };
    case 'usage':
      return { ...next, usage: event.usage };
    case 'instruction-sources':
      return { ...next, instructionSources: [...event.paths] };
    default:
      return next;
  }
}
