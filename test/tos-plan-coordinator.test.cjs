'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const {
  allocatePlan,
  buildStartFromConclusionPrompt,
  buildTeamOsPlanOutputSchema,
  formatTeamOsSpawnCommand,
  validatePlanManifest
} = loadTs('src/main/teamOsPlan.ts');
const { TeamOsPlanCoordinator, listPlanningStates, startFromConclusion, submitPlanningResult } = loadTs('src/main/teamOsPlanning.ts');

const projectRoot = '/tmp/team-os-project';
const serviceRoot = '/tmp/team-os-service';

function context() {
  return {
    requestId: 'plan-1',
    project: {
      id: 'sample', name: 'Sample', root: projectRoot, status: 'ready', enabled: true,
      adapterPath: '/tmp/adapter.yaml', mode: 'read-only', constraints: {},
      references: [{ group: 'authority', key: 'agents', relativePath: 'AGENTS.md', absolutePath: `${projectRoot}/AGENTS.md`, exists: true, kind: 'file' }]
    },
    roles: [
      { id: 'delivery-engineer', label: '端到端交付', capabilities: [], authority: 'local', writePolicy: 'single', knownBlindSpots: [] },
      { id: 'quality-verifier', label: '质量验证', capabilities: [], authority: 'read', writePolicy: 'receipt', knownBlindSpots: [] }
    ],
    capabilityProfiles: [{ id: 'frontend-engineering', label: '前端', activationSignals: [], evidence: [], defaultMode: 'overlay' }],
    workspaces: [{ key: 'service', kind: 'service', path: serviceRoot, exists: true, directory: true, mode: 'managed' }],
    allowLocalWrite: true
  };
}

function task(id, overrides = {}) {
  return {
    id,
    title: id,
    objective: `完成 ${id}`,
    roleId: 'delivery-engineer',
    capabilityProfileIds: ['frontend-engineering'],
    workspaceKey: 'service',
    dependsOn: [],
    read: ['.'],
    write: [`src/${id}`],
    acceptance: ['目标行为可观察'],
    validation: ['目标测试通过'],
    stopConditions: ['边界改变时停止'],
    targetMinutes: 30,
    hardStopMinutes: 60,
    ...overrides
  };
}

function manifest(tasks) {
  return {
    version: 1,
    requestId: 'plan-1',
    projectId: 'sample',
    outcome: '自动组织团队完成已讨论结论',
    nonGoals: ['不做远端写入'],
    authorization: { localWrite: true, gitWrite: false, remoteWrite: false, productionWrite: false, destructive: false },
    tasks,
    gates: [{ id: 'g1', label: '实现 Gate', taskIds: tasks.map((entry) => entry.id), evidence: ['测试与真实入口'] }]
  };
}

test('validates and normalizes a bounded DAG with workspace-derived cwd', () => {
  const result = validatePlanManifest(manifest([
    task('implement'),
    task('verify', { roleId: 'quality-verifier', capabilityProfileIds: [], dependsOn: ['implement'], write: ['.work/verify'] })
  ]), context());
  assert.equal(result.ok, true);
  assert.equal(result.plan.tasks[0].cwd, serviceRoot);
  assert.equal(result.plan.tasks[0].write[0], `${serviceRoot}/src/implement`);
  assert.deepEqual(result.plan.authorization, {
    localWrite: true, gitWrite: false, remoteWrite: false, productionWrite: false, destructive: false
  });
});

test('rejects cycles, unordered overlapping writes, and widened authorization', () => {
  const cycle = validatePlanManifest(manifest([
    task('a', { dependsOn: ['b'] }), task('b', { dependsOn: ['a'] })
  ]), context());
  assert.equal(cycle.ok, false);
  assert.match(cycle.error.message, /cycle/);

  const overlap = validatePlanManifest(manifest([
    task('a', { write: ['src/shared'] }), task('b', { write: ['src/shared/file.ts'] })
  ]), context());
  assert.equal(overlap.ok, false);
  assert.match(overlap.error.message, /overlapping write scopes/);

  const widened = manifest([task('a')]);
  widened.authorization.gitWrite = true;
  const auth = validatePlanManifest(widened, context());
  assert.equal(auth.ok, false);
  assert.match(auth.error.message, /gitWrite/);

  const projectDenied = context();
  projectDenied.project = { ...projectDenied.project, constraints: { allowRuntimeWrite: false } };
  const denied = validatePlanManifest(manifest([task('a')]), projectDenied);
  assert.equal(denied.ok, false);
  assert.match(denied.error.message, /project adapter/);
});

test('reuses one idle role instance serially and spawns distinct instances for parallel lanes', () => {
  const validated = validatePlanManifest(manifest([
    task('a'), task('b'), task('later', { dependsOn: ['a', 'b'] })
  ]), context());
  assert.equal(validated.ok, true);
  const roster = [{ id: 'delivery-existing', name: '交付', role: 'delivery-engineer', cwd: serviceRoot, status: 'idle', provider: 'codex', sessionId: 'session-1' }];
  const first = allocatePlan(validated.plan, roster, {
    phase: 'ready', tasks: { a: { status: 'planned' }, b: { status: 'planned' }, later: { status: 'planned' } }
  });
  assert.equal(first.decisions.length, 2);
  assert.deepEqual(first.decisions.map((decision) => decision.mode).sort(), ['reuse', 'spawn']);
  assert.equal(first.decisions.find((decision) => decision.mode === 'reuse').sessionMode, 'fresh');
  assert.equal(new Set(first.decisions.map((decision) => decision.agentId)).size, 2);

  const serial = allocatePlan(validated.plan, roster, {
    phase: 'executing', tasks: { a: { status: 'done', agentId: 'delivery-existing' }, b: { status: 'done', agentId: 'delivery-engineer-1' }, later: { status: 'planned' } }
  });
  assert.equal(serial.decisions.length, 1);
  assert.equal(serial.decisions[0].mode, 'reuse');
  assert.equal(serial.decisions[0].sessionMode, 'continue');
  assert.equal(serial.decisions[0].resumeSessionId, 'session-1');
});

test('start prompt keeps Michael in the same session and names the bounded submit path', () => {
  const ctx = context();
  const prompt = buildStartFromConclusionPrompt({
    requestId: 'plan-1', project: ctx.project, workspaces: ctx.workspaces,
    submitPath: '/tmp/plans/plan-1/submit.json', localWrite: true
  });
  assert.match(prompt, /同一个 Session/);
  assert.match(prompt, /实际读取/);
  assert.match(prompt, /AGENTS\.md/);
  assert.match(prompt, /\/tmp\/plans\/plan-1\/submit\.json/);
  assert.match(prompt, /系统将负责校验、创建卡片、复用\/创建 Agent、Session、PTY/);
});

test('native planning uses a bounded output schema without granting authority', () => {
  const schema = buildTeamOsPlanOutputSchema({ requestId: 'plan-1', projectId: 'sample', localWrite: true });
  assert.deepEqual(schema.properties.requestId.enum, ['plan-1']);
  assert.deepEqual(schema.properties.authorization.properties.gitWrite.enum, [false]);
  assert.equal(schema.properties.tasks.maxItems, 12);
});

test('persists the exact Team OS executable and argv recipe for restart', () => {
  assert.equal(
    formatTeamOsSpawnCommand('codex', [
      '--dangerously-bypass-approvals-and-sandbox', '--model', 'gpt-5.6-luna'
    ]),
    'codex --dangerously-bypass-approvals-and-sandbox --model gpt-5.6-luna'
  );
  assert.equal(
    formatTeamOsSpawnCommand('agy', ['--model', 'Gemini 3.1 Pro (High)']),
    "agy --model 'Gemini 3.1 Pro (High)'"
  );
});

function writeFile(filename, content) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
}

function planningFixture() {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'tos-plan-runtime-'));
  const teamOsHome = path.join(outer, 'team-os');
  const harnessHome = path.join(outer, 'harness');
  const root = path.join(outer, 'project');
  const service = path.join(outer, 'service');
  fs.mkdirSync(service, { recursive: true });
  fs.mkdirSync(harnessHome, { recursive: true });
  writeFile(path.join(root, 'AGENTS.md'), '# rules');
  writeFile(path.join(root, '.agents/config/workspaces.json'), JSON.stringify({
    version: 1,
    designDocumentation: { managedWorkspaces: ['service'], referenceOnlyWorkspaces: [], excludedWorkspaceGroups: {} },
    workspaces: [{ name: 'service', path: service, kind: 'platform-service' }]
  }));
  writeFile(path.join(teamOsHome, 'projects/registry.json'), JSON.stringify({
    version: 1, projects: [{ id: 'sample', name: 'Sample', adapter: 'projects/adapters/sample.yaml', enabled: true }]
  }));
  writeFile(path.join(teamOsHome, 'projects/adapters/sample.yaml'), [
    'version: 1', 'id: sample', 'name: Sample', `root: ${root}`, 'mode: read-only',
    'authority:', '  agents: AGENTS.md', 'machine:', '  workspaces: .agents/config/workspaces.json',
    'constraints:', '  allowGitMutation: false'
  ].join('\n'));
  writeFile(path.join(teamOsHome, 'roles/capabilities.yaml'), [
    'version: 2', 'roles:', '  - id: delivery-engineer', '    label: 端到端交付',
    '    capabilities: [implementation]', '    authority: local', '    writePolicy: single-writer',
    '    knownBlindSpots: []', 'capabilityProfiles:', '  - id: frontend-engineering',
    '    label: 前端', '    activationSignals: [ui]', '    evidence: [test]', '    defaultMode: overlay'
  ].join('\n'));
  writeFile(path.join(teamOsHome, 'templates/outcome-card.yaml'), 'version: 3\nid: example\n');
  return { teamOsHome, harnessHome, root, service };
}

test('durable coordinator turns Michael submission into a real task dispatch and completion phase', async () => {
  const fx = planningFixture();
  const options = { configuredHome: fx.teamOsHome };
  const started = startFromConclusion({ options, harnessHome: fx.harnessHome, projectId: 'sample', localWrite: true, now: 0 });
  assert.equal(started.ok, true);
  assert.match(started.nativePrompt, /不要自行写 submit\.json/);
  assert.deepEqual(started.outputSchema.properties.requestId.enum, [started.requestId]);
  const requestDir = path.join(fx.harnessHome, '.work/team-os/plans', started.requestId);
  const submitted = manifest([task('implement')]);
  submitted.requestId = started.requestId;
  assert.deepEqual(submitPlanningResult({ harnessHome: fx.harnessHome, requestId: started.requestId, value: JSON.stringify(submitted) }), { ok: true });

  const agents = { god: { id: 'god', name: 'Michael', role: 'chief-of-staff', cwd: fx.root, status: 'idle', provider: 'codex', isGod: true } };
  const ledger = [];
  const sent = [];
  const spawned = [];
  const events = [];
  const coordinator = new TeamOsPlanCoordinator({
    teamOsOptions: () => options,
    harnessHome: () => fx.harnessHome,
    registry: () => ({ godId: 'god', agents }),
    tasks: () => ({ tasks: ledger }),
    addTask: (card) => { if (ledger.some((entry) => entry.id === card.id)) return false; ledger.push(card); return true; },
    send: (message, from) => { const full = { ...message, id: `m-${sent.length}`, from, created_at: new Date(0).toISOString() }; sent.push(full); return full; },
    spawn: async (decision) => { spawned.push(decision); agents[decision.agentId] = { id: decision.agentId, name: decision.roleLabel, role: decision.roleId, cwd: decision.cwd, status: 'idle', provider: 'codex' }; return { ok: true }; },
    reuse: async () => ({ ok: true }),
    emit: (event) => events.push(event)
  });
  await coordinator.tick();
  assert.equal(spawned.length, 1);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].status, 'doing');
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /OBJECTIVE:/);
  assert.equal(listPlanningStates(fx.harnessHome)[0].phase, 'executing');

  ledger[0].status = 'done';
  await coordinator.tick();
  assert.equal(listPlanningStates(fx.harnessHome)[0].phase, 'completed');
  assert.equal(events.at(-1).phase, 'completed');
});
