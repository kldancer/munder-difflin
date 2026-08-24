'use strict';

/**
 * Hooks run under `/bin/sh` with a bare PATH (`/usr/bin:/bin:…`). A hook command
 * of `node "<shim>"` therefore exits 127 — "node: command not found" — on every
 * machine where node lives in a shell-managed prefix (nvm, volta, Homebrew).
 *
 * The fix is `<hive>/bin/hive-node`: a one-line wrapper around Electron's OWN
 * bundled node (`ELECTRON_RUN_AS_NODE=1 exec "<execPath>"`). Every hook installer
 * must route through it.
 *
 * A wrapper SCRIPT rather than an inline `ELECTRON_RUN_AS_NODE=1 "<exe>" …`
 * prefix, because that prefix is POSIX-sh syntax and a hard error under cmd.exe —
 * which is what runs hook commands on Windows.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const toml = require('toml');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

const POSIX = process.platform !== 'win32';
const STRIPPED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-hive-node-'));
}

const launcherIn = (home) =>
  path.join(home, 'hive', 'bin', POSIX ? 'hive-node' : 'hive-node.cmd');

/** Every file under `dir`. */
function walk(dir, out = []) {
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Sweep every config an installer wrote for commands that invoke one of our
 *  shims. Path-agnostic on purpose, so a new installer cannot be missed. */
function hookCommandsUnder(home) {
  const shim = /(cth-hook\.cjs|agy-hook\.cjs|gemini-hook\.cjs|grok-hook\.cjs)/;
  const found = [];
  for (const file of walk(home)) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!shim.test(text)) continue;
    // JSON hook configs: "command": "<…>"      TOML (codex): command = '<…>'
    for (const m of text.matchAll(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) found.push(JSON.parse(`"${m[1]}"`));
    for (const m of text.matchAll(/command = '([^']+)'/g)) found.push(m[1]);
  }
  return found.filter((c) => shim.test(c));
}

const usesLauncher = (cmd, launcher) => cmd.startsWith(launcher) || cmd.startsWith(`"${launcher}"`);

async function run(cmd, env) {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', cmd], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdin.end(JSON.stringify({ hook_event_name: 'Stop', session_id: 's1' }));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

async function runHook(cmd, env, input) {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', cmd], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdin.end(JSON.stringify(input));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('official Gemini gets an isolated home and translated lifecycle hooks', { skip: !POSIX }, async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  const injection = await hive.ensureAgent({ id: 'gem-1', name: 'Gem', provider: 'gemini', cwd: home });

  const geminiHome = path.join(home, 'hive/agents/gem-1/.gemini-cli');
  assert.equal(injection.env.GEMINI_CLI_HOME, geminiHome);
  assert.deepEqual(injection.args.slice(0, 1), ['--prompt-interactive']);
  const settings = JSON.parse(fs.readFileSync(path.join(geminiHome, '.gemini/settings.json'), 'utf8'));
  for (const event of ['BeforeTool', 'AfterTool', 'BeforeAgent', 'AfterAgent', 'SessionStart', 'SessionEnd', 'PreCompress', 'Notification']) {
    assert.ok(Array.isArray(settings.hooks[event]), `missing ${event}`);
  }
  assert.match(settings.hooks.BeforeTool[0].hooks[0].command, /gemini-hook\.cjs" BeforeTool$/);
  assert.equal(usesLauncher(settings.hooks.BeforeTool[0].hooks[0].command, launcherIn(home)), true);

  const sock = path.join(home, 'hive', 'hooks.sock');
  try { fs.unlinkSync(sock); } catch { /* absent */ }
  const seen = [];
  const server = net.createServer((conn) => {
    let buf = '';
    conn.on('data', (d) => {
      buf += d;
      if (!buf.includes('\n')) return;
      seen.push(JSON.parse(buf.trim()));
      conn.end(JSON.stringify({
        hookSpecificOutput: {
          permissionDecision: 'deny',
          permissionDecisionReason: '测试拒绝'
        }
      }));
    });
  });
  await new Promise((resolve) => server.listen(sock, resolve));
  t.after(() => server.close());

  const result = await runHook(settings.hooks.BeforeTool[0].hooks[0].command, {
    PATH: STRIPPED_PATH, HIVE_SOCK: sock, AGENT_ID: 'gem-1', HOME: home
  }, { session_id: 'gem-session', cwd: home, tool_name: 'run_shell_command', tool_input: { command: 'pwd' } });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { decision: 'deny', reason: '测试拒绝' });
  assert.equal(seen[0].hook_event_name, 'PreToolUse');
  assert.equal(seen[0].session_id, 'gem-session');
});

test('ensureHive writes an executable bundled-node launcher', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  const launcher = launcherIn(home);
  assert.equal(fs.existsSync(launcher), true);
  const body = fs.readFileSync(launcher, 'utf8');
  assert.match(body, /ELECTRON_RUN_AS_NODE=1/, 'without this the binary opens a second app window');
  assert.ok(body.includes(process.execPath), 'execPath is re-baked each bootstrap so an app move/update heals');
  if (POSIX) assert.ok(fs.statSync(launcher).mode & 0o111, 'must be executable');
});

test('the claude hook + statusLine commands run through the launcher', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  const launcher = launcherIn(home);
  const settings = JSON.parse(fs.readFileSync(path.join(home, 'hive/agents/a1/settings.json'), 'utf8'));
  const commands = [
    ...Object.values(settings.hooks).flatMap((matchers) => matchers.flatMap((m) => m.hooks.map((h) => h.command))),
    settings.statusLine.command
  ];

  assert.ok(commands.length > 0);
  for (const cmd of commands) assert.equal(usesLauncher(cmd, launcher), true, cmd);
});

test('every hook installer routes through the launcher — none left on bare node', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  const agentIgnore = fs.readFileSync(path.join(home, 'hive/agents/a1/.gitignore'), 'utf8');
  assert.match(agentIgnore, /^\.codex\/$/m, 'per-agent Codex credentials/runtime must stay out of hive git');
  assert.match(agentIgnore, /^runtime\.json$/m, 'native Thread/Turn recovery churn must stay out of hive git and memory mining');

  // A pre-migration Hive may already track runtime.json. The app must preserve
  // the recovery file while removing it from the internal Git index.
  const runtimeIndex = path.join(home, 'hive/agents/a1/runtime.json');
  fs.writeFileSync(runtimeIndex, '{"version":1}\n');
  execFileSync('git', ['add', '-f', 'agents/a1/runtime.json'], { cwd: path.join(home, 'hive') });
  execFileSync('git', ['commit', '-q', '-m', 'legacy runtime index'], { cwd: path.join(home, 'hive') });
  hive.ensureHive();
  hive.commit('migrate runtime index');
  assert.equal(fs.existsSync(runtimeIndex), true, 'migration must not delete the recovery file');
  assert.equal(execFileSync('git', ['ls-files', 'agents/a1/runtime.json'], {
    cwd: path.join(home, 'hive'), encoding: 'utf8'
  }).trim(), '');

  // agy and grok install into the USER's home. Redirect it, and refuse to run
  // rather than write into the developer's real ~/.gemini / ~/.grok.
  const realHome = process.env.HOME;
  const realProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(() => {
    if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
    if (realProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = realProfile;
  });
  assert.equal(os.homedir(), home, 'home redirect failed — aborting before touching the real home');

  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(home, '.codex/auth.json'), '{"testOnly":true}\n', 'utf8');
  fs.writeFileSync(path.join(home, '.codex/config.toml'), [
    'model = "gpt-5.6-sol"',
    `[projects.${JSON.stringify(path.join(home, 'preserved-project'))}]`,
    'trust_level = "untrusted"',
    `[projects.${JSON.stringify(path.join(home, 'second-project'))}]`,
    'trust_level = "trusted"'
  ].join('\n'), 'utf8');

  const project = path.join(home, 'project');
  fs.mkdirSync(project, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: project });

  hive.installAgyHooks();
  hive.installGrokHooks();
  const agentDir = path.join(home, 'hive/agents/a1');
  const codexMeta = { id: 'a1', name: 'A', provider: 'codex', cwd: project, replyLanguage: 'zh-CN' };
  const codexHome = hive.installCodexHooks(agentDir, codexMeta, path.join(home, 'hive'), project, true);

  const sharedCatalog = path.join(home, 'hive/cache/codex/remote_plugin_catalog');
  const agentCatalog = path.join(codexHome, 'cache/remote_plugin_catalog');
  assert.equal(fs.lstatSync(agentCatalog).isSymbolicLink(), POSIX,
    'POSIX agents should link the public catalog instead of duplicating it');
  assert.equal(fs.realpathSync(agentCatalog), fs.realpathSync(sharedCatalog));
  const sharedPluginCache = path.join(home, 'hive/cache/codex/plugins');
  const agentPluginCache = path.join(codexHome, 'plugins/cache');
  assert.equal(fs.lstatSync(agentPluginCache).isSymbolicLink(), POSIX,
    'POSIX agents should link immutable plugin payloads instead of duplicating them');
  assert.equal(fs.realpathSync(agentPluginCache), fs.realpathSync(sharedPluginCache));
  assert.match(fs.readFileSync(path.join(home, 'hive/.gitignore'), 'utf8'), /^cache\/$/m,
    'shared runtime cache must stay out of Hive git');

  const codexConfig = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
  assert.doesNotThrow(() => toml.parse(codexConfig), 'generated Codex config must remain valid TOML');
  for (const event of [
    'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop',
    'SessionStart', 'UserPromptSubmit', 'PreCompact', 'PostCompact'
  ]) {
    assert.match(codexConfig, new RegExp(`\\[\\[hooks\\.${event}\\]\\]`));
  }
  assert.equal((codexConfig.match(/type = "command"/g) ?? []).length, 8);
  assert.equal((codexConfig.match(/timeout = 30/g) ?? []).length, 8);
  assert.equal(fs.existsSync(path.join(codexHome, 'auth.json')), true);
  assert.match(codexConfig, new RegExp(`\\[projects\\.${JSON.stringify(project).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`));
  assert.match(codexConfig, /trust_level = "trusted"/);
  assert.match(codexConfig, /preserved-project/);
  assert.match(codexConfig, /trust_level = "untrusted"/);
  const preservedHeader = `[projects.${JSON.stringify(path.join(home, 'preserved-project'))}]`;
  assert.equal(codexConfig.split(preservedHeader).length - 1, 1, 'TOML project tables must not be duplicated');

  // Regeneration must retain an interactive per-agent trust choice even when
  // Auto Mode is later off, while never retaining old generated hook tables.
  fs.appendFileSync(path.join(codexHome, 'config.toml'), [
    '',
    `[projects.${JSON.stringify(path.join(home, 'manual-trust'))}]`,
    'trust_level = "trusted"',
    ''
  ].join('\n'));
  hive.installCodexHooks(agentDir, codexMeta, path.join(home, 'hive'), project, false);
  const regenerated = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
  assert.match(regenerated, /manual-trust/);
  assert.equal((regenerated.match(/\[\[hooks\.PreToolUse\]\]/g) ?? []).length, 1);
  assert.equal(regenerated.split(preservedHeader).length - 1, 1);
  const ignored = execFileSync('git', [
    'check-ignore', 'agents/a1/.codex/auth.json'
  ], { cwd: path.join(home, 'hive'), encoding: 'utf8' }).trim();
  assert.equal(ignored, 'agents/a1/.codex/auth.json');

  const launcher = launcherIn(home);
  const commands = hookCommandsUnder(home);
  // claude (Stop/statusLine/…) + agy + grok + codex.
  assert.ok(commands.length >= 4, `expected commands from all installers, got ${commands.length}`);
  const bare = commands.filter((c) => !usesLauncher(c, launcher));
  assert.deepEqual(bare, [], 'these hook commands would exit 127 wherever node is not on the bare PATH');

  for (const shim of ['agy-hook.cjs', 'grok-hook.cjs']) {
    assert.ok(commands.some((c) => c.includes(shim)), `${shim} installer produced no command`);
  }
});

test('a hook fires with NO node on PATH, and its payload reaches HIVE_SOCK', { skip: !POSIX }, async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  const sock = path.join(home, 'hive', 'hooks.sock');
  try { fs.unlinkSync(sock); } catch { /* not there */ }

  const received = [];
  const server = net.createServer((conn) => {
    let buf = '';
    conn.on('error', () => { /* the shim may hang up first */ });
    conn.on('data', (d) => { buf += d; });
    // The shim writes its payload and waits for OUR end() — it never half-closes,
    // so the payload is only complete on 'close', not 'end'.
    conn.on('close', () => { if (buf) received.push(buf); });
    conn.write(JSON.stringify({ ok: true }) + '\n', () => conn.end());
  });
  server.on('error', () => { /* keep a socket error out of the test process */ });
  await new Promise((resolve) => server.listen(sock, resolve));
  t.after(() => server.close());

  const env = { PATH: STRIPPED_PATH, HIVE_SOCK: sock, AGENT_ID: 'a1', HOME: home };
  const shim = path.join(home, 'hive/bin/cth-hook.cjs');

  // Control: the command shape used before the fix. Only meaningful if node is
  // genuinely absent from the stripped PATH (it is on a dev machine using nvm,
  // volta or Homebrew; it is not on an image with /usr/bin/node).
  const probe = await run('command -v node', env);
  if (probe.code !== 0) {
    const before = await run(`node "${shim}"`, env);
    assert.equal(before.code, 127, 'the bug: bare `node` is not resolvable from a hook');
  }

  // NOTE: async spawn, not spawnSync — the shim connects back to a socket THIS
  // process is serving, so a sync call would block our own event loop and
  // deadlock the handshake.
  const settings = JSON.parse(fs.readFileSync(path.join(home, 'hive/agents/a1/settings.json'), 'utf8'));
  const after = await run(settings.hooks.Stop[0].hooks[0].command, env);
  assert.equal(after.code, 0, `hook failed under a stripped PATH: ${after.stderr}`);

  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(received.length > 0, 'nothing arrived at HIVE_SOCK');
  assert.match(received[0], /"hook_event_name"\s*:\s*"Stop"/);
});
