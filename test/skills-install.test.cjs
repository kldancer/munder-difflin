'use strict';

/**
 * Install/uninstall guards.
 *
 * These bound real damage. Install writes files the user did not author into a
 * directory their agents load from; uninstall deletes directories. Both are
 * driven by a public list anyone can open a PR against, so the REFUSALS are the
 * feature — each test below is a way the app could have destroyed or executed
 * something it should not have.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { parseGitHubSourceUrl, safeSkillDirName, uninstallSkill, installSkill,
  skillContentSha, SKILL_PROVENANCE_FILE } =
  loadTs('src/main/skills.ts');

const tmpdir = (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'md-skill-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
};

test('a GitHub tree URL is split into owner/repo/ref/path', () => {
  assert.deepEqual(
    parseGitHubSourceUrl('https://github.com/mongodb/agent-skills/tree/main/skills/mongodb-mcp-setup'),
    { owner: 'mongodb', repo: 'agent-skills', ref: 'main', path: 'skills/mongodb-mcp-setup' }
  );
  assert.equal(parseGitHubSourceUrl('https://officialskills.sh/mongodb/skills/x'), null);
  // A repo ROOT is also a valid source — 81 catalog entries are shaped that way.
  assert.deepEqual(parseGitHubSourceUrl('https://github.com/zarazhangrui/frontend-slides'),
    { owner: 'zarazhangrui', repo: 'frontend-slides', ref: '', path: '' });
  assert.equal(parseGitHubSourceUrl('https://github.com/orgs/anthropics'), null);
});

test('a skill folder name that could escape its directory is refused', () => {
  assert.equal(safeSkillDirName('redis-development'), 'redis-development');
  assert.equal(safeSkillDirName('skills/redis-development'), 'redis-development');
  for (const bad of ['..', '.', '', '.hidden', 'x y', '-leading', 'a b/../c d']) {
    assert.equal(safeSkillDirName(bad), null, 'must refuse ' + JSON.stringify(bad));
  }
  // A traversal reduces to its LAST segment, which is a plain, safe folder name —
  // the caller joins it onto the skills root, so there is nothing left to escape.
  assert.equal(safeSkillDirName('a/../../b'), 'b');
});

test('uninstall refuses anything outside a managed skills root', (t) => {
  const tmp = tmpdir(t);
  const victim = path.join(tmp, 'important-work');
  fs.mkdirSync(victim, { recursive: true });
  const res = uninstallSkill(victim, { cwds: [] });
  assert.equal(res.ok, false);
  assert.match(res.error, /not inside a skills directory/i);
  assert.ok(fs.existsSync(victim), 'the folder must still be there');
});

test('uninstall refuses a folder inside a skills root with no SKILL.md', (t) => {
  const tmp = tmpdir(t);
  const notASkill = path.join(tmp, '.claude', 'skills', 'src');
  fs.mkdirSync(notASkill, { recursive: true });
  fs.writeFileSync(path.join(notASkill, 'index.ts'), 'export {}');
  const res = uninstallSkill(notASkill, { cwds: [tmp] });
  assert.equal(res.ok, false);
  assert.match(res.error, /SKILL/i);
  assert.ok(fs.existsSync(notASkill));
});

test('uninstall removes a real skill folder inside a project root', (t) => {
  const tmp = tmpdir(t);
  const skill = path.join(tmp, '.claude', 'skills', 'demo');
  fs.mkdirSync(skill, { recursive: true });
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: demo\n---\n');
  assert.equal(uninstallSkill(skill, { cwds: [tmp] }).ok, true);
  assert.ok(!fs.existsSync(skill));
});

test('uninstall will not delete the skills root itself', (t) => {
  const tmp = tmpdir(t);
  const root = path.join(tmp, '.claude', 'skills');
  fs.mkdirSync(root, { recursive: true });
  assert.equal(uninstallSkill(root, { cwds: [tmp] }).ok, false);
  assert.ok(fs.existsSync(root));
});

test('content hashes are stable across API listing order', () => {
  const a = skillContentSha([{ path: 'b.txt', body: 'B' }, { path: 'a.txt', body: 'A' }]);
  const b = skillContentSha([{ path: 'a.txt', body: 'A' }, { path: 'b.txt', body: 'B' }]);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('install pins one commit, records provenance, and is revocable', async (t) => {
  const tmp = tmpdir(t);
  const root = path.join(tmp, '.claude', 'skills');
  const commit = '1'.repeat(40);
  const calls = [];
  const fetchText = async (url) => {
    calls.push(url);
    if (url.includes('/commits/main')) return JSON.stringify({ sha: commit });
    if (url.includes('/contents/skills/demo')) {
      assert.match(url, new RegExp(`ref=${commit}$`), 'tree listing must use the resolved commit');
      return JSON.stringify([
        { name: 'SKILL.md', path: 'skills/demo/SKILL.md', type: 'file', size: 25, download_url: 'https://raw.test/SKILL.md' },
        { name: 'guide.md', path: 'skills/demo/guide.md', type: 'file', size: 5, download_url: 'https://raw.test/guide.md' }
      ]);
    }
    if (url === 'https://raw.test/SKILL.md') return '---\nname: demo\n---\nhello\n';
    if (url === 'https://raw.test/guide.md') return 'guide';
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await installSkill(
    'https://github.com/acme/skills/tree/main/skills/demo',
    'demo',
    { skillsRoot: root, fetchText }
  );
  assert.equal(result.ok, true);
  const dest = path.join(root, 'demo');
  const lock = JSON.parse(fs.readFileSync(path.join(dest, SKILL_PROVENANCE_FILE), 'utf8'));
  assert.equal(lock.source.resolvedCommit, commit);
  assert.equal(lock.source.requestedRef, 'main');
  assert.equal(lock.content.files, 2);
  assert.match(lock.content.sha256, /^[0-9a-f]{64}$/);
  assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8').includes('hello'), true);
  assert.equal(uninstallSkill(dest, { cwds: [tmp] }).ok, true);
  assert.equal(fs.existsSync(dest), false);
  assert.ok(calls.every((url) => !url.includes('?ref=main')));
});

test('install never exposes a partial skill when SKILL.md is absent', async (t) => {
  const tmp = tmpdir(t);
  const root = path.join(tmp, 'skills');
  const commit = '2'.repeat(40);
  const fetchText = async (url) => {
    if (url.includes('/commits/HEAD')) return JSON.stringify({ sha: commit });
    if (url.includes('/contents/')) return JSON.stringify([
      { name: 'README.md', path: 'README.md', type: 'file', size: 4, download_url: 'https://raw.test/README.md' }
    ]);
    if (url === 'https://raw.test/README.md') return 'nope';
    throw new Error(`unexpected URL ${url}`);
  };
  const result = await installSkill('https://github.com/acme/no-skill', 'no-skill', { skillsRoot: root, fetchText });
  assert.equal(result.ok, false);
  assert.match(result.error, /SKILL\.md/);
  assert.equal(fs.existsSync(path.join(root, 'no-skill')), false);
});

test('actual downloaded bytes are capped even when metadata understates size', async (t) => {
  const tmp = tmpdir(t);
  const root = path.join(tmp, 'skills');
  const commit = '3'.repeat(40);
  const fetchText = async (url) => {
    if (url.includes('/commits/HEAD')) return JSON.stringify({ sha: commit });
    if (url.includes('/contents/')) return JSON.stringify([
      { name: 'SKILL.md', path: 'SKILL.md', type: 'file', size: 1, download_url: 'https://raw.test/huge' }
    ]);
    if (url === 'https://raw.test/huge') return 'x'.repeat(2 * 1024 * 1024 + 1);
    throw new Error(`unexpected URL ${url}`);
  };
  const result = await installSkill('https://github.com/acme/huge', 'huge', { skillsRoot: root, fetchText });
  assert.equal(result.ok, false);
  assert.match(result.error, /larger/);
  assert.equal(fs.existsSync(path.join(root, 'huge')), false);
});
