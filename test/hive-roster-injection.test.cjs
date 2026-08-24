'use strict';

/**
 * God has to know the LIVE floor across its own restarts — a roster it read once
 * goes stale, and it then messages agents that were archived or killed. So the
 * roster is PUSHED into god's context on SessionStart and only when its semantic
 * facts change after that. Volatile telemetry must not spend prompt context.
 *
 * Only one `additionalContext` may be returned per hook, so the roster and the
 * operator-steer path must MERGE — otherwise they silently displace each other.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

// hooks.ts pulls Notification from electron; outside Electron that resolve gives
// a path string, so seed the cache with the surface the server actually touches.
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

const CONFIG = { notifications: false };

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-roster-inj-'));
}

async function floor(t, { steer } = {}) {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god-1', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'jim-1', name: 'Jim', provider: 'claude', cwd: home });

  const control = steer
    ? { takeSteer: (id) => (id === 'god-1' ? steer : null), shouldHalt: () => false, toolDecision: () => ({ deny: false }) }
    : undefined;
  const server = new HookServer(hive, () => null, () => CONFIG, control, undefined);
  const fire = (agent_id, hook_event_name) => server.handle({ agent_id, hook_event_name, session_id: 's1' });
  return { home, hive, server, fire };
}

function snapshot(hive) {
  hive.writeFleetSnapshot({
    ts: Date.now() - 4000,
    agents: [
      { id: 'god-1', name: 'Michael', role: 'orchestrator', status: 'working', isGod: true, breaker: 'ok', tokens: 812_400, usd: 4.2199, lastActiveSecAgo: 6, inboxBacklog: 2 },
      { id: 'jim-1', name: 'Jim', role: 'agent', status: 'blocked', breaker: 'warn', tokens: 120_401, usd: 1.0231, lastActiveSecAgo: 240, inboxBacklog: 0 },
      { id: 'pam-1', name: 'Pam', role: 'agent', status: 'idle', breaker: 'ok', tokens: 0, usd: 0, lastActiveSecAgo: null, inboxBacklog: 0 }
    ]
  });
}

const context = (res) => res?.hookSpecificOutput?.additionalContext ?? '';

test('the roster line carries compact semantic floor state only', async (t) => {
  const { hive } = await floor(t);
  assert.equal(hive.rosterContext(), null, 'no snapshot yet — inject nothing rather than noise');

  snapshot(hive);
  const line = hive.rosterContext();

  assert.ok(!line.includes('\n'), 'must stay a single compact line');
  for (const id of ['god-1', 'jim-1', 'pam-1']) assert.ok(line.includes(id), `missing ${id}`);
  assert.doesNotMatch(line, /tok|\$4\.22|ago|snapshot/i);
  assert.match(line, /inbox 2/);
  assert.match(line, /breaker warn/);
  assert.match(line, /god-1[^;]*you/, 'god has to be able to spot itself');
  assert.match(line, /working|blocked|idle/);
  assert.match(line, /supersedes/i, 'the point is to override what god remembers');
  assert.ok(line.length < 500, `too long for a 3-agent floor: ${line.length} chars`);
});

test('god gets roster at SessionStart, then only after semantic change', async (t) => {
  const { hive, fire } = await floor(t);
  snapshot(hive);

  const start = await fire('god-1', 'SessionStart');
  assert.match(context(start), /LIVE ROSTER/);
  assert.equal(start.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.doesNotMatch(context(await fire('god-1', 'UserPromptSubmit')), /LIVE ROSTER/);

  snapshot(hive); // timestamp/token/activity changed, semantic facts did not
  assert.doesNotMatch(context(await fire('god-1', 'UserPromptSubmit')), /LIVE ROSTER/);

  const snap = JSON.parse(fs.readFileSync(path.join(hive.root(), 'fleet.json'), 'utf8'));
  snap.agents.find((a) => a.id === 'jim-1').status = 'working';
  hive.writeFleetSnapshot(snap);
  assert.match(context(await fire('god-1', 'UserPromptSubmit')), /LIVE ROSTER/);

  assert.doesNotMatch(context(await fire('jim-1', 'SessionStart')), /LIVE ROSTER/);
  assert.doesNotMatch(context(await fire('jim-1', 'UserPromptSubmit')), /LIVE ROSTER/);
  assert.doesNotMatch(context(await fire('god-1', 'PostToolUse')), /LIVE ROSTER/,
    'prompt boundaries only — not once per tool call');
});

test('a queued operator steer is not swallowed by the roster', async (t) => {
  const steer = 'OPERATOR: stop and summarize.';
  const { hive, fire } = await floor(t, { steer });
  snapshot(hive);

  await fire('god-1', 'SessionStart');
  const snap = JSON.parse(fs.readFileSync(path.join(hive.root(), 'fleet.json'), 'utf8'));
  snap.agents.push({ id: 'kevin-1', name: 'Kevin', role: 'reviewer', status: 'idle', breaker: 'ok' });
  hive.writeFleetSnapshot(snap);
  const ctx = context(await fire('god-1', 'UserPromptSubmit'));
  assert.match(ctx, /LIVE ROSTER/);
  assert.ok(ctx.includes(steer), 'only one additionalContext exists — the two must merge, not race');
});

test('halt uses an event-compatible deny at PreToolUse and stops later boundaries', async (t) => {
  const { hive } = await floor(t);
  const control = {
    shouldHalt: () => true,
    toolDecision: () => ({ deny: false }),
    takeSteer: () => null
  };
  const server = new HookServer(hive, () => null, () => CONFIG, control, undefined);

  const pre = server.handle({ agent_id: 'jim-1', hook_event_name: 'PreToolUse', tool_name: 'Bash' });
  assert.equal(pre.continue, undefined, 'Codex rejects continue:false on PreToolUse');
  assert.equal(pre.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(pre.hookSpecificOutput.permissionDecisionReason, /Halted by the operator/);

  for (const event of ['PostToolUse', 'Stop', 'UserPromptSubmit']) {
    const res = server.handle({ agent_id: 'jim-1', hook_event_name: event });
    assert.equal(res.continue, false, `${event} supports a clean turn stop`);
    assert.match(res.stopReason, /Halted by the operator/);
  }
});

test('a corrupt fleet.json degrades to no injection instead of throwing into a hook', async (t) => {
  const { home, hive, fire } = await floor(t);
  snapshot(hive);
  fs.writeFileSync(path.join(home, 'hive', 'fleet.json'), '{ not json');

  assert.equal(hive.rosterContext(), null);
  const res = await fire('god-1', 'SessionStart');
  assert.doesNotMatch(context(res), /LIVE ROSTER/);
});
