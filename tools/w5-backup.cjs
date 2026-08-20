#!/usr/bin/env node
'use strict';

/**
 * W5 personal backup utility. It creates a plain directory snapshot with a
 * SHA-256 manifest, verifies it, and restores only into absent/empty targets.
 * It never follows symlinks and never copies known credential stores.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MANIFEST = 'manifest.json';
const FORMAT = 1;
const REDACTED = '<redacted; re-enter after restore>';
const EXCLUDED_DIRS = new Set(['node_modules', 'cache', 'tmp', 'mcp-oauth-locks', 'thread-writer-locks', 'shell_snapshots']);
const EXCLUDED_FILES = [
  /^integration-secrets\.json$/i,
  /^slack-reply\.json$/i,
  /^auth\.json$/i,
  /^credentials?(?:\..+)?$/i,
  /^google_accounts\.json$/i,
  /^oauth(?:\..+)?$/i,
  /api[-_]?key/i,
  /(?:^|[-_.])secrets?(?:[-_.]|$)/i,
  /\.(?:sock|lock|pid)$/i
];

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isExcludedFile(name) {
  return EXCLUDED_FILES.some((re) => re.test(name));
}

function isSecretKey(key) {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
  return normalized === 'token'
    || normalized.endsWith('_token')
    || normalized === 'secret'
    || normalized.endsWith('_secret')
    || normalized === 'api_key'
    || normalized.endsWith('_api_key')
    || normalized === 'password'
    || normalized.endsWith('_password')
    || normalized === 'authorization';
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = isSecretKey(key) ? REDACTED : redact(item);
  }
  return out;
}

function assertDirectory(dir, label) {
  if (!dir || !path.isAbsolute(dir)) throw new Error(`${label} must be an absolute path`);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`${label} is not a directory: ${dir}`);
}

function assertNewOutput(output) {
  if (!output || !path.isAbsolute(output)) throw new Error('output must be an absolute path');
  if (fs.existsSync(output)) throw new Error(`output already exists: ${output}`);
  fs.mkdirSync(output, { recursive: false });
}

function addManifestFile(root, relative, entries) {
  const file = path.join(root, relative);
  const st = fs.statSync(file);
  entries.push({ path: relative.split(path.sep).join('/'), bytes: st.size, sha256: sha256File(file) });
}

function copyTree(source, snapshotRoot, relativeRoot, entries, excluded) {
  if (!fs.existsSync(source)) return;
  const walk = (current, relative) => {
    const st = fs.lstatSync(current);
    if (st.isSymbolicLink()) { excluded.push({ path: relative, reason: 'symlink' }); return; }
    const name = path.basename(current);
    if (st.isDirectory()) {
      if (relative && EXCLUDED_DIRS.has(name)) { excluded.push({ path: relative, reason: 'regenerable-directory' }); return; }
      fs.mkdirSync(path.join(snapshotRoot, relative), { recursive: true });
      for (const child of fs.readdirSync(current).sort()) walk(path.join(current, child), path.join(relative, child));
      return;
    }
    if (!st.isFile()) { excluded.push({ path: relative, reason: 'non-regular-file' }); return; }
    if (name === '.git' && relative.split(path.sep).join('/').startsWith('harness/worktrees/')) {
      excluded.push({ path: relative, reason: 'stale-worktree-registration' });
      return;
    }
    if (isExcludedFile(name)) { excluded.push({ path: relative, reason: 'credential-or-runtime-file' }); return; }
    const target = path.join(snapshotRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(current, target);
    addManifestFile(snapshotRoot, relative, entries);
  };
  walk(source, relativeRoot);
}

function createBackup({ harnessHome, userData, output, appVersion = 'unknown' }) {
  assertDirectory(harnessHome, 'harnessHome');
  assertDirectory(userData, 'userData');
  assertNewOutput(output);
  const entries = [];
  const excluded = [];
  try {
    const config = path.join(userData, 'config.json');
    if (fs.existsSync(config)) {
      const target = path.join(output, 'user-data', 'config.json');
      const parsed = JSON.parse(fs.readFileSync(config, 'utf8'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(redact(parsed), null, 2) + '\n', { mode: 0o600 });
      addManifestFile(output, path.join('user-data', 'config.json'), entries);
    }
    for (const name of ['harness.db', 'harness.db-wal', 'harness.db-shm']) {
      copyTree(path.join(userData, name), output, path.join('user-data', name), entries, excluded);
    }
    copyTree(path.join(userData, 'knowledge'), output, path.join('user-data', 'knowledge'), entries, excluded);

    for (const name of ['hive', 'roster.json', 'roster-backups', 'worktrees']) {
      copyTree(path.join(harnessHome, name), output, path.join('harness', name), entries, excluded);
    }

    entries.sort((a, b) => a.path.localeCompare(b.path));
    const manifest = {
      format: FORMAT,
      createdAt: new Date().toISOString(),
      appVersion,
      policy: {
        secrets: 'redacted-or-excluded',
        symlinks: 'excluded',
        restore: 'empty-targets-only',
        worktrees: 'recovery-copy; recreate Git worktree registration manually'
      },
      files: entries,
      excluded
    };
    fs.writeFileSync(path.join(output, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    return { ok: true, files: entries.length, excluded: excluded.length, output };
  } catch (error) {
    fs.rmSync(output, { recursive: true, force: true });
    throw error;
  }
}

function loadManifest(snapshot) {
  assertDirectory(snapshot, 'snapshot');
  const file = path.join(snapshot, MANIFEST);
  if (!fs.existsSync(file)) throw new Error('manifest.json is missing');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (manifest.format !== FORMAT || !Array.isArray(manifest.files)) throw new Error('unsupported backup manifest');
  return manifest;
}

function safeSnapshotPath(snapshot, relative) {
  const root = path.resolve(snapshot);
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error(`manifest path escapes snapshot: ${relative}`);
  return target;
}

function verifyBackup(snapshot) {
  const manifest = loadManifest(snapshot);
  const failures = [];
  const seen = new Set();
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || !Number.isInteger(entry.bytes) || entry.bytes < 0
      || typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      failures.push('manifest contains an invalid file entry');
      continue;
    }
    if (seen.has(entry.path)) { failures.push(`${entry.path}: duplicate manifest entry`); continue; }
    seen.add(entry.path);
    const file = safeSnapshotPath(snapshot, entry.path);
    if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) { failures.push(`${entry.path}: missing or not a regular file`); continue; }
    const bytes = fs.statSync(file).size;
    const hash = sha256File(file);
    if (bytes !== entry.bytes || hash !== entry.sha256) failures.push(`${entry.path}: checksum mismatch`);
  }
  return { ok: failures.length === 0, files: manifest.files.length, failures, manifest };
}

function assertEmptyTarget(target, label) {
  if (!target || !path.isAbsolute(target)) throw new Error(`${label} must be an absolute path`);
  if (fs.existsSync(target)) {
    if (!fs.statSync(target).isDirectory() || fs.readdirSync(target).length > 0) {
      throw new Error(`${label} must not exist or must be empty: ${target}`);
    }
  } else {
    fs.mkdirSync(target, { recursive: true });
  }
}

function restoreManifestFile(snapshot, entry, harnessHome, userData) {
  const normalized = entry.path.replace(/\\/g, '/');
  let root;
  let relative;
  if (normalized.startsWith('harness/')) {
    root = harnessHome;
    relative = normalized.slice('harness/'.length);
  } else if (normalized.startsWith('user-data/')) {
    root = userData;
    relative = normalized.slice('user-data/'.length);
  } else {
    throw new Error(`manifest path has no restore owner: ${entry.path}`);
  }
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error(`restore path escapes target: ${entry.path}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(safeSnapshotPath(snapshot, entry.path), target, fs.constants.COPYFILE_EXCL);
}

function restoreBackup({ snapshot, harnessHome, userData }) {
  const check = verifyBackup(snapshot);
  if (!check.ok) throw new Error(`backup verification failed: ${check.failures.join('; ')}`);
  assertEmptyTarget(harnessHome, 'harnessHome');
  assertEmptyTarget(userData, 'userData');
  try {
    for (const entry of check.manifest.files) {
      restoreManifestFile(snapshot, entry, harnessHome, userData);
    }
    // A migrated config must point at the NEW office. Secrets remain redacted
    // and are deliberately not reconstructed by this tool.
    const configPath = path.join(userData, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.harnessHome = harnessHome;
      config.recentHives = [harnessHome];
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    }
    return { ok: true, files: check.files, harnessHome, userData };
  } catch (error) {
    throw new Error(`restore stopped without deleting targets: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseArgs(argv) {
  const command = argv[0];
  const args = {};
  for (let i = 1; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith('--') || argv[i + 1] == null) throw new Error(`bad argument near ${key ?? '<end>'}`);
    args[key.slice(2)] = path.resolve(argv[i + 1]);
  }
  return { command, args };
}

function usage() {
  return [
    'Usage:',
    '  node tools/w5-backup.cjs create --harness-home ABS --user-data ABS --output ABS',
    '  node tools/w5-backup.cjs verify --snapshot ABS',
    '  node tools/w5-backup.cjs restore --snapshot ABS --harness-home ABS --user-data ABS'
  ].join('\n');
}

if (require.main === module) {
  try {
    const { command, args } = parseArgs(process.argv.slice(2));
    let result;
    if (command === 'create') result = createBackup({ harnessHome: args['harness-home'], userData: args['user-data'], output: args.output });
    else if (command === 'verify') result = verifyBackup(args.snapshot);
    else if (command === 'restore') result = restoreBackup({ snapshot: args.snapshot, harnessHome: args['harness-home'], userData: args['user-data'] });
    else throw new Error(usage());
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { createBackup, verifyBackup, restoreBackup, redact, REDACTED, MANIFEST };
