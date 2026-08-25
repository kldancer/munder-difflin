const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const designDir = path.join(root, 'docs', 'diy', '正式设计文档');
const manualPath = path.join(designDir, '00-Munder-Difflin系统说明书.md');
const assetDir = path.join(designDir, 'assets', 'system-manual');
const htmlPath = path.join(assetDir, 'index.html');
const dataPath = path.join(assetDir, 'manual-data.js');
const scriptPath = path.join(assetDir, 'manual.js');

function localTarget(baseDir, reference) {
  const withoutHash = reference.split('#', 1)[0];
  if (!withoutHash || /^(?:https?:|mailto:)/.test(withoutHash)) return null;
  return path.resolve(baseDir, decodeURIComponent(withoutHash));
}

test('system manual assets and local links stay complete', () => {
  for (const file of [manualPath, htmlPath, dataPath, scriptPath, path.join(assetDir, 'manual.css')]) {
    assert.equal(fs.existsSync(file), true, `missing ${file}`);
  }

  const markdown = fs.readFileSync(manualPath, 'utf8');
  const markdownLinks = [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const reference of markdownLinks) {
    const target = localTarget(designDir, reference);
    if (target) assert.equal(fs.existsSync(target), true, `broken Markdown link: ${reference}`);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /manual-data\.js/);
  assert.match(html, /manual\.js/);
  assert.equal((html.match(/data-panel=/g) || []).length, 4);
});

test('interactive manual data keeps owners, exclusions and valid task targets', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(dataPath, 'utf8'), sandbox, { filename: dataPath });
  const data = sandbox.window.MUNDER_MANUAL_DATA;

  assert.ok(data);
  assert.equal(data.layers.length, 6);
  assert.equal(data.taskSteps.length, 9);
  assert.deepEqual(Object.keys(data.files).sort(), ['hive', 'project', 'provider', 'team-os']);
  assert.equal(data.failures.length, 4);

  const layerIds = new Set(data.layers.map((layer) => layer.id));
  assert.equal(layerIds.size, data.layers.length, 'layer ids must be unique');
  for (const layer of data.layers) {
    assert.ok(layer.owns.length > 0, `${layer.id} lacks owned facts`);
    assert.ok(layer.notOwns.length > 0, `${layer.id} lacks exclusions`);
    const target = localTarget(assetDir, layer.href);
    if (target) assert.equal(fs.existsSync(target), true, `broken layer source: ${layer.href}`);
  }
  for (const step of data.taskSteps) assert.equal(layerIds.has(step.target), true, `unknown task target: ${step.target}`);
  for (const entries of Object.values(data.files)) {
    for (const entry of entries) {
      assert.ok(entry.owner && entry.stores && entry.excludes, `${entry.path} lacks ownership contract`);
    }
  }
});
