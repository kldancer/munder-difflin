'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { taskCoordination } = loadTs('src/renderer/src/components/taskCoordination.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

const card = (id, extra = {}) => ({
  id, title: id, status: 'todo', dependsOn: [], priority: 3,
  createdAt: '2026-08-20T08:00:00.000Z', ...extra
});

const message = (id, extra = {}) => ({
  id, conversation: 'conv-1', in_reply_to: null, from: 'kevin', to: 'god',
  act: 'request', subject: id, body: 'redacted', requires_reply: false,
  created_at: `2026-08-20T08:00:0${id.slice(-1)}.000Z`, ...extra
});

test('旧卡兼容 deps 别名且无 conversations 时不推断消息', () => {
  const kanban = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/components/TasksKanban.tsx'), 'utf8');
  assert.match(kanban, /Array\.isArray\(t\.deps\) \? t\.deps/);
  const tasks = [card('legacy', { dependsOn: ['missing-task'] })];
  const result = taskCoordination(tasks[0], tasks, [message('m1')]);
  assert.deepEqual(result.missingDependencies, ['missing-task']);
  assert.match(result.waiting, /缺失依赖/);
  assert.deepEqual(result.messages, []);
});

test('依赖按精确任务 ID 解析并指出当前等待的任务', () => {
  const tasks = [card('current', { dependsOn: ['done-task', 'doing-task'] }),
    card('done-task', { status: 'done', title: '已完成' }),
    card('doing-task', { status: 'doing', title: '仍在执行' })];
  const result = taskCoordination(tasks[0], tasks);
  assert.deepEqual(result.missingDependencies, []);
  assert.match(result.waiting, /仍在执行/);
  assert.equal(result.dependencies[1].status, 'doing');
});

test('Conversation 消息按时间排序并用 in_reply_to 判断未回复项', () => {
  const task = card('current', { conversations: ['conv-1'] });
  const result = taskCoordination(task, [task], [
    message('m2', { created_at: '2026-08-20T08:00:02.000Z', in_reply_to: 'm1' }),
    message('m1', { requires_reply: true, created_at: '2026-08-20T08:00:01.000Z' }),
    message('other', { conversation: 'conv-other', requires_reply: true })
  ]);
  assert.deepEqual(result.messages.map((m) => m.id), ['m1', 'm2']);
  assert.match(result.waiting, /当前没有明确等待项/);
  assert.equal(result.messages[1].in_reply_to, 'm1');
});

test('未回复的精确 Conversation 消息指出负责人和消息 ID', () => {
  const task = card('current', { conversations: ['conv-1'] });
  const result = taskCoordination(task, [task], [message('m1', { requires_reply: true, to: 'meredith' })]);
  assert.match(result.waiting, /meredith/);
  assert.match(result.waiting, /m1/);
});

test('既有人工问答仍优先说明正在等待用户', () => {
  const task = card('current', { status: 'blocked', humanQA: [{ q: '采用 A 还是 B？' }] });
  const result = taskCoordination(task, [task]);
  assert.match(result.waiting, /等待人工回答/);
  assert.match(result.waiting, /采用 A 还是 B/);
});

test('Main 只读层按 Conversation 精确筛选、保留回复 ID 并先脱敏', () => {
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w7-conversation-'));
  const inbox = path.join(root, 'hive', 'agents', 'god', 'inbox', '.done');
  fs.mkdirSync(inbox, { recursive: true });
  const target = {
    ...message('reply-1', { conversation: 'conv-target', in_reply_to: 'request-1' }),
    body: 'Authorization: Bearer abcDEF0123456789xyzqrst'
  };
  fs.writeFileSync(path.join(inbox, 'target.json'), JSON.stringify(target));
  fs.writeFileSync(path.join(inbox, 'other.json'), JSON.stringify(message('other', { conversation: 'conv-other' })));
  const hive = new HiveManager(() => root);
  const result = hive.voiceMessages({ conversations: ['conv-target'], includeArchived: true, limit: 40 });
  assert.equal(result.length, 1);
  assert.equal(result[0].in_reply_to, 'request-1');
  assert.equal(result[0].body.includes('abcDEF0123456789'), false);
  assert.match(result[0].body, /\[redacted\]/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('任务详情复用已测试的协调解析器，不维护第二套等待算法', () => {
  const kanban = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/components/TasksKanban.tsx'), 'utf8');
  assert.match(kanban, /const coordination = taskCoordination\(task, all, messages\)/);
  assert.doesNotMatch(kanban, /const unanswered = messages\.filter/);
});
