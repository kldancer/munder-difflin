'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

async function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-w6-memory-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home, undefined, () => 'zh-CN');
  await hive.ensureAgent({ id: 'writer-1', name: '记录员', provider: 'codex', cwd: home });
  return { home, hive };
}

test('manual memory edit is backup-first and atomic at the public contract', async (t) => {
  const { home, hive } = await floor(t);
  const before = hive.memory('writer-1');
  const after = `${before}\n## 决策\n- 保留最小合同。\n`;
  assert.deepEqual(hive.replaceMemory('writer-1', after, before), {
    ok: true,
    bytes: Buffer.byteLength(after, 'utf8')
  });
  assert.equal(hive.memory('writer-1'), after);

  const backups = fs.readdirSync(path.join(home, 'hive', 'backups'));
  assert.equal(backups.length, 1);
  assert.equal(
    fs.readFileSync(path.join(home, 'hive', 'backups', backups[0], 'writer-1', 'memory.md'), 'utf8'),
    before
  );
});

test('stale or unsafe edits never overwrite current memory', async (t) => {
  const { hive } = await floor(t);
  const before = hive.memory('writer-1');
  assert.equal(hive.replaceMemory('writer-1', 'replacement', 'stale').ok, false);
  assert.equal(hive.replaceMemory('../writer-1', 'replacement', before).ok, false);
  assert.equal(hive.replaceMemory('writer-1', 'x'.repeat(262_145), before).ok, false);
  assert.equal(hive.memory('writer-1'), before);
});

test('main and preload expose only the optimistic memory replacement contract', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src', 'preload', 'index.ts'), 'utf8');
  assert.match(main, /ipcMain\.handle\('hive:replaceMemory'/);
  assert.match(preload, /hiveReplaceMemory:/);
  assert.match(preload, /expected: string/);
});

test('memory editor explains the Provider session and shared task boundary', () => {
  const root = path.resolve(__dirname, '..');
  const resources = fs.readFileSync(path.join(root, 'src', 'shared', 'i18n', 'resources', 'w6.ts'), 'utf8');
  assert.match(resources, /does not change the Provider session or shared task ledger/);
  assert.match(resources, /不会修改 Provider Session 或公共任务账本/);
});
