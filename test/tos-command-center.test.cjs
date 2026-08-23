'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('TOS snapshot is wired main -> preload -> existing Command Center', () => {
  const main = source('src/main/index.ts');
  const preload = source('src/preload/index.ts');
  const commandCenter = source('src/renderer/src/components/CommandCenterPanel.tsx');
  assert.match(main, /ipcMain\.handle\('teamOs:snapshot'/);
  assert.match(preload, /teamOsSnapshot:\s*\(\).*ipcRenderer\.invoke\('teamOs:snapshot'\)/s);
  assert.match(commandCenter, /key:\s*'projects'/);
  assert.match(commandCenter, /tab === 'projects'.*<TeamOsProjectsPanel/s);
});

test('project overview states its read-only and no-body-copy boundaries', () => {
  const panel = source('src/renderer/src/components/TeamOsProjectsPanel.tsx');
  const resources = source('src/shared/i18n/resources/tos.ts');
  assert.match(panel, /teamOsSnapshot\(\)/);
  assert.match(resources, /只读投影/);
  assert.match(resources, /不会把文档正文、提示词、Transcript、任务或密钥复制进 Munder/);
  assert.match(resources, /结果卡与自动路由属于 TOS3/);
  assert.doesNotMatch(panel, /writeFile|remove|delete|dispatch|spawn/i);
});

test('Team OS home is configurable live without using the destructive harness-home flow', () => {
  const settings = source('src/renderer/src/components/SettingsModal.tsx');
  assert.match(settings, /updateConfig\(\{ teamOsHome: res\.path \}\)/);
  assert.match(settings, /updateConfig\(\{ teamOsHome: undefined \}\)/);
  const teamOsBlock = settings.slice(settings.indexOf('const pickTeamOsHome'), settings.indexOf('const useDefaultTeamOsHome'));
  assert.doesNotMatch(teamOsBlock, /changeHome\(|resetAll\(|relaunch|kill/i);
});
