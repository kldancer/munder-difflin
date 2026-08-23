'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const {
  compileTeamOsWorkOrder,
  loadTeamOsPreparationCatalog,
  loadTeamOsSnapshot,
  resolveTeamOsHome,
  TEAM_OS_LIMITS
} = loadTs('src/main/teamOs.ts');

function file(filename, content) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
}

function fixture() {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'tos-loader-'));
  const teamOsHome = path.join(outer, 'team-os');
  const projectRoot = path.join(outer, 'project');
  file(path.join(projectRoot, 'AGENTS.md'), '# rules\nPRIVATE-BODY-MUST-NOT-CROSS');
  file(path.join(projectRoot, 'docs', 'workflow.md'), '# workflow');
  fs.mkdirSync(path.join(projectRoot, '.work', 'gates'), { recursive: true });
  file(path.join(teamOsHome, 'projects', 'registry.json'), JSON.stringify({
    version: 1,
    projects: [{ id: 'sample', name: 'Sample', adapter: 'projects/adapters/sample.yaml', enabled: true }]
  }));
  file(path.join(teamOsHome, 'projects', 'adapters', 'sample.yaml'), [
    'version: 1', 'id: sample', 'name: Sample', `root: ${projectRoot}`, 'mode: read-only',
    'authority:', '  agents: AGENTS.md', '  workflow: docs/workflow.md',
    'evidence:', '  gateReceipts: .work/gates',
    'constraints:', '  copyAuthorityDocuments: false', '  allowGitMutation: false'
  ].join('\n'));
  file(path.join(teamOsHome, 'roles', 'capabilities.yaml'), [
    'version: 2',
    'roles:',
    '  - id: delivery-engineer',
    '    label: 端到端交付',
    '    capabilities: [implementation, validation]',
    '    authority: assigned-local-write',
    '    writePolicy: single-writer',
    '    knownBlindSpots: [needs-specialist-for-gaps]',
    'capabilityProfiles:',
    '  - id: frontend-engineering',
    '    label: 前端工程',
    '    activationSignals: [electron-ui]',
    '    evidence: [component-contract, real-entry]',
    '    defaultMode: overlay'
  ].join('\n'));
  file(path.join(teamOsHome, 'templates', 'outcome-card.yaml'), 'version: 3\nid: example\n');
  return { outer, teamOsHome, projectRoot };
}

test('resolves configured, environment, and default homes without hardcoding a user path', () => {
  assert.deepEqual(resolveTeamOsHome({ configuredHome: '~/custom', environmentHome: '/ignored', userHome: '/home/test' }), {
    path: '/home/test/custom', source: 'config'
  });
  assert.deepEqual(resolveTeamOsHome({ environmentHome: '/env/team-os', userHome: '/home/test' }), {
    path: '/env/team-os', source: 'environment'
  });
  assert.deepEqual(resolveTeamOsHome({ userHome: '/home/test' }), {
    path: '/home/test/Munder-Difflin/team-os', source: 'default'
  });
});

test('loads only bounded project metadata and never copies authority content', () => {
  const { teamOsHome, projectRoot } = fixture();
  const result = loadTeamOsSnapshot({ configuredHome: teamOsHome, now: 0 });
  assert.equal(result.status, 'ready');
  assert.equal(result.loadedAt, '1970-01-01T00:00:00.000Z');
  assert.equal(result.projects[0].status, 'ready');
  assert.equal(result.projects[0].root, projectRoot);
  assert.equal(result.projects[0].references.length, 3);
  assert.equal(result.projects[0].references.every((ref) => ref.exists), true);
  assert.deepEqual(result.projects[0].constraints, { copyAuthorityDocuments: false, allowGitMutation: false });
  assert.equal(JSON.stringify(result).includes('PRIVATE-BODY-MUST-NOT-CROSS'), false);
  assert.deepEqual(result.policy, { readOnly: true, contentCopied: false, autoRouting: false, terminalFallback: true });
});

test('loads the bounded TOS3 role catalog and template contract', () => {
  const { teamOsHome } = fixture();
  const result = loadTeamOsPreparationCatalog({ configuredHome: teamOsHome });
  assert.equal(result.status, 'ready');
  assert.equal(result.outcomeTemplateVersion, 3);
  assert.deepEqual(result.roles.map((role) => role.id), ['delivery-engineer']);
  assert.deepEqual(result.capabilityProfiles.map((profile) => profile.id), ['frontend-engineering']);
});

test('compiles a reviewable work order from role deltas and references without project bodies or implicit write grants', () => {
  const { teamOsHome, projectRoot } = fixture();
  const result = compileTeamOsWorkOrder({ configuredHome: teamOsHome }, {
    projectId: 'sample',
    roleId: 'delivery-engineer',
    capabilityProfileIds: ['frontend-engineering'],
    outcome: '在现有入口交付一个可验证结果',
    nonGoals: ['不新增任务系统'],
    acceptance: ['现有入口可观察结果'],
    stopConditions: ['超过硬止损或边界改变'],
    targetMinutes: 60,
    hardStopMinutes: 120,
    localWrite: true,
    locale: 'zh-CN'
  });
  assert.equal(result.ok, true);
  assert.match(result.prompt, /Team OS 工作单（TOS3）/);
  assert.match(result.prompt, /frontend-engineering/);
  assert.match(result.prompt, /AGENTS\.md/);
  assert.match(result.prompt, /角色合同（不等于本任务授权）/);
  assert.equal(result.prompt.includes('PRIVATE-BODY-MUST-NOT-CROSS'), false);
  assert.deepEqual(result.resultCard.authorization, {
    localWrite: true, remoteWrite: false, destructive: false
  });
  assert.deepEqual(result.resultCard.scope.write, [projectRoot]);
  assert.deepEqual(result.resultCard.acceptance, ['现有入口可观察结果']);
  assert.deepEqual(result.resultCard.budget, { targetMinutes: 60, hardStopMinutes: 120 });
  assert.deepEqual(result.resultCard.stopConditions, ['超过硬止损或边界改变']);
  assert.equal(result.promptBytes, Buffer.byteLength(result.prompt, 'utf8'));
});

test('requires acceptance and stop conditions and rejects an inverted time budget', () => {
  const { teamOsHome } = fixture();
  const missing = compileTeamOsWorkOrder({ configuredHome: teamOsHome }, {
    projectId: 'sample', roleId: 'delivery-engineer', capabilityProfileIds: [], outcome: 'test',
    acceptance: [], stopConditions: []
  });
  assert.equal(missing.ok, false);
  assert.match(missing.error.message, /acceptance must contain at least one item/);
  const inverted = compileTeamOsWorkOrder({ configuredHome: teamOsHome }, {
    projectId: 'sample', roleId: 'delivery-engineer', capabilityProfileIds: [], outcome: 'test',
    acceptance: ['pass'], stopConditions: ['stop'], targetMinutes: 120, hardStopMinutes: 60
  });
  assert.equal(inverted.ok, false);
  assert.match(inverted.error.message, /hardStopMinutes/);

  const defaultAuthorization = compileTeamOsWorkOrder({ configuredHome: teamOsHome }, {
    projectId: 'sample', roleId: 'delivery-engineer', capabilityProfileIds: [], outcome: 'test',
    acceptance: ['pass'], stopConditions: ['stop']
  });
  assert.equal(defaultAuthorization.ok, true);
  assert.deepEqual(defaultAuthorization.resultCard.authorization, {
    localWrite: false, remoteWrite: false, destructive: false
  });
  assert.deepEqual(defaultAuthorization.resultCard.scope.write, []);
});

test('rejects unknown TOS3 roles and capability profiles explicitly', () => {
  const { teamOsHome } = fixture();
  const unknownRole = compileTeamOsWorkOrder({ configuredHome: teamOsHome }, {
    projectId: 'sample', roleId: 'missing-role', capabilityProfileIds: [], outcome: 'test'
  });
  assert.equal(unknownRole.ok, false);
  assert.match(unknownRole.error.message, /role does not exist/);
  const unknownCapability = compileTeamOsWorkOrder({ configuredHome: teamOsHome }, {
    projectId: 'sample', roleId: 'delivery-engineer', capabilityProfileIds: ['missing-capability'], outcome: 'test'
  });
  assert.equal(unknownCapability.ok, false);
  assert.match(unknownCapability.error.message, /capability profile does not exist/);
});

test('missing Team OS degrades explicitly without throwing', () => {
  const missing = path.join(os.tmpdir(), `missing-team-os-${Date.now()}`);
  const result = loadTeamOsSnapshot({ configuredHome: missing });
  assert.equal(result.status, 'missing');
  assert.equal(result.error.code, 'TEAM_OS_HOME_MISSING');
  assert.equal(result.policy.terminalFallback, true);
  assert.deepEqual(result.projects, []);
});

test('one invalid adapter remains visible and does not hide valid projects', () => {
  const { teamOsHome } = fixture();
  const registryPath = path.join(teamOsHome, 'projects', 'registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.projects.push({ id: 'bad', name: 'Bad', adapter: 'projects/adapters/bad.yaml', enabled: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry));
  file(path.join(teamOsHome, 'projects', 'adapters', 'bad.yaml'), 'version: 1\nid: bad\nroot: relative\nmode: write\n');
  const result = loadTeamOsSnapshot({ configuredHome: teamOsHome });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.projects.map((project) => project.status), ['ready', 'invalid']);
  assert.equal(result.projects[1].error.code, 'ADAPTER_INVALID');
});

test('malformed adapter diagnostics never copy the offending YAML line', () => {
  const { teamOsHome } = fixture();
  const marker = 'PRIVATE-ADAPTER-LINE-MUST-NOT-CROSS';
  file(path.join(teamOsHome, 'projects', 'adapters', 'sample.yaml'), `version: 1\nsecret: [${marker}\n`);
  const result = loadTeamOsSnapshot({ configuredHome: teamOsHome });
  assert.equal(result.projects[0].status, 'invalid');
  assert.equal(result.projects[0].error.message, 'adapter YAML is invalid');
  assert.equal(JSON.stringify(result).includes(marker), false);
});

test('rejects adapter traversal and project-reference symlink escapes', () => {
  const { outer, teamOsHome, projectRoot } = fixture();
  file(path.join(teamOsHome, 'projects', 'registry.json'), JSON.stringify({
    version: 1,
    projects: [{ id: 'escape', name: 'Escape', adapter: '../outside.yaml', enabled: true }]
  }));
  let result = loadTeamOsSnapshot({ configuredHome: teamOsHome });
  assert.equal(result.projects[0].status, 'invalid');
  assert.match(result.projects[0].error.message, /escapes/);

  const outside = path.join(outer, 'outside-secret.md');
  file(outside, 'secret');
  fs.symlinkSync(outside, path.join(projectRoot, 'escaped.md'));
  file(path.join(teamOsHome, 'projects', 'registry.json'), JSON.stringify({
    version: 1,
    projects: [{ id: 'sample', name: 'Sample', adapter: 'projects/adapters/sample.yaml', enabled: true }]
  }));
  file(path.join(teamOsHome, 'projects', 'adapters', 'sample.yaml'), [
    'version: 1', 'id: sample', 'name: Sample', `root: ${projectRoot}`, 'mode: read-only',
    'authority:', '  escaped: escaped.md',
    'constraints:', '  copyAuthorityDocuments: false', '  allowGitMutation: false'
  ].join('\n'));
  result = loadTeamOsSnapshot({ configuredHome: teamOsHome });
  assert.equal(result.projects[0].status, 'invalid');
  assert.match(result.projects[0].error.message, /outside its root/);
});

test('rejects oversized registry files before parsing', () => {
  const { teamOsHome } = fixture();
  fs.writeFileSync(path.join(teamOsHome, 'projects', 'registry.json'), 'x'.repeat(TEAM_OS_LIMITS.registryBytes + 1));
  const result = loadTeamOsSnapshot({ configuredHome: teamOsHome });
  assert.equal(result.status, 'invalid');
  assert.match(result.error.message, /read limit/);
});
