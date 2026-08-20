const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (p) => fs.readFileSync(p, 'utf8');
const registry = read('src/renderer/src/scene/office/themeRegistry.ts');
const visuals = read('src/renderer/src/scene/office/themeVisuals.ts');

test('T4 registers starfield-farm on the shared renderer and object contract', () => {
  assert.match(registry, /\| 'starfield-farm'/);
  assert.match(registry, /export const STARFIELD_FARM_THEME: ThemeConfig = \{\s*\.\.\.OFFICE_THEME/);
  assert.match(registry, /id: 'starfield-farm'/);
  assert.match(registry, /mapRaw: starfieldFarmMapRaw/);
  assert.match(registry, /'starfield-farm': STARFIELD_FARM_THEME/);
});

test('farm recipe has warm floor, timber boundaries, desks, garden props and sky windows', () => {
  for (const key of ['floor:', 'boundaries:', 'workstations:', 'props:', 'windows:']) {
    assert.match(registry, new RegExp(key));
  }
  for (const kind of ['plant', 'lantern', 'pond']) assert.match(registry, new RegExp(`kind: '${kind}'`));
  assert.match(registry, /color: 0x8b7056/);
  assert.match(registry, /color: 0x6f472f/);
  assert.match(visuals, /prop\.kind === 'lantern'/);
  assert.match(visuals, /prop\.kind === 'pond'/);
});

test('farm visuals remain deterministic and non-interactive', () => {
  assert.match(visuals, /root\.eventMode = 'none'/);
  assert.doesNotMatch(visuals, /pointertap|isWalkable|pathfind/);
});
