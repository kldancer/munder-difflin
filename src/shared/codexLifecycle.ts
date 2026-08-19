import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Codex keeps a rollout and its SQLite index under the same CODEX_HOME. Prefer
 * an indexed home, because copying only a rollout into a fresh home does not
 * make `codex resume` discover it. A rollout-only home remains a compatibility
 * fallback for older layouts.
 */
export function findCodexHomeForSession(
  sessionId: string,
  siblingsRoot: string
): string | null {
  try {
    if (!sessionId || !/^[0-9a-fA-F][0-9a-fA-F-]{15,}$/.test(sessionId)) return null;
    let fallbackHome: string | null = null;
    let agents: Array<{ name: string; isDirectory(): boolean }>;
    try {
      agents = readdirSync(siblingsRoot, { withFileTypes: true }) as unknown as Array<{
        name: string;
        isDirectory(): boolean;
      }>;
    } catch {
      return null;
    }

    for (const agent of agents) {
      if (!agent.isDirectory()) continue;
      const home = join(siblingsRoot, agent.name, '.codex');
      const sessions = join(home, 'sessions');
      if (!existsSync(sessions)) continue;

      const stack = [sessions];
      let hasRollout = false;
      while (stack.length && !hasRollout) {
        const dir = stack.pop() as string;
        let entries: Array<{
          name: string;
          isDirectory(): boolean;
          isFile(): boolean;
        }>;
        try {
          entries = readdirSync(dir, { withFileTypes: true }) as unknown as typeof entries;
        } catch {
          continue;
        }
        for (const entry of entries) {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) stack.push(path);
          else if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.includes(sessionId)) {
            hasRollout = true;
            break;
          }
        }
      }
      if (!hasRollout) continue;

      const id = Buffer.from(sessionId);
      let indexed = false;
      for (const db of ['state_5.sqlite', 'state_5.sqlite-wal']) {
        try {
          if (readFileSync(join(home, db)).includes(id)) {
            indexed = true;
            break;
          }
        } catch {
          // A rollout-only home remains the fallback below.
        }
      }
      if (indexed) return home;
      if (!fallbackHome) fallbackHome = home;
    }
    return fallbackHome;
  } catch {
    return null;
  }
}

/** Keep the session id ahead of Codex's optional positional follow-up prompt. */
export function withCodexResumeArgs(args: string[], sessionId: string): string[] {
  return args[0] === 'resume' ? [...args] : ['resume', sessionId, ...args];
}
