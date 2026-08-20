'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { summarizeFleet } = loadTs('src/renderer/src/components/fleetStatusSummary.ts');

test('fleet summary projects existing roster facts without inventing state', () => {
  const summary = summarizeFleet([
    { id: 'god', name: 'Michael', provider: 'codex', status: 'working', hasLivePty: true, action: 'reviewing', activityAt: 30 },
    { id: 'gem', name: 'Pam', provider: 'gemini', status: 'waiting', hasLivePty: true, action: 'waiting for Michael', activityAt: 20 },
    { id: 'deep', name: 'Dwight', provider: 'deepseek', status: 'blocked', hasLivePty: false, action: 'needs input', activityAt: 10 },
    { id: 'loop', name: 'Jim', provider: 'codex', status: 'looping', hasLivePty: true, action: '' }
  ]);

  assert.deepEqual(
    { total: summary.total, live: summary.live, working: summary.working, waiting: summary.waiting, blocked: summary.blocked },
    { total: 4, live: 3, working: 1, waiting: 1, blocked: 2 }
  );
  assert.deepEqual(summary.providers, [
    { provider: 'codex', count: 2 },
    { provider: 'deepseek', count: 1 },
    { provider: 'gemini', count: 1 }
  ]);
  assert.deepEqual(summary.recent.map((item) => item.id), ['god', 'gem', 'deep']);
});

test('recent activity is bounded and empty action text is omitted', () => {
  const summary = summarizeFleet([
    { id: 'a', name: 'A', provider: 'codex', status: 'idle', hasLivePty: true, action: '  ' },
    { id: 'b', name: 'B', provider: 'codex', status: 'thinking', hasLivePty: true, action: 'thinking' }
  ], 1);
  assert.deepEqual(summary.recent, [
    { id: 'b', name: 'B', provider: 'codex', action: 'thinking' }
  ]);
});
