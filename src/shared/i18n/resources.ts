import { w1_1_en, w1_1_zh } from './resources/w1_1';
import { w1_2_en, w1_2_zh } from './resources/w1_2';
import { w1_3_en, w1_3_zh } from './resources/w1_3';
import { w1_4_en, w1_4_zh } from './resources/w1_4';
import { w1_5_en, w1_5_zh } from './resources/w1_5';

export const translationResources = {
  'en-US': {
    translation: {
      common: {
        appName: 'Munder Difflin',
        language: 'Language',
        languageName: 'English (US)',
        welcome: 'Welcome, {{name}}',
        agentCount_one: '{{count}} agent',
        agentCount_other: '{{count}} agents',
        cancel: 'Cancel',
        save: 'Save'
      },
      ...w1_1_en,
      ...w1_2_en,
      ...w1_3_en,
      ...w1_4_en,
      ...w1_5_en
    }
  },
  'zh-CN': {
    translation: {
      common: {
        appName: 'Munder Difflin',
        language: '语言',
        languageName: '简体中文',
        welcome: '欢迎，{{name}}',
        agentCount_one: '{{count}} 个 Agent',
        agentCount_other: '{{count}} 个 Agent',
        cancel: '取消',
        save: '保存'
      },
      ...w1_1_zh,
      ...w1_2_zh,
      ...w1_3_zh,
      ...w1_4_zh,
      ...w1_5_zh
    }
  }
} as const;
