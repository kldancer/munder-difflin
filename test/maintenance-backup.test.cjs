'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBackup, verifyBackup, restoreBackup, REDACTED } = require('../tools/w5-backup.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-backup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const harness = path.join(root, 'source-harness');
  const userData = path.join(root, 'source-user-data');
  fs.mkdirSync(path.join(harness, 'hive', 'agents', 'jim', '.codex', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(harness, 'worktrees', 'jim'), { recursive: true });
  fs.mkdirSync(path.join(userData, 'knowledge'), { recursive: true });
  fs.writeFileSync(path.join(harness, 'hive', 'tasks.json'), '[{"title":"demo"}]');
  fs.writeFileSync(path.join(harness, 'hive', 'agents', 'jim', '.codex', 'sessions', 'one.jsonl'), 'session');
  fs.writeFileSync(path.join(harness, 'hive', 'agents', 'jim', '.codex', 'auth.json'), 'must-not-copy');
  fs.writeFileSync(path.join(harness, 'worktrees', 'jim', 'change.txt'), 'uncommitted recovery');
  fs.writeFileSync(path.join(harness, 'worktrees', 'jim', '.git'), 'gitdir: /old/location');
  fs.writeFileSync(path.join(harness, 'roster.json'), '{"agents":["jim"]}');
  fs.writeFileSync(path.join(userData, 'knowledge', 'memory.json'), '{"topic":"paper"}');
  fs.writeFileSync(path.join(userData, 'harness.db'), 'db-bytes');
  fs.writeFileSync(path.join(userData, 'integration-secrets.json'), 'must-not-copy');
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({
    language: 'zh', harnessHome: '/old/harness', recentHives: ['/old/harness'], costCapTokens: 12345,
    slackBotToken: 'xoxb-secret', nested: { deepseekApiKey: 'secret-key' },
    webhookTriggers: [{ name: 'ci', secret: 'webhook-secret' }]
  }));
  return { root, harness, userData, snapshot: path.join(root, 'snapshot') };
}

test('create redacts config, excludes credentials, and verifies checksums', (t) => {
  const f = fixture(t);
  const result = createBackup({ harnessHome: f.harness, userData: f.userData, output: f.snapshot, appVersion: '0.4.4' });
  assert.equal(result.ok, true);
  const config = JSON.parse(fs.readFileSync(path.join(f.snapshot, 'user-data', 'config.json'), 'utf8'));
  assert.equal(config.language, 'zh');
  assert.equal(config.slackBotToken, REDACTED);
  assert.equal(config.nested.deepseekApiKey, REDACTED);
  assert.equal(config.webhookTriggers[0].secret, REDACTED);
  assert.equal(config.costCapTokens, 12345, 'non-secret token budgets must survive backup');
  assert.equal(fs.existsSync(path.join(f.snapshot, 'user-data', 'integration-secrets.json')), false);
  assert.equal(fs.existsSync(path.join(f.snapshot, 'harness', 'hive', 'agents', 'jim', '.codex', 'auth.json')), false);
  assert.equal(fs.existsSync(path.join(f.snapshot, 'harness', 'worktrees', 'jim', '.git')), false);
  assert.deepEqual(verifyBackup(f.snapshot).failures, []);
});

test('tampering is detected before restore', (t) => {
  const f = fixture(t);
  createBackup({ harnessHome: f.harness, userData: f.userData, output: f.snapshot });
  fs.appendFileSync(path.join(f.snapshot, 'harness', 'hive', 'tasks.json'), 'tampered');
  const result = verifyBackup(f.snapshot);
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /checksum mismatch/);
});

test('restore recreates state only in empty targets and never overwrites', (t) => {
  const f = fixture(t);
  createBackup({ harnessHome: f.harness, userData: f.userData, output: f.snapshot });
  fs.writeFileSync(path.join(f.snapshot, 'harness', 'unmanifested.txt'), 'must not restore');
  const restoredHarness = path.join(f.root, 'restored-harness');
  const restoredUserData = path.join(f.root, 'restored-user-data');
  const result = restoreBackup({ snapshot: f.snapshot, harnessHome: restoredHarness, userData: restoredUserData });
  assert.equal(result.ok, true);
  assert.equal(fs.readFileSync(path.join(restoredHarness, 'worktrees', 'jim', 'change.txt'), 'utf8'), 'uncommitted recovery');
  assert.equal(fs.existsSync(path.join(restoredHarness, 'unmanifested.txt')), false);
  const config = JSON.parse(fs.readFileSync(path.join(restoredUserData, 'config.json'), 'utf8'));
  assert.equal(config.slackBotToken, REDACTED);
  assert.equal(config.harnessHome, restoredHarness);
  assert.deepEqual(config.recentHives, [restoredHarness]);

  const occupied = path.join(f.root, 'occupied');
  fs.mkdirSync(occupied);
  fs.writeFileSync(path.join(occupied, 'keep.txt'), 'user data');
  assert.throws(() => restoreBackup({ snapshot: f.snapshot, harnessHome: occupied, userData: path.join(f.root, 'unused') }), /must be empty/);
  assert.equal(fs.readFileSync(path.join(occupied, 'keep.txt'), 'utf8'), 'user data');
});

test('verify refuses a manifest file replaced with a symlink', (t) => {
  const f = fixture(t);
  createBackup({ harnessHome: f.harness, userData: f.userData, output: f.snapshot });
  const target = path.join(f.snapshot, 'harness', 'hive', 'tasks.json');
  fs.rmSync(target);
  fs.symlinkSync(path.join(f.root, 'source-harness', 'hive', 'tasks.json'), target);
  const result = verifyBackup(f.snapshot);
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /not a regular file/);
});

test('create refuses to replace an existing snapshot', (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.snapshot);
  fs.writeFileSync(path.join(f.snapshot, 'keep.txt'), 'existing');
  assert.throws(() => createBackup({ harnessHome: f.harness, userData: f.userData, output: f.snapshot }), /already exists/);
  assert.equal(fs.readFileSync(path.join(f.snapshot, 'keep.txt'), 'utf8'), 'existing');
});
