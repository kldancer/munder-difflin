'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const loadTs = require('./load-ts.cjs');

const { CodexNativeRuntimeManager } = loadTs('src/main/codexNativeRuntime.ts');
const fixture = path.join(__dirname, 'fixtures', 'fake-codex-app-server.cjs');

test('native manager starts one isolated session, deduplicates delivery and persists ids only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'munder-native-'));
  const agentDir = path.join(root, 'hive', 'agents', 'god');
  const events = [];
  const manager = new CodexNativeRuntimeManager({ onEvent: (_agentId, event) => events.push(event) });
  const started = await manager.start({
    agentId: 'god', agentName: 'Michael', role: 'orchestrator', cwd: root, agentDir,
    command: process.execPath, commandArgs: [fixture], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    model: 'gpt-fixture', writableRoots: [root, agentDir]
  });
  assert.equal(started.ok, true);
  assert.equal(started.snapshot.status, 'idle');
  const first = await manager.submit('god', { text: 'not persisted', messageId: 'msg-1' });
  assert.equal(first.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const duplicate = await manager.submit('god', { text: 'different but duplicate id', messageId: 'msg-1' });
  assert.equal(duplicate.duplicate, true);
  const ledger = fs.readFileSync(path.join(agentDir, 'runtime.json'), 'utf8');
  assert.doesNotMatch(ledger, /not persisted|different but duplicate/);
  assert.match(ledger, /msg-1/);
  assert.ok(events.some((event) => event.type === 'turn-completed'));
  await manager.stopAll();
});

test('native manager resumes its persisted thread after a clean restart', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'munder-native-resume-'));
  const agentDir = path.join(root, 'hive', 'agents', 'god');
  const options = {
    agentId: 'god', agentName: 'Michael', role: 'orchestrator', cwd: root, agentDir,
    command: process.execPath, commandArgs: [fixture], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    writableRoots: [root, agentDir]
  };
  const first = new CodexNativeRuntimeManager({ onEvent: () => undefined });
  assert.equal((await first.start(options)).ok, true);
  await first.stopAll();
  const second = new CodexNativeRuntimeManager({ onEvent: () => undefined });
  const resumed = await second.start(options);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.resumed, true);
  await second.stopAll();
});

test('native manager recovers one crashed server without silently replaying an uncertain turn', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'munder-native-crash-'));
  const agentDir = path.join(root, 'hive', 'agents', 'god');
  const sentinel = path.join(root, 'crashed-once');
  const events = [];
  const manager = new CodexNativeRuntimeManager({ onEvent: (_agentId, event) => events.push(event) });
  const started = await manager.start({
    agentId: 'god', agentName: 'Michael', role: 'orchestrator', cwd: root, agentDir,
    command: process.execPath, commandArgs: [fixture],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      FAKE_CODEX_MODE: 'crash-on-first-turn',
      FAKE_CRASH_SENTINEL: sentinel
    },
    writableRoots: [root, agentDir]
  });
  assert.equal(started.ok, true);
  const submitted = await manager.submit('god', { text: 'not persisted or replayed', messageId: 'msg-crash' });
  assert.equal(submitted.ok, true);
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline && manager.snapshot('god')?.status !== 'blocked') {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const snapshot = manager.snapshot('god');
  assert.equal(snapshot.status, 'blocked');
  assert.deepEqual(snapshot.uncertainDeliveries, ['msg-crash']);
  const duplicate = await manager.submit('god', { text: 'must not replay', messageId: 'msg-crash' });
  assert.equal(duplicate.duplicate, true);
  const ledger = fs.readFileSync(path.join(agentDir, 'runtime.json'), 'utf8');
  assert.doesNotMatch(ledger, /not persisted|must not replay/);
  assert.ok(events.some((event) => event.type === 'runtime-status' && event.status === 'blocked'));
  await manager.stopAll();
});
