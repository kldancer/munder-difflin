'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const delivery = loadTs('src/main/worktreeDelivery.ts');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w7-delivery-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'w7@example.test');
  git(root, 'config', 'user.name', 'Wave 7');
  fs.writeFileSync(path.join(root, 'note.txt'), 'base\n');
  git(root, 'add', 'note.txt');
  git(root, 'commit', '-qm', 'base');
  const source = path.join(path.dirname(root), `${path.basename(root)}-source`);
  git(root, 'worktree', 'add', '-q', '-b', 'agent/source', source, 'main');
  return { root, source };
}

function cleanup(r) {
  fs.rmSync(r.root, { recursive: true, force: true });
  fs.rmSync(r.source, { recursive: true, force: true });
}

test('successful merge and safe reclaim', async () => {
  const r = repo();
  try {
    fs.writeFileSync(path.join(r.source, 'note.txt'), 'feature\n');
    git(r.source, 'commit', '-qam', 'feature');
    const inspected = await delivery.inspectWorktreeDelivery({ sourceCwd: r.source, targetCwd: r.root, targetBranch: 'main' });
    assert.equal(inspected.ok, true);
    assert.equal(inspected.canMerge, true);
    assert.equal((await delivery.mergeWorktreeDelivery({ sourceCwd: r.source, targetCwd: r.root, targetBranch: 'main' })).ok, true);
    const reclaimed = await delivery.reclaimWorktreeDelivery({ sourceCwd: r.source, targetCwd: r.root, targetBranch: 'main' });
    assert.equal(reclaimed.ok, true);
    assert.equal(fs.existsSync(r.source), false);
    assert.equal(git(r.root, 'show', 'HEAD:note.txt'), 'feature');
    assert.match(git(r.root, 'show-ref', 'refs/heads/agent/source'), /refs\/heads\/agent\/source/);
  } finally { cleanup(r); }
});

test('main checkout cannot be used as a delivery source', async () => {
  const r = repo();
  try {
    const result = await delivery.inspectWorktreeDelivery({ sourceCwd: r.root, targetCwd: r.root, targetBranch: 'main' });
    assert.equal(result.ok, false);
    assert.match(result.error, /linked worktree/);
  } finally { cleanup(r); }
});

test('safe removal helper and main IPC never use force and reclaim checks live PTY ownership', () => {
  const gitSource = fs.readFileSync(path.join(__dirname, '..', 'src/main/git.ts'), 'utf8');
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
  const helper = gitSource.slice(gitSource.indexOf('export async function removeWorktreeSafely'), gitSource.indexOf('/** Does this worktree', gitSource.indexOf('export async function removeWorktreeSafely')));
  assert.doesNotMatch(helper, /--force/);
  assert.match(mainSource, /ptyUsingTree\(resolved\.request\.sourceCwd, false\)/);
  assert.match(mainSource, /target branch changed; inspect again/);
});

test('dirty source and target are refused', async () => {
  const r = repo();
  try {
    fs.appendFileSync(path.join(r.source, 'note.txt'), 'uncommitted\n');
    let result = await delivery.inspectWorktreeDelivery({ sourceCwd: r.source, targetCwd: r.root, targetBranch: 'main' });
    assert.equal(result.ok, true);
    assert.equal(result.canMerge, false);
    assert.match(result.verification.join(' '), /source worktree/);
    git(r.source, 'checkout', '--', 'note.txt');
    fs.appendFileSync(path.join(r.root, 'note.txt'), 'target\n');
    result = await delivery.inspectWorktreeDelivery({ sourceCwd: r.source, targetCwd: r.root, targetBranch: 'main' });
    assert.equal(result.ok, true);
    assert.equal(result.canMerge, false);
    assert.match(result.verification.join(' '), /target checkout/);
  } finally { cleanup(r); }
});

test('conflict aborts and preserves source worktree', async () => {
  const r = repo();
  try {
    fs.writeFileSync(path.join(r.source, 'note.txt'), 'source change\n');
    git(r.source, 'commit', '-qam', 'source change');
    fs.writeFileSync(path.join(r.root, 'note.txt'), 'target change\n');
    git(r.root, 'commit', '-qam', 'target change');
    const result = await delivery.mergeWorktreeDelivery({ sourceCwd: r.source, targetCwd: r.root, targetBranch: 'main' });
    assert.equal(result.ok, false);
    assert.match(result.error, /merge aborted/);
    assert.equal(fs.existsSync(r.source), true);
    assert.equal(git(r.root, 'status', '--porcelain'), '');
    assert.equal(git(r.source, 'status', '--porcelain'), '');
  } finally { cleanup(r); }
});

test('unintegrated worktree is refused for reclaim, integrated one is removable', async () => {
  const r = repo();
  try {
    fs.writeFileSync(path.join(r.source, 'note.txt'), 'feature\n');
    git(r.source, 'commit', '-qam', 'feature');
    const refused = await delivery.reclaimWorktreeDelivery({ sourceCwd: r.source, targetCwd: r.root, targetBranch: 'main' });
    assert.equal(refused.ok, false);
    assert.match(refused.error, /reclaim refused/);
    assert.equal(fs.existsSync(r.source), true);
    git(r.root, 'merge', '--no-edit', 'agent/source');
    const removed = await delivery.reclaimWorktreeDelivery({ sourceCwd: r.source, targetCwd: r.root, targetBranch: 'main' });
    assert.equal(removed.ok, true);
    assert.equal(fs.existsSync(r.source), false);
  } finally { cleanup(r); }
});
