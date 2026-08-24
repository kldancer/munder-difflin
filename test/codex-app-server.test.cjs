'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const loadTs = require('./load-ts.cjs');

const { CodexAppServerClient, normalizeCodexNotification } = loadTs('src/main/codexAppServer.ts');
const { codexWorkspacePolicy } = loadTs('src/main/codexNativeRuntime.ts');
const { reduceRuntimeSession } = loadTs('src/shared/agentRuntime.ts');
const fixture = path.join(__dirname, 'fixtures', 'fake-codex-app-server.cjs');

function client(extra = {}) {
  const events = [];
  const approvals = [];
  const runtime = new CodexAppServerClient({
    command: process.execPath,
    args: [fixture],
    requestTimeoutMs: 200,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    onEvent: (event) => events.push(event),
    onApproval: (approval) => approvals.push(approval),
    ...extra
  });
  return { runtime, events, approvals };
}

test('normalizes representative thread, turn, item and usage events', () => {
  assert.equal(normalizeCodexNotification('thread/started', {
    thread: { id: 't1', sessionId: 's1', instructionSources: [{ path: '/a/AGENTS.md' }] }
  }).map((event) => event.type).join(','), 'thread-started,instruction-sources');
  assert.equal(normalizeCodexNotification('turn/started', {
    threadId: 't1', turn: { id: 'r1' }
  }).map((event) => event.type).join(','), 'turn-started,runtime-status');
  assert.equal(normalizeCodexNotification('future/event', {}).length, 0);
  assert.equal(normalizeCodexNotification('item/started', { item: { id: 'u1', type: 'userMessage' } }).length, 0);
  assert.equal(normalizeCodexNotification('item/started', { item: { id: 'c1', type: 'commandExecution' } })[0].type, 'tool-started');
  assert.deepEqual(normalizeCodexNotification('item/completed', {
    threadId: 't1', turnId: 'r1', item: { id: 'a1', type: 'agentMessage', text: '{"ok":true}' }
  }).map((event) => event.type), ['assistant-message']);
});

test('supervises initialize, requests, events, approvals and bounded stop', async () => {
  const { runtime, events, approvals } = client();
  const capabilities = await runtime.start();
  assert.equal(capabilities.available, true);
  const started = await runtime.threadStart({ cwd: '/fixture' });
  assert.equal(started.thread.id, 'thread-fixture');
  await runtime.turnStart({ threadId: 'thread-fixture', text: 'bounded fixture', clientUserMessageId: 'message-fixture' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  await runtime.request('test/approval');
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].kind, 'command');
  runtime.respondApproval(approvals[0].id, 'decline');
  assert.ok(events.some((event) => event.type === 'assistant-delta'));
  assert.ok(events.some((event) => event.type === 'usage'));
  assert.equal(events.find((event) => event.type === 'usage').usage.contextWindow, 1000);
  assert.equal(events.filter((event) => event.type === 'tool-started').length, 1);
  assert.ok(events.some((event) => event.type === 'turn-completed'));
  await runtime.stop();
  assert.equal(runtime.running, false);
});

test('answers permission approvals with the protocol-specific grant shape and original wire id type', async () => {
  const { runtime, approvals, events } = client();
  await runtime.start();
  await runtime.request('test/permissions-approval');
  assert.equal(approvals[0].kind, 'permissions');
  assert.deepEqual(approvals[0].permissions, ['网络：启用']);
  runtime.respondApproval(approvals[0].id, 'accept');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(events.some((event) => event.type === 'warning' && event.message === 'test/wire-id-number'));
  assert.ok(!events.some((event) => event.type === 'warning' && event.message === 'test/wire-id-string'));
  await runtime.stop();
});

test('workspace policy deduplicates only the explicitly granted roots', () => {
  assert.deepEqual(codexWorkspacePolicy(['/project', '/hive/agent', '/project']), {
    type: 'workspaceWrite',
    writableRoots: ['/project', '/hive/agent'],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false
  });
});

test('unknown notifications warn without breaking known requests', async () => {
  const { runtime, events } = client();
  await runtime.start();
  const result = await runtime.request('test/unknown');
  assert.equal(result.ok, true);
  assert.ok(events.some((event) => event.type === 'warning' && event.code === 'UNKNOWN_NOTIFICATION'));
  await runtime.stop();
});

test('timeouts and invalid stdout reject without hanging', async () => {
  const first = client();
  await first.runtime.start();
  await assert.rejects(first.runtime.request('test/hang'), /timed out/);
  await first.runtime.stop();

  const second = client();
  await second.runtime.start();
  await assert.rejects(second.runtime.request('test/invalid'), /invalid JSON/);
  await second.runtime.stop();
});

test('runtime reducer keeps normalized thread, turn, usage and failure facts', () => {
  const base = {
    agentId: 'michael', mode: 'codex-native', status: 'booting', cwd: '/fixture',
    instructionSources: [], updatedAt: 1
  };
  const thread = reduceRuntimeSession(base, { type: 'thread-started', threadId: 't1', sessionId: 's1', at: 2 });
  const turn = reduceRuntimeSession(thread, { type: 'turn-started', threadId: 't1', turnId: 'r1', at: 3 });
  const done = reduceRuntimeSession(turn, { type: 'turn-completed', threadId: 't1', turnId: 'r1', at: 4 });
  assert.deepEqual({ threadId: done.threadId, sessionId: done.sessionId, turnId: done.turnId, status: done.status }, {
    threadId: 't1', sessionId: 's1', turnId: undefined, status: 'idle'
  });
});
