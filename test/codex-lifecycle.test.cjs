'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const {
  findCodexHomeForSession,
  withCodexResumeArgs
} = loadTs('src/shared/codexLifecycle.ts');

const SID = '019c1234-5678-7abc-8def-0123456789ab';

function addRollout(root, agent, indexed) {
  const home = path.join(root, agent, '.codex');
  const sessions = path.join(home, 'sessions/2026/08/19');
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(path.join(sessions, `rollout-test-${SID}.jsonl`), '{}\n');
  if (indexed) fs.writeFileSync(path.join(home, 'state_5.sqlite'), `prefix-${SID}-suffix`);
  return home;
}

test('Codex resume selects the home whose state database indexes the session', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-codex-home-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fallback = addRollout(root, 'agent-a', false);
  const indexed = addRollout(root, 'agent-b', true);

  assert.notEqual(fallback, indexed);
  assert.equal(findCodexHomeForSession(SID, root), indexed);
  assert.equal(findCodexHomeForSession('not-a-session', root), null);
});

test('Codex resume keeps the session id before the positional hive prompt', () => {
  const args = ['--dangerously-bypass-hook-trust', '--model', 'gpt-5.6-sol', 'hive prompt'];
  assert.deepEqual(
    withCodexResumeArgs(args, SID),
    ['resume', SID, '--dangerously-bypass-hook-trust', '--model', 'gpt-5.6-sol', 'hive prompt']
  );
  assert.deepEqual(withCodexResumeArgs(['resume', SID], SID), ['resume', SID]);
});
