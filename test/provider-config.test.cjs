'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  buildOpenCodeRuntimeConfig,
  geminiApiKeySystemSettings,
  inferAgentProvider,
  isAgentProvider,
  providerPreset
} = loadTs('src/shared/agentProvider.ts');
const {
  buildSpawnCommand,
  decodeProviderModel,
  encodeProviderModel,
  modelProvidersForAgent,
  modelsForProvider
} = loadTs('src/renderer/src/store/config.ts');

const autoConfig = { defaultCommand: 'claude', autoMode: true };

test('Kimi is a first-class inferred provider with autonomous defaults', () => {
  assert.equal(isAgentProvider('kimi'), true);
  assert.equal(inferAgentProvider('kimi --auto'), 'kimi');
  const preset = providerPreset('kimi');
  assert.equal(preset.defaultCommand, 'kimi');
  assert.equal(preset.autoFlag, '--auto');
  assert.equal(preset.supportsModel, true);
  assert.equal(preset.canReceiveInbox, false);
  assert.equal(preset.positionalInitialPrompt, undefined);
});

test('Grok is a first-class inferred provider with hooks, resume, and always-approve', () => {
  assert.equal(isAgentProvider('grok'), true);
  assert.equal(inferAgentProvider('/Users/test/.local/bin/grok --model grok-4.5'), 'grok');
  const preset = providerPreset('grok');
  assert.equal(preset.defaultCommand, 'grok');
  assert.equal(preset.autoFlag, '--permission-mode bypassPermissions');
  assert.equal(preset.supportsModel, true);
  assert.equal(preset.canReceiveInbox, true);
  assert.equal(preset.hookBridge, 'grok');
  assert.equal(preset.positionalInitialPrompt, true);
  assert.equal(preset.resumeFlag, '--resume');
});

test('provider commands use matching models and equivalent bypass modes', () => {
  assert.equal(
    buildSpawnCommand(autoConfig, 'claude-sonnet-5', 'claude'),
    'claude --model claude-sonnet-5 --permission-mode bypassPermissions'
  );
  assert.equal(
    buildSpawnCommand(autoConfig, 'gpt-5.6-sol', 'codex'),
    'codex --model gpt-5.6-sol --dangerously-bypass-approvals-and-sandbox'
  );
  assert.equal(
    buildSpawnCommand(autoConfig, 'grok-4.5', 'grok'),
    'grok --model grok-4.5 --permission-mode bypassPermissions'
  );
  assert.equal(
    buildSpawnCommand(autoConfig, 'kimi-code/k3', 'kimi'),
    'kimi --model kimi-code/k3 --auto'
  );
});

test('Codex recommends the current Sol orchestrator model', () => {
  assert.equal(providerPreset('codex').recommendedOrchestratorModel, 'gpt-5.6-sol');
});

test('official Gemini is independent from Antigravity and uses its own CLI contract', () => {
  const preset = providerPreset('gemini');
  assert.equal(isAgentProvider('gemini'), true);
  assert.equal(inferAgentProvider('/opt/homebrew/bin/gemini --model custom'), 'gemini');
  assert.equal(preset.defaultCommand, 'gemini');
  assert.equal(preset.initialPromptFlag, '--prompt-interactive');
  assert.equal(preset.resumeFlag, '--resume');
  assert.equal(preset.bridge.shim, 'gemini');
  assert.equal(buildSpawnCommand(autoConfig, undefined, 'gemini'), 'gemini --approval-mode yolo --skip-trust');
  assert.notEqual(providerPreset('antigravity').defaultCommand, preset.defaultCommand);
});

test('DeepSeek keeps a first-class id while OpenCode is its execution engine', () => {
  const preset = providerPreset('deepseek');
  assert.equal(isAgentProvider('deepseek'), true);
  assert.equal(preset.defaultCommand, 'opencode');
  assert.equal(preset.bridge.shim, 'opencode');
  assert.equal(preset.initialPromptFlag, '--prompt');
  assert.equal(preset.resumeFlag, '--session');
  assert.equal(buildSpawnCommand(autoConfig, 'deepseek/deepseek-v4-pro', 'deepseek'),
    'opencode --model deepseek/deepseek-v4-pro');
  assert.deepEqual(modelsForProvider('deepseek').map((model) => model.id), [
    'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash'
  ]);
});

test('OpenCode auto mode can reach the agent mailbox outside the project cwd', () => {
  assert.deepEqual(buildOpenCodeRuntimeConfig(true), {
    autoupdate: false,
    permission: {
      edit: 'allow',
      bash: 'allow',
      webfetch: 'allow',
      external_directory: 'allow'
    }
  });
  assert.deepEqual(buildOpenCodeRuntimeConfig(false), { autoupdate: false });
});

test('Gemini API-key auth overlay pins the method without containing a key', () => {
  const settings = geminiApiKeySystemSettings();
  assert.deepEqual(settings, {
    security: {
      auth: {
        selectedType: 'gemini-api-key',
        enforcedType: 'gemini-api-key'
      }
    }
  });
  assert.doesNotMatch(JSON.stringify(settings), /api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9]/i);
});

test('model picker options stay provider-specific', () => {
  assert.equal(
    modelsForProvider('claude').find((model) => model.id === 'claude-opus-5')?.label,
    'Opus 5 · 1M'
  );
  assert.deepEqual(
    modelsForProvider('codex').map((model) => model.id),
    [undefined, 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']
  );
  assert.deepEqual(
    modelsForProvider('grok').map((model) => model.id),
    [undefined, 'grok-4.6', 'grok-4.5']
  );
  assert.deepEqual(
    modelsForProvider('kimi').map((model) => model.id),
    [
      undefined,
      'kimi-code/k3',
      'kimi-code/kimi-for-coding',
      'kimi-code/kimi-for-coding-highspeed'
    ]
  );
  assert.deepEqual(modelsForProvider('custom'), []);
});

test('Command Center model choices round-trip provider and model', () => {
  const encoded = encodeProviderModel('antigravity', 'Gemini 3.1 Pro (High)');
  assert.deepEqual(
    decodeProviderModel(encoded),
    { provider: 'antigravity', model: 'Gemini 3.1 Pro (High)' }
  );
  assert.deepEqual(
    decodeProviderModel(encodeProviderModel('kimi')),
    { provider: 'kimi', model: undefined }
  );
  assert.equal(decodeProviderModel('unknown:model'), null);
});

test('God only sees providers that can drain hive inbox messages', () => {
  // God-eligible = supportsModel && canReceiveInbox: kimi and copilot are
  // excluded (no inbox drain path), custom is excluded (no model picker).
  assert.deepEqual(
    modelProvidersForAgent(true).map((preset) => preset.id),
    ['claude', 'codex', 'grok', 'antigravity', 'gemini', 'qwen', 'opencode', 'deepseek', 'crush', 'pi']
  );
  assert.deepEqual(
    modelProvidersForAgent(false).map((preset) => preset.id),
    ['claude', 'codex', 'grok', 'kimi', 'antigravity', 'gemini', 'qwen', 'opencode', 'deepseek', 'crush', 'pi', 'copilot']
  );
});
