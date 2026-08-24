'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { evaluateOpsStandup } = loadTs('src/main/opsStandup.ts');

const quiet = {
  tasks: [{ id: 't-1', status: 'done', assignee: 'jim-1', openHumanQuestions: 0 }],
  agents: [
    { id: 'god-1', role: 'orchestrator', status: 'idle', isGod: true, breaker: 'ok', actionableInbox: 0 },
    { id: 'jim-1', role: 'developer', status: 'idle', isGod: false, breaker: 'ok', actionableInbox: 0 },
  ],
};

test('first quiet observation establishes a baseline without waking a model', () => {
  const decision = evaluateOpsStandup(quiet);
  assert.equal(decision.shouldDispatch, false);
  assert.equal(decision.reasons.length, 0);
  assert.match(decision.fingerprint, /^[a-f0-9]{64}$/);
});

test('an unchanged quiet floor stays zero-model', () => {
  const first = evaluateOpsStandup(quiet);
  const second = evaluateOpsStandup({
    agents: [...quiet.agents].reverse(),
    tasks: [...quiet.tasks],
  }, first.fingerprint);
  assert.equal(second.shouldDispatch, false);
  assert.equal(second.fingerprint, first.fingerprint, 'input order is not semantic change');
});

test('active work, actionable mail, and breaker alerts are actionable', () => {
  const decision = evaluateOpsStandup({
    tasks: [{ ...quiet.tasks[0], status: 'doing' }],
    agents: quiet.agents.map((agent) => agent.id === 'jim-1'
      ? { ...agent, breaker: 'warn', actionableInbox: 2 }
      : agent),
  });
  assert.equal(decision.shouldDispatch, true);
  assert.deepEqual(decision.reasons, [
    '1 active task(s)',
    '2 actionable inbox message(s)',
    '1 breaker alert(s)',
  ]);
});

test('a quiet semantic transition wakes once, then returns to zero-model', () => {
  const first = evaluateOpsStandup(quiet);
  const changed = {
    ...quiet,
    agents: quiet.agents.map((agent) => agent.id === 'jim-1'
      ? { ...agent, status: 'gone' }
      : agent),
  };
  const transition = evaluateOpsStandup(changed, first.fingerprint);
  assert.equal(transition.shouldDispatch, true);
  assert.deepEqual(transition.reasons, ['semantic task or roster state changed']);
  assert.equal(evaluateOpsStandup(changed, transition.fingerprint).shouldDispatch, false);
});
