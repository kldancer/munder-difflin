'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

function home() { return fs.mkdtempSync(path.join(os.tmpdir(), 'md-hive-locale-')); }
function read(root, rel) { return fs.readFileSync(path.join(root, 'hive', rel), 'utf8'); }
function commandContracts(markdown) {
  return [...markdown.matchAll(/^- `([^`]+)` _\((slash|cli)\)_/gm)].map((m) => `${m[2]}:${m[1]}`);
}

test('a new Chinese hive localizes prose while machine contracts stay unchanged', async (t) => {
  const zhHome = home();
  const enHome = home();
  t.after(() => { fs.rmSync(zhHome, { recursive: true, force: true }); fs.rmSync(enHome, { recursive: true, force: true }); });

  const zh = new HiveManager(() => zhHome, undefined, () => 'zh-CN');
  const en = new HiveManager(() => enHome, undefined, () => 'en-US');
  await zh.ensureAgent({ id: 'dev-1', name: '开发', provider: 'claude', cwd: zhHome, role: '开发工程师' });
  await en.ensureAgent({ id: 'dev-1', name: 'Dev', provider: 'claude', cwd: enHome, role: 'Developer' });

  const protocol = read(zhHome, 'PROTOCOL.md');
  assert.match(protocol, /Hive 协作协议/);
  assert.match(protocol, /"act": "request \| inform \| propose \| query \| agree \| refuse \| done"/);
  assert.match(protocol, /inbox\/\.done/);

  const commandsZh = read(zhHome, 'COMMANDS.md');
  const commandsEn = read(enHome, 'COMMANDS.md');
  assert.match(commandsZh, /Claude Code 命令参考/);
  assert.deepEqual(commandContracts(commandsZh), commandContracts(commandsEn));

  assert.match(read(zhHome, 'agents/dev-1/identity.md'), /回复语言：简体中文/);
  assert.match(read(zhHome, 'agents/dev-1/memory.md'), /长期记忆/);
  const registry = JSON.parse(read(zhHome, 'registry.json'));
  assert.equal(registry.agents['dev-1'].replyLanguage, 'zh-CN');
});

test('known generated templates migrate, but durable memory content survives', async (t) => {
  const root = home();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let locale = 'en-US';
  const hive = new HiveManager(() => root, undefined, () => locale);
  await hive.ensureAgent({ id: 'qa-1', name: 'QA', provider: 'claude', cwd: root });

  const memoryPath = path.join(root, 'hive', 'agents', 'qa-1', 'memory.md');
  fs.appendFileSync(memoryPath, '\n- durable-marker: KEEP-BYTE-FOR-BYTE\n', 'utf8');
  locale = 'zh-CN';
  await hive.ensureAgent({ id: 'qa-1', name: 'QA', provider: 'claude', cwd: root });

  assert.match(read(root, 'PROTOCOL.md'), /Hive 协作协议/);
  const memory = fs.readFileSync(memoryPath, 'utf8');
  assert.match(memory, /长期记忆/);
  assert.match(memory, /durable-marker: KEEP-BYTE-FOR-BYTE/);
});

test('custom protocol and custom memory are never overwritten', async (t) => {
  const root = home();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const hive = new HiveManager(() => root, undefined, () => 'zh-CN');
  hive.ensureHive();
  const protocolPath = path.join(root, 'hive', 'PROTOCOL.md');
  fs.writeFileSync(protocolPath, '# CUSTOM PROTOCOL\nkeep-me\n', 'utf8');
  const agentDir = path.join(root, 'hive', 'agents', 'review-1');
  fs.mkdirSync(agentDir, { recursive: true });
  const memoryPath = path.join(agentDir, 'memory.md');
  fs.writeFileSync(memoryPath, '# CUSTOM MEMORY\nkeep-me\n', 'utf8');

  await hive.ensureAgent({ id: 'review-1', name: '审查', provider: 'claude', cwd: root });
  assert.equal(fs.readFileSync(protocolPath, 'utf8'), '# CUSTOM PROTOCOL\nkeep-me\n');
  assert.equal(fs.readFileSync(memoryPath, 'utf8'), '# CUSTOM MEMORY\nkeep-me\n');
});

test('an explicit per-agent reply language overrides the app locale', async (t) => {
  const root = home();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const hive = new HiveManager(() => root, undefined, () => 'zh-CN');
  const injection = await hive.ensureAgent({
    id: 'english-1', name: 'English', provider: 'claude', cwd: root, replyLanguage: 'en-US'
  });
  assert.match(read(root, 'agents/english-1/identity.md'), /Reply language: English/);
  assert.match(injection.args.join('\n'), /Reply-language contract: use English/);
});

test('the router archives the same normalized machine contract it delivers', async (t) => {
  const root = home();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const hive = new HiveManager(() => root, undefined, () => 'zh-CN');
  await hive.ensureAgent({ id: 'god', name: '总控', provider: 'claude', cwd: root, isGod: true });
  await hive.ensureAgent({ id: 'dev-1', name: '开发', provider: 'claude', cwd: root });

  const outbox = path.join(root, 'hive', 'agents', 'dev-1', 'outbox');
  fs.writeFileSync(path.join(outbox, 'done.json'), JSON.stringify({
    to: 'god', act: 'done', subject: '完成', body: '已验证。'
  }), 'utf8');
  assert.equal(hive.routeOnce(), 1);

  const sent = JSON.parse(fs.readFileSync(path.join(outbox, '.sent', 'done.json'), 'utf8'));
  const deliveredPath = path.join(root, 'hive', 'agents', 'god', 'inbox', `${sent.id}.json`);
  const delivered = JSON.parse(fs.readFileSync(deliveredPath, 'utf8'));
  assert.deepEqual(sent, delivered);
  assert.equal(sent.from, 'dev-1');
  assert.equal(sent.hops, 0);
  assert.equal(typeof sent.created_at, 'string');
});
