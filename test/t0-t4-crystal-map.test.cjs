const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (p) => fs.readFileSync(p, 'utf8');
const registry = read('src/renderer/src/scene/office/themeRegistry.ts');
const visuals = read('src/renderer/src/scene/office/themeVisuals.ts');

test('T0 crystal map reuses the engine while owning visual-aligned navigation data', () => {
  assert.match(registry, /export const STARSHIP_THEME: ThemeConfig = \{\s*\.\.\.OFFICE_THEME/);
  assert.match(registry, /mapRaw: officeMapRaw/);
  assert.match(registry, /mapRaw: crystalSeaStarportMapRaw/);
  assert.match(registry, /recipe:/);
  assert.match(visuals, /root\.eventMode = 'none'/);
});

test('T1-T4 crystal recipe has floor, boundaries, workstations, props and windows', () => {
  for (const key of ['floor:', 'boundaries:', 'workstations:', 'props:', 'windows:']) {
    assert.match(registry, new RegExp(key));
  }
  for (const kind of ['crystal', 'console', 'plant', 'crate']) {
    assert.match(registry, new RegExp(`kind: '${kind}'`));
  }
  assert.match(visuals, /Theme recipe/);
  assert.match(visuals, /tile-space/);
});

test('crystal map does not wire visual recipes into routing or interaction', () => {
  assert.doesNotMatch(visuals, /isWalkable|pathfind|pointertap|eventMode = 'static'/);
  assert.match(visuals, /root\.addChild\(overlay, floor, windows, boundaries, stations, props/);
});
