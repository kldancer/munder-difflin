'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { dailyCheck } = require('../tools/w6-daily-check.cjs');

test('daily check emits only aggregate facts and never message or memory content', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-w6-daily-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = path.join(home, 'hive');
  const agent = path.join(hive, 'agents', 'worker-1');
  fs.mkdirSync(path.join(agent, 'inbox', '.done'), { recursive: true });
  fs.mkdirSync(path.join(agent, 'outbox', '.sent'), { recursive: true });
  fs.writeFileSync(path.join(hive, 'registry.json'), JSON.stringify({ agents: {
    'worker-1': { id: 'worker-1', name: 'SECRET-NAME', provider: 'codex', cwd: '/SECRET-CWD' }
  } }));
  fs.writeFileSync(path.join(hive, 'tasks.json'), JSON.stringify({ tasks: [
    { title: 'SECRET-TASK', status: 'doing' }, { title: 'SECRET-BLOCK', status: 'blocked' }
  ] }));
  fs.writeFileSync(path.join(agent, 'inbox', 'one.json'), JSON.stringify({ body: 'SECRET-MESSAGE' }));
  fs.writeFileSync(path.join(agent, 'memory.md'), '# SECRET-MEMORY\nAPI_KEY=SECRET-KEY\n');
  fs.writeFileSync(path.join(hive, 'fleet.json'), JSON.stringify({ ts: 90_000, agents: [
    { id: 'worker-1', inboxBacklog: 1, breaker: 'constrained', lastTool: 'SECRET-TOOL' }
  ] }));
  fs.writeFileSync(path.join(hive, 'log.jsonl'), '{"subject":"SECRET-LOG"}\n');
  fs.writeFileSync(path.join(hive, 'cost-ledger.jsonl'), '{"session_id":"SECRET-SESSION"}\n');

  const result = dailyCheck(home, 100_000);
  assert.equal(result.ok, true);
  assert.deepEqual(result.tasks.byStatus, { todo: 0, doing: 1, blocked: 1, done: 0, other: 0 });
  assert.deepEqual(result.messages, { inboxPending: 1, inboxDone: 0, outboxPending: 0, outboxSent: 0 });
  assert.equal(result.fleet.breakerArmed, 1);
  const output = JSON.stringify(result);
  for (const secret of ['SECRET-NAME', 'SECRET-CWD', 'SECRET-TASK', 'SECRET-MESSAGE', 'SECRET-MEMORY', 'SECRET-KEY', 'SECRET-TOOL', 'SECRET-LOG', 'SECRET-SESSION']) {
    assert.equal(output.includes(secret), false, secret);
  }
});

test('daily check reports missing durable ledgers without throwing', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-w6-daily-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const result = dailyCheck(home, 100_000);
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 2);
  assert.match(result.warnings[0], /fleet/);
});
