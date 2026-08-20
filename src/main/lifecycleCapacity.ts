import { lstatSync, readdirSync, type Dirent } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export interface CapacityBudget {
  maxDirectories: number;
  maxFiles: number;
  maxDepth: number;
  maxBytes: number;
}

export interface CapacityMetric {
  files: number;
  bytes: number;
  directories: number;
  partial: boolean;
}

export interface LifecycleCapacitySnapshot {
  format: 1;
  scannedAt: string;
  harnessHome: string;
  budgets: CapacityBudget;
  sessions: CapacityMetric;
  messages: {
    inboxPending: CapacityMetric;
    inboxDone: CapacityMetric;
    outboxPending: CapacityMetric;
    outboxSent: CapacityMetric;
  };
  activityLog: CapacityMetric;
  costLedger: CapacityMetric;
  memory: CapacityMetric;
  worktree: CapacityMetric;
  policy: {
    default: 'retain';
    cleanup: 'manual-only';
    backupBeforeGovernance: true;
    note: string;
  };
}

export interface LifecycleCapacityOptions {
  harnessHome: string;
  /** Provider metadata roots may be supplied by the main process. These are
   * names/paths only; the scanner never reads session or message contents. */
  sessionRoots?: string[];
  worktreeRoot?: string;
  budgets?: Partial<CapacityBudget>;
  now?: number;
}

const DEFAULT_BUDGET: CapacityBudget = {
  maxDirectories: 2_000,
  maxFiles: 10_000,
  maxDepth: 6,
  maxBytes: 256 * 1024 * 1024
};

function metric(): CapacityMetric {
  return { files: 0, bytes: 0, directories: 0, partial: false };
}

function addMetric(target: CapacityMetric, source: CapacityMetric): void {
  target.files += source.files;
  target.bytes += source.bytes;
  target.directories += source.directories;
  target.partial ||= source.partial;
}

function scan(root: string, budget: CapacityBudget, skipDirectories: ReadonlySet<string> = new Set()): CapacityMetric {
  const result = metric();
  let rootStat;
  try { rootStat = lstatSync(root); } catch { return result; }
  if (rootStat.isSymbolicLink()) return result;
  if (rootStat.isFile()) {
    if (rootStat.size <= budget.maxBytes && budget.maxFiles > 0) {
      result.files = 1;
      result.bytes = rootStat.size;
    } else result.partial = true;
    return result;
  }
  if (!rootStat.isDirectory()) return result;
  function visit(directory: string, depth: number): void {
    if (result.partial || depth > budget.maxDepth) {
      result.partial = true;
      return;
    }
    let entries: Dirent[];
    try { entries = readdirSync(directory, { withFileTypes: true, encoding: 'utf8' }); } catch { return; }
    for (const entry of entries) {
      if (result.partial) return;
      const file = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (skipDirectories.has(entry.name)) continue;
        if (result.directories >= budget.maxDirectories) { result.partial = true; return; }
        result.directories++;
        visit(file, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (result.files >= budget.maxFiles) { result.partial = true; return; }
      let stat;
      try { stat = lstatSync(file); } catch { continue; }
      if (!stat.isFile()) continue;
      if (result.bytes + stat.size > budget.maxBytes) { result.partial = true; return; }
      result.files++;
      result.bytes += stat.size;
    }
  }
  visit(root, 0);
  return result;
}

function scanMany(roots: string[], budget: CapacityBudget, skipDirectories: ReadonlySet<string> = new Set()): CapacityMetric {
  const result = metric();
  for (const root of roots) {
    const remaining: CapacityBudget = {
      maxDirectories: Math.max(0, budget.maxDirectories - result.directories),
      maxFiles: Math.max(0, budget.maxFiles - result.files),
      maxDepth: budget.maxDepth,
      maxBytes: Math.max(0, budget.maxBytes - result.bytes)
    };
    addMetric(result, scan(root, remaining, skipDirectories));
    if (result.partial) break;
  }
  return result;
}

function agentRoots(harnessHome: string, limit: number): { roots: string[]; partial: boolean } {
  const agents = join(harnessHome, 'hive', 'agents');
  try {
    const roots = readdirSync(agents, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => join(agents, entry.name));
    return { roots: roots.slice(0, limit), partial: roots.length > limit };
  } catch { return { roots: [], partial: false }; }
}

function categoryRoots(agents: string[], name: string): string[] {
  return agents.map((agent) => join(agent, name));
}

function defaultSessionRoots(agents: string[]): string[] {
  return agents.flatMap((agent) => [
    join(agent, '.claude', 'projects'),
    join(agent, '.codex', 'sessions'),
    join(agent, '.gemini'),
    join(agent, '.config', 'opencode')
  ]);
}

export function snapshotLifecycleCapacity(options: LifecycleCapacityOptions): LifecycleCapacitySnapshot {
  if (!options.harnessHome || !isAbsolute(options.harnessHome)) {
    throw new Error('harnessHome must be an absolute path');
  }
  const budgets = { ...DEFAULT_BUDGET, ...options.budgets };
  for (const [name, value] of Object.entries(budgets)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`invalid capacity budget: ${name}`);
  }
  const agentListing = agentRoots(options.harnessHome, budgets.maxDirectories);
  const agents = agentListing.roots;
  const hive = join(options.harnessHome, 'hive');
  const sessions = scanMany(options.sessionRoots ?? defaultSessionRoots(agents), budgets);
  if (!options.sessionRoots && agentListing.partial) sessions.partial = true;
  const worktree = scan(options.worktreeRoot ?? join(options.harnessHome, 'worktrees'), budgets);
  const messages = {
    inboxPending: scanMany(categoryRoots(agents, 'inbox'), budgets, new Set(['.done'])),
    inboxDone: scanMany(agents.map((agent) => join(agent, 'inbox', '.done')), budgets),
    outboxPending: scanMany(categoryRoots(agents, 'outbox'), budgets, new Set(['.sent'])),
    outboxSent: scanMany(agents.map((agent) => join(agent, 'outbox', '.sent')), budgets)
  };
  if (agentListing.partial) {
    messages.inboxPending.partial = true;
    messages.inboxDone.partial = true;
    messages.outboxPending.partial = true;
    messages.outboxSent.partial = true;
  }
  const memory = scanMany(agents.map((agent) => join(agent, 'memory.md')), budgets);
  if (agentListing.partial) memory.partial = true;
  return {
    format: 1,
    scannedAt: new Date(options.now ?? Date.now()).toISOString(),
    harnessHome: options.harnessHome,
    budgets,
    sessions,
    messages,
    activityLog: scan(join(hive, 'log.jsonl'), budgets),
    costLedger: scan(join(hive, 'cost-ledger.jsonl'), budgets),
    memory,
    worktree,
    policy: {
      default: 'retain',
      cleanup: 'manual-only',
      backupBeforeGovernance: true,
      note: '默认保留；任何治理前先完成可验证备份；本报告不提供删除或定时清理能力。'
    }
  };
}
