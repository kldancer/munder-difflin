'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  createAppI18n,
  createTranslator,
  normalizeLocale
} = loadTs('src/shared/i18n/index.ts');

test('locale ids normalize without leaking arbitrary config values', () => {
  assert.equal(DEFAULT_LOCALE, 'zh-CN');
  assert.equal(FALLBACK_LOCALE, 'en-US');
  assert.equal(normalizeLocale('zh-Hans-CN'), 'zh-CN');
  assert.equal(normalizeLocale('en-GB'), 'en-US');
  assert.equal(normalizeLocale('../bad-locale'), 'zh-CN');
});

test('translation supports interpolation and English plural rules', () => {
  const zh = createTranslator('zh-CN');
  const en = createTranslator('en-US');
  assert.equal(zh('common.welcome', { name: 'Michael' }), '欢迎，Michael');
  assert.equal(en('common.agentCount', { count: 1 }), '1 agent');
  assert.equal(en('common.agentCount', { count: 3 }), '3 agents');
});

test('missing Chinese resources fall back to English', () => {
  const instance = createAppI18n('zh-CN');
  instance.removeResourceBundle('zh-CN', 'translation');
  assert.equal(instance.t('common.save'), 'Save');
});

test('resource keys stay aligned across shipped locales', () => {
  const instance = createAppI18n('zh-CN');
  const flatten = (value, prefix = '', out = []) => {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, out);
      else out.push(path);
    }
    return out;
  };
  const en = flatten(instance.getResourceBundle('en-US', 'translation')).sort();
  const zh = flatten(instance.getResourceBundle('zh-CN', 'translation')).sort();
  assert.deepEqual(zh, en);
});

test('resource fragments with the same top-level group are deep-merged', () => {
  const zh = createTranslator('zh-CN');
  assert.equal(zh('residual.officeTheme'), '办公室主题');
  assert.equal(zh('residual.noLiveTerminal').startsWith('此 Agent'), true);
});
