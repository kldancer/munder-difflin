import { w1_1_en, w1_1_zh } from './resources/w1_1';
import { w1_2_en, w1_2_zh } from './resources/w1_2';
import { w1_3_en, w1_3_zh } from './resources/w1_3';
import { w1_4_en, w1_4_zh } from './resources/w1_4';
import { w1_5_en, w1_5_zh } from './resources/w1_5';
import { w6_en, w6_zh } from './resources/w6';
import { w7_en, w7_zh } from './resources/w7';
import { tos_en, tos_zh } from './resources/tos';

type ResourceTree = Record<string, unknown>;

/** Merge Wave resource fragments recursively. A shallow object spread silently
 * discarded W1.2's `residual.*` keys when W1.3 added its own `residual` group;
 * both locales lost the same keys, so the old parity test stayed green while
 * the real UI rendered literal key names. */
function mergeResources(...layers: readonly ResourceTree[]): ResourceTree {
  const out: ResourceTree = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      const prior = out[key];
      if (value && typeof value === 'object' && !Array.isArray(value)
        && prior && typeof prior === 'object' && !Array.isArray(prior)) {
        out[key] = mergeResources(prior as ResourceTree, value as ResourceTree);
      } else {
        out[key] = value;
      }
    }
  }
  return out;
}

const commonEn = {
  appName: 'Munder Difflin', language: 'Language', languageName: 'English (US)',
  welcome: 'Welcome, {{name}}', agentCount_one: '{{count}} agent',
  agentCount_other: '{{count}} agents', cancel: 'Cancel', save: 'Save'
};
const commonZh = {
  appName: 'Munder Difflin', language: '语言', languageName: '简体中文',
  welcome: '欢迎，{{name}}', agentCount_one: '{{count}} 个 Agent',
  agentCount_other: '{{count}} 个 Agent', cancel: '取消', save: '保存'
};

export const translationResources = {
  'en-US': {
    translation: mergeResources(
      { common: commonEn }, w1_1_en, w1_2_en, w1_3_en, w1_4_en, w1_5_en, w6_en, w7_en, tos_en
    )
  },
  'zh-CN': {
    translation: mergeResources(
      { common: commonZh }, w1_1_zh, w1_2_zh, w1_3_zh, w1_4_zh, w1_5_zh, w6_zh, w7_zh, tos_zh
    )
  }
};
