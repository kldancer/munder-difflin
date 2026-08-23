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

test('TOS3 catalog and compiler stay behind explicit IPC contracts', () => {
  const main = source('src/main/index.ts');
  const preload = source('src/preload/index.ts');
  assert.match(main, /ipcMain\.handle\('teamOs:preparationCatalog'/);
  assert.match(main, /ipcMain\.handle\('teamOs:compileWorkOrder'/);
  assert.match(preload, /teamOsPreparationCatalog:.*teamOs:preparationCatalog/s);
  assert.match(preload, /teamOsCompileWorkOrder:.*teamOs:compileWorkOrder/s);
});

test('project overview states its read-only and no-body-copy boundaries', () => {
  const panel = source('src/renderer/src/components/TeamOsProjectsPanel.tsx');
  const resources = source('src/shared/i18n/resources/tos.ts');
  assert.match(panel, /teamOsSnapshot\(\)/);
  assert.match(resources, /只读投影/);
  assert.match(resources, /不会把项目文档正文、既有 Prompt、Transcript、任务或密钥复制进 Munder/);
  assert.match(resources, /只生成当前显式工作单草稿/);
  assert.match(resources, /TOS3 工作单是显式草稿/);
  assert.match(resources, /自动路由和推断执行状态仍不在当前范围/);
  assert.doesNotMatch(panel, /writeFile|remove|delete|dispatch|spawn/i);
});

test('Team OS home is configurable live without using the destructive harness-home flow', () => {
  const settings = source('src/renderer/src/components/SettingsModal.tsx');
  assert.match(settings, /updateConfig\(\{ teamOsHome: res\.path \}\)/);
  assert.match(settings, /updateConfig\(\{ teamOsHome: undefined \}\)/);
  const teamOsBlock = settings.slice(settings.indexOf('const pickTeamOsHome'), settings.indexOf('const useDefaultTeamOsHome'));
  assert.doesNotMatch(teamOsBlock, /changeHome\(|resetAll\(|relaunch|kill/i);
});

test('TOS3 preview fills the existing Michael dispatch box but never sends automatically', () => {
  const composer = source('src/renderer/src/components/TeamOsWorkComposer.tsx');
  assert.match(composer, /teamOsCompileWorkOrder/);
  assert.match(composer, /requestDispatchSeed\(compiled\.prompt\)/);
  assert.match(composer, /requestCommandCenterTab\('floor'\)/);
  assert.doesNotMatch(composer, /hiveSend|enqueueMessage|spawnPty/);
});
