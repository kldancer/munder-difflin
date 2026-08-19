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
  const en = Object.keys(instance.getResourceBundle('en-US', 'translation').common).sort();
  const zh = Object.keys(instance.getResourceBundle('zh-CN', 'translation').common).sort();
  assert.deepEqual(zh, en);
});
