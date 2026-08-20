'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadCore() {
  return import(pathToFileURL(path.join(__dirname, '..', 'src', 'main', 'lifecycleCapacity.ts')).href);
}

function file(filePath, content) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, content); }

test('missing directories degrade to empty, content is never returned', async () => {
  const { snapshotLifecycleCapacity } = await loadCore();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w7-capacity-'));
  const secret = 'SENSITIVE-BODY-DO-NOT-RETURN';
  file(path.join(root, 'hive', 'agents', 'a', 'inbox', 'x.json'), JSON.stringify({ body: secret }));
  file(path.join(root, 'hive', 'agents', 'a', 'memory.md'), `# ${secret}`);
  const result = snapshotLifecycleCapacity({ harnessHome: root });
  assert.equal(result.messages.inboxPending.files, 1);
  assert.equal(result.memory.files, 1);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(result.policy.default, 'retain');
  assert.equal(result.policy.cleanup, 'manual-only');
  assert.equal(result.policy.backupBeforeGovernance, true);
});

test('counts message buckets, bytes, and skips symlinks', async () => {
  const { snapshotLifecycleCapacity } = await loadCore();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w7-capacity-'));
  file(path.join(root, 'hive', 'agents', 'a', 'inbox', 'one.json'), '1234');
  file(path.join(root, 'hive', 'agents', 'a', 'inbox', '.done', 'two.json'), '12');
  file(path.join(root, 'hive', 'agents', 'a', 'outbox', 'three.json'), '123');
  file(path.join(root, 'hive', 'agents', 'a', 'outbox', '.sent', 'four.json'), '1');
  fs.symlinkSync(path.join(root, 'hive', 'agents', 'a', 'inbox', 'one.json'), path.join(root, 'hive', 'agents', 'a', 'inbox', 'link.json'));
  const result = snapshotLifecycleCapacity({ harnessHome: root });
  assert.deepEqual([
    result.messages.inboxPending.files,
    result.messages.inboxDone.files,
    result.messages.outboxPending.files,
    result.messages.outboxSent.files
  ], [1, 1, 1, 1]);
});

test('marks a bounded scan partial instead of recursing without limit', async () => {
  const { snapshotLifecycleCapacity } = await loadCore();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w7-capacity-'));
  for (let i = 0; i < 4; i++) file(path.join(root, 'hive', 'agents', 'a', 'inbox', `${i}.json`), 'x');
  const result = snapshotLifecycleCapacity({ harnessHome: root, budgets: { maxFiles: 2 } });
  assert.equal(result.messages.inboxPending.partial, true);
  assert.equal(result.messages.inboxPending.files, 2);
});

test('agent enumeration is bounded and invalid budgets are rejected', async () => {
  const { snapshotLifecycleCapacity } = await loadCore();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w7-capacity-'));
  for (let i = 0; i < 3; i++) file(path.join(root, 'hive', 'agents', `a${i}`, 'memory.md'), '# memory');
  const result = snapshotLifecycleCapacity({ harnessHome: root, budgets: { maxDirectories: 1 } });
  assert.equal(result.memory.partial, true);
  assert.equal(result.sessions.partial, true);
  assert.throws(() => snapshotLifecycleCapacity({ harnessHome: root, budgets: { maxFiles: -1 } }), /invalid capacity budget/);
});
