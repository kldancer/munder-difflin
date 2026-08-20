const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { readFileSync } = require('node:fs');

function loadCatalog(harnessHome, agents) {
  const source = `import { listRecentSessions } from './src/main/sessionCatalog.ts';
    console.log(JSON.stringify(listRecentSessions(${JSON.stringify({ harnessHome, agents, limit: 20 })})));`;
  return JSON.parse(execFileSync(process.env.NODE22 || '/opt/homebrew/opt/node@22/bin/node', [
    '--experimental-strip-types', '--input-type=module', '-e', source
  ], { cwd: join(__dirname, '..'), encoding: 'utf8' }));
}

test('Wave 6 session catalog exposes provider and agent ownership without transcript text', () => {
  const home = mkdtempSync(join(tmpdir(), 'munder-w6-session-'));
  const sid = '12345678-1234-4abc-8def-1234567890ab';
  const agents = { jim: { id: 'jim', name: 'Jim', provider: 'codex', cwd: '/repo', sessionId: sid } };
  mkdirSync(join(home, 'hive', 'agents', 'jim', '.codex', 'sessions'), { recursive: true });
  writeFileSync(join(home, 'hive', 'agents', 'jim', '.codex', 'sessions', `${sid}.jsonl`), '{"prompt":"must not escape"}\n');
  const rows = loadCatalog(home, agents);
  const row = rows.find((item) => item.id === sid && item.provider === 'codex');
  assert.ok(row);
  assert.equal(row.agentId, 'jim');
  assert.equal(row.cwd, '/repo');
  assert.equal(row.resumable, true);
  assert.equal(JSON.stringify(rows).includes('must not escape'), false);
});

test('provider capability limits are explicit when DeepSeek has no indexed file', () => {
  const home = mkdtempSync(join(tmpdir(), 'munder-w6-session-'));
  const rows = loadCatalog(home, { dwight: { id: 'dwight', provider: 'deepseek', cwd: '/repo', sessionId: 'deepseek-session-1' } });
  const row = rows.find((item) => item.provider === 'deepseek');
  assert.ok(row);
  assert.match(row.limitation, /OpenCode|索引/);
});

test('running PTY replacement is explicit and validated before termination', () => {
  const detail = readFileSync(join(__dirname, '..', 'src', 'renderer', 'src', 'components', 'AgentDetailPanel.tsx'), 'utf8');
  const compatibility = detail.indexOf('selected.provider !== provider');
  const confirmation = detail.indexOf("window.confirm(t('w6.session.replaceConfirm'");
  const kill = detail.indexOf('window.cth.killPty');
  assert.ok(compatibility >= 0 && compatibility < confirmation && confirmation < kill);
});
