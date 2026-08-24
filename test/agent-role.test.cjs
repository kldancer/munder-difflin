'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  inferLegacyRoleSelection,
  mergeRoleCapabilities,
  resolveRoleBinding
} = loadTs('src/shared/agentRole.ts');

test('maps legacy manual templates onto Team OS role ids and default capability profiles', () => {
  assert.deepEqual(
    inferLegacyRoleSelection('中文开发工程师，负责有界实现与适用验证'),
    { roleId: 'delivery-engineer', defaultCapabilityProfileIds: [] }
  );
  assert.deepEqual(
    inferLegacyRoleSelection('中文测试工程师，负责可复现验证与运行证据'),
    { roleId: 'quality-verifier', defaultCapabilityProfileIds: ['test-engineering'] }
  );
  assert.equal(inferLegacyRoleSelection('我自己的特殊职责'), null);
});

test('refreshes a role binding from the current catalog and preserves it during catalog outage', () => {
  const old = { id: 'delivery-engineer', label: '旧标签', authority: 'old' };
  const current = {
    id: 'delivery-engineer', label: '端到端交付', capabilities: ['implementation'],
    authority: 'assigned-local-write', writePolicy: 'single-writer', knownBlindSpots: ['capability-gap']
  };
  assert.deepEqual(resolveRoleBinding('delivery-engineer', [current], old), current);
  assert.deepEqual(resolveRoleBinding('delivery-engineer', [], old), old);
  assert.deepEqual(resolveRoleBinding('quality-verifier', []), { id: 'quality-verifier', label: '质量验证' });
});

test('role capabilities and imported hire tags merge without changing authorization', () => {
  assert.deepEqual(
    mergeRoleCapabilities({ id: 'delivery-engineer', label: '交付', capabilities: ['implementation', 'integration'] }, ['docs', 'implementation']),
    ['implementation', 'integration', 'docs']
  );
});
