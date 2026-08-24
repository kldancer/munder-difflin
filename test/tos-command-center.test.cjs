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

test('project overview exposes conversational planning without copying authority bodies', () => {
  const panel = source('src/renderer/src/components/TeamOsProjectsPanel.tsx');
  const resources = source('src/shared/i18n/resources/tos.ts');
  assert.match(panel, /teamOsSnapshot\(\)/);
  assert.match(panel, /teamOsWorkspaces\(project\.id\)/);
  assert.match(panel, /teamOsStartFromConclusion\(project\.id\)/);
  assert.match(panel, /enqueueMessage\(michael\.id, result\.prompt\)/);
  assert.match(panel, /onTeamOsPlanState/);
  assert.match(resources, /只读投影/);
  assert.match(resources, /项目文档正文、Transcript 与密钥留在各自权威路径/);
  assert.match(resources, /角色分配与 Gate 状态由确定性协调器校验并展示/);
  assert.match(resources, /按结论开始推进/);
  assert.doesNotMatch(panel, /writeFile|remove|delete|spawnPty/i);
});

test('start-from-conclusion is a durable same-session Michael plan lifecycle', () => {
  const main = source('src/main/index.ts');
  const providers = source('src/shared/agentProvider.ts');
  const preload = source('src/preload/index.ts');
  const planning = source('src/main/teamOsPlanning.ts');
  const queue = source('src/renderer/src/components/MessageQueueComposer.tsx');
  assert.match(main, /ipcMain\.handle\('teamOs:startFromConclusion'/);
  assert.match(main, /ipcMain\.handle\('teamOs:planStates'/);
  assert.match(preload, /teamOsStartFromConclusion:.*teamOs:startFromConclusion/s);
  assert.match(preload, /teamOsPlanStates:.*teamOs:planStates/s);
  assert.match(planning, /submit\.json/);
  assert.match(planning, /validatePlanManifest/);
  assert.match(planning, /allocatePlan/);
  assert.match(queue, /START_FROM_CONCLUSION = '按结论开始推进'/);
  assert.match(queue, /enqueueMessage\(agent\.id, result\.prompt\)/);
  assert.match(providers, /recommendedOrchestratorModel: 'gpt-5\.6-sol'/);
  assert.match(providers, /recommendedWorkerModel: 'gpt-5\.6-luna'/);
  assert.match(main, /defaultCommandForProvider\(provider, config\.defaultCommand\)/);
  assert.match(main, /autoModeFlagForProvider\(provider\).*split\(\/\\s\+\//s);
  assert.match(main, /const launchArgs = \[\.\.\.autoArgs, \.\.\.modelArgs\]/);
  assert.match(main, /args: launchArgs/);
  assert.match(main, /formatTeamOsSpawnCommand\(command, launchArgs\)/);
  assert.match(main, /config\.providerDefaultModels\?\.\[provider\] \?\? preset\.recommendedWorkerModel/);
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
