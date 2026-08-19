'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { SAFE_DEFAULTS } = loadTs('src/shared/safetyDefaults.ts');
const { buildSpawnCommand } = loadTs('src/renderer/src/store/config.ts');

test('new installs keep bypass, telemetry, and public entry points off', () => {
  assert.deepEqual(SAFE_DEFAULTS, {
    autoMode: false,
    telemetryEnabled: false,
    slackEnabled: false,
    webhookEnabled: false
  });
});

test('safe Codex config never appends the dangerous bypass flag', () => {
  const command = buildSpawnCommand(
    { defaultCommand: 'codex', autoMode: SAFE_DEFAULTS.autoMode },
    'gpt-5.6-sol',
    'codex'
  );
  assert.equal(command, 'codex --model gpt-5.6-sol');
  assert.doesNotMatch(command, /dangerously-bypass-approvals-and-sandbox/);
});

test('an existing explicit opt-in still appends the provider-specific flag', () => {
  const command = buildSpawnCommand(
    { defaultCommand: 'codex', autoMode: true },
    'gpt-5.6-sol',
    'codex'
  );
  assert.match(command, /--dangerously-bypass-approvals-and-sandbox$/);
});
