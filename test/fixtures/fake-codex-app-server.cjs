'use strict';

const readline = require('node:readline');
const fs = require('node:fs');

const mode = process.env.FAKE_CODEX_MODE || 'normal';
const line = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (raw) => {
  const message = JSON.parse(raw);
  if (!message.method && message.id === 73 && message.result) {
    line({ method: 'test/wire-id-number', params: { ok: true } });
    return;
  }
  if (!message.method && message.id === '73' && message.result) {
    line({ method: 'test/wire-id-string', params: { ok: false } });
    return;
  }
  if (message.method === 'initialize') {
    line({ id: message.id, result: { userAgent: 'fake/1' } });
    return;
  }
  if (message.method === 'initialized') return;
  if (message.method === 'test/unknown') {
    line({ method: 'future/notification', params: { safe: true } });
    line({ id: message.id, result: { ok: true } });
    return;
  }
  if (message.method === 'test/invalid') {
    process.stdout.write('not-json\n');
    return;
  }
  if (message.method === 'test/hang') return;
  if (message.method === 'thread/start') {
    const thread = { id: 'thread-fixture', sessionId: 'session-fixture', instructionSources: [{ path: '/fixture/AGENTS.md' }] };
    line({ method: 'thread/started', params: { thread } });
    line({ id: message.id, result: { thread } });
    return;
  }
  if (message.method === 'thread/resume') {
    const thread = { id: message.params.threadId, sessionId: 'session-fixture', instructionSources: [] };
    line({ id: message.id, result: { thread, instructionSources: ['/fixture/AGENTS.md'] } });
    return;
  }
  if (message.method === 'turn/start') {
    const turn = { id: 'turn-fixture', status: 'inProgress' };
    line({ method: 'turn/started', params: { threadId: message.params.threadId, turn } });
    line({ id: message.id, result: { turn } });
    if (mode === 'crash-on-first-turn' && process.env.FAKE_CRASH_SENTINEL && !fs.existsSync(process.env.FAKE_CRASH_SENTINEL)) {
      fs.writeFileSync(process.env.FAKE_CRASH_SENTINEL, 'accepted\n');
      setTimeout(() => process.exit(31), 5);
      return;
    }
    line({ method: 'item/agentMessage/delta', params: { threadId: message.params.threadId, turnId: turn.id, delta: 'ok' } });
    line({ method: 'item/started', params: { item: { id: 'user-item', type: 'userMessage' } } });
    line({ method: 'item/completed', params: { item: { id: 'user-item', type: 'userMessage' } } });
    line({ method: 'item/started', params: { item: { id: 'tool-item', type: 'commandExecution', command: 'true' } } });
    line({ method: 'item/completed', params: { item: { id: 'tool-item', type: 'commandExecution', status: 'completed' } } });
    line({ method: 'thread/tokenUsage/updated', params: { threadId: message.params.threadId, tokenUsage: { total: { totalTokens: 12, inputTokens: 8, cachedInputTokens: 3, outputTokens: 4 }, last: { totalTokens: 12, inputTokens: 8, cachedInputTokens: 3, outputTokens: 4 }, modelContextWindow: 1000 } } });
    line({ method: 'turn/completed', params: { threadId: message.params.threadId, turn: { ...turn, status: 'completed' } } });
    return;
  }
  if (message.method === 'test/approval') {
    line({ method: 'item/commandExecution/requestApproval', id: 'approval-fixture', params: { command: 'npm test', cwd: '/fixture' } });
    line({ id: message.id, result: { ok: true } });
    return;
  }
  if (message.method === 'test/permissions-approval') {
    line({ method: 'item/permissions/requestApproval', id: 73, params: { reason: 'fixture', permissions: { network: { enabled: true }, fileSystem: null } } });
    line({ id: message.id, result: { ok: true } });
    return;
  }
  line({ id: message.id, result: { ok: true } });
});

if (mode === 'exit-early') setTimeout(() => process.exit(23), 50);
