#!/usr/bin/env node
'use strict';

/** Wave 6 daily fact check. It reads only fixed Hive files and emits aggregate
 * metadata: never agent names, ids, cwd, prompts, message bodies, memory text,
 * session ids, or credentials. */
const fs = require('node:fs');
const path = require('node:path');

function regularFile(file) {
  try { return fs.lstatSync(file).isFile(); } catch { return false; }
}

function readJson(file, maxBytes = 4 * 1024 * 1024) {
  if (!regularFile(file)) return null;
  const stat = fs.statSync(file);
  if (stat.size > maxBytes) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function fileMeta(file) {
  if (!regularFile(file)) return { present: false, bytes: 0, rows: 0 };
  const bytes = fs.statSync(file).size;
  if (bytes > 16 * 1024 * 1024) return { present: true, bytes, rows: null };
  const text = fs.readFileSync(file, 'utf8');
  return { present: true, bytes, rows: text.split('\n').filter(Boolean).length };
}

function countJson(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json')).length;
  } catch { return 0; }
}

function dailyCheck(harnessHome, now = Date.now()) {
  if (!harnessHome || !path.isAbsolute(harnessHome)) throw new Error('harnessHome must be an absolute path');
  const hive = path.join(harnessHome, 'hive');
  const failures = [];
  const warnings = [];
  const registry = readJson(path.join(hive, 'registry.json'));
  const tasksFile = readJson(path.join(hive, 'tasks.json'));
  if (!registry || typeof registry !== 'object') failures.push('registry.json missing or invalid');
  if (!tasksFile || typeof tasksFile !== 'object') failures.push('tasks.json missing or invalid');

  const agents = registry && registry.agents && typeof registry.agents === 'object'
    ? Object.values(registry.agents) : [];
  const providerCounts = {};
  let active = 0;
  let archived = 0;
  let inboxPending = 0;
  let inboxDone = 0;
  let outboxPending = 0;
  let outboxSent = 0;
  let memoryBytes = 0;
  for (const agent of agents) {
    const provider = typeof agent.provider === 'string' ? agent.provider : 'unknown';
    providerCounts[provider] = (providerCounts[provider] || 0) + 1;
    if (agent.archived) archived++; else active++;
    if (typeof agent.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(agent.id)) continue;
    const base = path.join(hive, 'agents', agent.id);
    inboxPending += countJson(path.join(base, 'inbox'));
    inboxDone += countJson(path.join(base, 'inbox', '.done'));
    outboxPending += countJson(path.join(base, 'outbox'));
    outboxSent += countJson(path.join(base, 'outbox', '.sent'));
    const memory = path.join(base, 'memory.md');
    if (regularFile(memory)) memoryBytes += fs.statSync(memory).size;
  }

  const tasks = Array.isArray(tasksFile?.tasks) ? tasksFile.tasks
    : Array.isArray(tasksFile) ? tasksFile : [];
  const taskStatuses = { todo: 0, doing: 0, blocked: 0, done: 0, other: 0 };
  for (const task of tasks) {
    const status = typeof task?.status === 'string' ? task.status : 'other';
    if (Object.hasOwn(taskStatuses, status)) taskStatuses[status]++;
    else taskStatuses.other++;
  }

  const fleet = readJson(path.join(hive, 'fleet.json'));
  const fleetAgeMs = typeof fleet?.ts === 'number' ? Math.max(0, now - fleet.ts) : null;
  const fleetAgents = Array.isArray(fleet?.agents) ? fleet.agents : [];
  if (!fleet) warnings.push('fleet.json missing; start the app for live status');
  else if (fleetAgeMs !== null && fleetAgeMs > 30_000) warnings.push('fleet.json is stale');

  return {
    format: 1,
    checkedAt: new Date(now).toISOString(),
    ok: failures.length === 0,
    agents: { total: agents.length, active, archived, providers: providerCounts },
    tasks: { total: tasks.length, byStatus: taskStatuses },
    messages: { inboxPending, inboxDone, outboxPending, outboxSent },
    memory: { files: agents.length, bytes: memoryBytes },
    fleet: {
      present: !!fleet,
      ageMs: fleetAgeMs,
      active: fleetAgents.length,
      inboxBacklog: fleetAgents.reduce((sum, row) => sum + (Number(row?.inboxBacklog) || 0), 0),
      breakerArmed: fleetAgents.filter((row) => row?.breaker && !['ok', 'none'].includes(row.breaker)).length
    },
    activityLog: fileMeta(path.join(hive, 'log.jsonl')),
    costLedger: fileMeta(path.join(hive, 'cost-ledger.jsonl')),
    failures,
    warnings
  };
}

function parseHome(argv) {
  const index = argv.indexOf('--home');
  if (index < 0 || !argv[index + 1]) throw new Error('usage: w6-daily-check --home /absolute/harnessHome');
  return path.resolve(argv[index + 1]);
}

if (require.main === module) {
  try {
    const result = dailyCheck(parseHome(process.argv.slice(2)));
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

module.exports = { dailyCheck };
