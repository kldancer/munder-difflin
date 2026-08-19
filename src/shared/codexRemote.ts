import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type CodexExecutableSource =
  | 'installer-standalone'
  | 'chatgpt-app'
  | 'path-tui'
  | 'unknown';

export interface CodexExecutableProbe {
  executable: string;
  source: CodexExecutableSource;
  remote: {
    eligible: boolean;
    reason?: string;
  };
}

export interface CodexExecutableProbeOptions {
  /** The isolated home that the spawn will give to Codex. */
  codexHome?: string;
  /** Used by tests and by callers before an isolated home exists. */
  standaloneHome?: string;
  pathExists?: (path: string) => boolean;
}

const CHATGPT_APP_CODEX = /(?:^|[\\/])ChatGPT\.app[\\/]Contents[\\/]Resources[\\/]codex(?:\.exe)?$/i;

/**
 * Classify the executable without starting Codex or reading credentials.
 *
 * The standalone installer is identified by its packages payload, not merely
 * by a filename: a PATH/npm Codex binary can run the TUI but cannot be treated
 * as Remote-capable just because it is called `codex`. The per-agent home is
 * checked first because Hive may have linked the user's standalone packages
 * into that isolated home.
 */
export function probeCodexExecutable(
  executable: string,
  options: CodexExecutableProbeOptions = {}
): CodexExecutableProbe {
  const path = executable.trim();
  if (!path) {
    return {
      executable: path,
      source: 'unknown',
      remote: { eligible: false, reason: 'Codex executable is empty; choose a Codex binary before spawning.' }
    };
  }

  if (CHATGPT_APP_CODEX.test(path)) {
    return {
      executable: path,
      source: 'chatgpt-app',
      remote: {
        eligible: false,
        reason: 'ChatGPT App 内置 Codex 仅提供本地 TUI；如需 Remote，请安装 standalone Codex，并确保其 CODEX_HOME/packages 存在。'
      }
    };
  }

  const pathExists = options.pathExists ?? existsSync;
  const homes = [options.codexHome, options.standaloneHome].filter(
    (home): home is string => Boolean(home)
  );
  const packagesHome = homes.find((home) => pathExists(join(home, 'packages')));
  const standaloneHome = options.standaloneHome;
  const isStandalonePath = Boolean(
    standaloneHome &&
    (path === join(standaloneHome, 'codex') ||
      path.startsWith(`${join(standaloneHome, 'bin')}/`) ||
      path.startsWith(`${join(standaloneHome, 'bin')}\\`))
  );
  if (packagesHome || isStandalonePath) {
    return {
      executable: path,
      source: 'installer-standalone',
      remote: packagesHome
        ? { eligible: true }
        : {
            eligible: false,
            reason: `standalone Codex (${path}) 缺少 CODEX_HOME/packages；Remote 已跳过。修复 standalone 安装或继续使用本地 TUI。`
          }
    };
  }

  return {
    executable: path,
    source: 'path-tui',
    remote: {
      eligible: false,
      reason: `PATH Codex (${path}) 可启动本地 TUI，但未发现 standalone CODEX_HOME/packages；Remote 已跳过。请安装 standalone Codex 或继续使用 TUI。`
    }
  };
}

export const CODEX_REMOTE_SOCKET_RELATIVE =
  'app-server-control/app-server-control.sock';

/** macOS caps a Unix socket path at 104 bytes (`sun_path`), and Codex builds its
 *  control socket as `$CODEX_HOME/app-server-control/app-server-control.sock` —
 *  42 bytes of suffix. So the alias home itself must fit in ~61 bytes.
 *
 *  `$TMPDIR` cannot host it: macOS spells it
 *  `/var/folders/xx/<30-char-hash>/T/` (49 bytes) and the alias came out at 121
 *  — LONGER than the 118-byte real home it was introduced to shorten, so every
 *  daemon start failed with `path must be shorter than SUN_LEN`. Root the alias
 *  at a fixed short prefix instead and keep the digest to 8 hex chars: the whole
 *  socket path then lands at 60 bytes with room to spare. */
export const CODEX_REMOTE_ALIAS_ROOT = '/tmp/mdc';

/** Longest socket path the platform will accept, minus a small safety margin. */
export const CODEX_REMOTE_SOCKET_MAX = 104;

/** Keep the CODEX_HOME spelling short enough for macOS's Unix-socket limit.
 *  `tempRoot` defaults to the short fixed root; callers may override it (tests). */
export function codexRemoteAliasPath(
  realHome: string,
  agentId: string,
  tempRoot: string = CODEX_REMOTE_ALIAS_ROOT
): string {
  const digest = createHash('sha256')
    .update(`${realHome}\0${agentId}`)
    .digest('hex')
    .slice(0, 8);
  return join(tempRoot, digest);
}

/** Whether a candidate home yields a control socket the platform can bind. */
export function codexRemoteSocketFits(shortHome: string): boolean {
  return join(shortHome, CODEX_REMOTE_SOCKET_RELATIVE).length < CODEX_REMOTE_SOCKET_MAX;
}

export function codexRemoteEndpoint(shortHome: string): string {
  return `unix://${join(shortHome, CODEX_REMOTE_SOCKET_RELATIVE)}`;
}

/** Global options must precede `resume`, so prepend the endpoint in all cases. */
export function withCodexRemoteArgs(args: string[], endpoint: string): string[] {
  if (args.includes('--remote')) return args;
  return ['--remote', endpoint, ...args];
}
