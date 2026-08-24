import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SessionCatalogAgent {
  id: string;
  name?: string;
  provider?: string;
  cwd?: string;
  sessionId?: string;
  archived?: boolean;
}

export interface SessionCatalogRecord {
  id: string;
  provider: string;
  agentId: string | null;
  agentName: string | null;
  cwd: string | null;
  updatedAt: number;
  source: 'registry' | 'claude' | 'codex' | 'codex-native' | 'gemini' | 'deepseek';
  resumable: boolean;
  limitation?: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;
const RESUME = new Set(['claude', 'codex', 'gemini', 'deepseek', 'opencode', 'grok', 'antigravity']);

function providerOf(agent: SessionCatalogAgent): string {
  return (agent.provider || 'claude').toLowerCase();
}

function add(out: Map<string, SessionCatalogRecord>, item: SessionCatalogRecord): void {
  if (!ID.test(item.id)) return;
  const key = `${item.provider}:${item.id}`;
  const previous = out.get(key);
  if (!previous || item.updatedAt > previous.updatedAt || (previous.cwd == null && item.cwd != null)) {
    out.set(key, item);
  }
}

/** Read only the first few JSONL records and retain the metadata field `cwd`.
 * Never returns or logs prompt/transcript text. */
function metadataCwd(file: string): string | null {
  try {
    const text = readFileSync(file, { encoding: 'utf8', flag: 'r' }).slice(0, 32_768);
    for (const line of text.split('\n').slice(0, 16)) {
      try {
        const value = JSON.parse(line) as { cwd?: unknown };
        if (typeof value.cwd === 'string' && value.cwd.startsWith('/')) return value.cwd;
      } catch { /* malformed/non-metadata line */ }
    }
  } catch { /* unreadable files are simply not catalogued */ }
  return null;
}

function scan(root: string, provider: string, source: SessionCatalogRecord['source'], out: Map<string, SessionCatalogRecord>, known: Map<string, SessionCatalogAgent>, depth = 0): void {
  if (!root || depth > 5 || !existsSync(root)) return;
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try { entries = readdirSync(root, { withFileTypes: true }) as unknown as typeof entries; } catch { return; }
  for (const entry of entries.slice(0, 2_000)) {
    const file = join(root, entry.name);
    if (entry.isDirectory()) { scan(file, provider, source, out, known, depth + 1); continue; }
    if (!entry.isFile() || !/\.(jsonl|json|db|sqlite)$/i.test(entry.name)) continue;
    const match = entry.name.match(/[0-9a-f]{8,}(?:-[0-9a-f]{4,})*/i);
    if (!match || !ID.test(match[0])) continue;
    let updatedAt = 0;
    try { updatedAt = statSync(file).mtimeMs; } catch { continue; }
    const owner = [...known.values()].find((a) =>
      a.provider && file.includes(join('agents', a.id))
    );
    add(out, {
      id: match[0], provider, agentId: owner?.id ?? null, agentName: owner?.name ?? null,
      cwd: owner?.cwd ?? (source === 'claude' ? metadataCwd(file) : null), updatedAt, source,
      resumable: RESUME.has(provider),
      ...(provider === 'deepseek' ? { limitation: 'DeepSeek 会话枚举依赖其 OpenCode 本地索引；当前仅展示已由 Hive 记录的会话。' } : {})
    });
  }
}

export function listRecentSessions(opts: { harnessHome?: string; agents?: Record<string, SessionCatalogAgent>; limit?: number }): SessionCatalogRecord[] {
  const agents = opts.agents ?? {};
  const known = new Map(Object.values(agents).map((a) => [a.id, a]));
  const out = new Map<string, SessionCatalogRecord>();
  for (const agent of known.values()) {
    const provider = providerOf(agent);
    if (!agent.sessionId) continue;
    add(out, {
      id: agent.sessionId, provider, agentId: agent.id, agentName: agent.name ?? null,
      cwd: agent.cwd ?? null, updatedAt: 0, source: 'registry', resumable: RESUME.has(provider),
      ...(provider === 'gemini' ? { limitation: 'Gemini 仅在其 per-agent GEMINI_CLI_HOME 下可继续。' } : {}),
      ...(provider === 'deepseek' ? { limitation: 'DeepSeek 仅在其 OpenCode per-agent 索引可继续。' } : {})
    });
  }

  const home = homedir();
  scan(join(home, '.claude', 'projects'), 'claude', 'claude', out, known);
  const harness = opts.harnessHome;
  if (harness) {
    for (const agent of known.values()) {
      const root = join(harness, 'hive', 'agents', agent.id);
      const provider = providerOf(agent);
      if (provider === 'codex') scan(join(root, '.codex', 'sessions'), provider, 'codex', out, known);
      else if (provider === 'gemini') scan(join(root, '.gemini'), provider, 'gemini', out, known);
      else if (provider === 'deepseek') scan(join(root, '.config', 'opencode'), provider, 'deepseek', out, known);
    }
  }
  return [...out.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, Math.max(1, Math.min(opts.limit ?? 24, 100)));
}
