'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');
const registry = read('src/renderer/src/scene/office/themeRegistry.ts');
const visuals = read('src/renderer/src/scene/office/themeVisuals.ts');
const floor = read('src/renderer/src/scene/office/OfficeFloor.tsx');
const portrait = read('src/renderer/src/components/SpritePortrait.tsx');
const picker = read('src/renderer/src/components/OfficeThemePicker.tsx');
const commandCenter = read('src/renderer/src/components/CommandCenterPanel.tsx');
const agentCard = read('src/renderer/src/components/AgentCard.tsx');
const agentStrip = read('src/renderer/src/components/AgentStrip.tsx');
const configs = [
  read('src/main/config.ts'),
  read('src/preload/index.ts'),
  read('src/renderer/src/store/config.ts'),
];

test('both built-in skins bind the same 15 ids to their themed portrait and scene pipeline', () => {
  assert.match(registry, /cast: themeCast\('starship'\)/);
  assert.match(registry, /cast: themeCast\('starfield-farm'\)/);
  assert.match(portrait, /officeTheme === 'starship' \|\| officeTheme === 'starfield-farm'/);
  assert.match(portrait, /variant === 'full-body' \? paintCastFullBody : paintCastPortrait/);
  assert.match(portrait, /paint\(ctx, character, scale, characterTheme\)/);
  assert.match(agentCard, /variant="full-body"/);
});

test('high-fidelity maps keep their paired Tiled navigation facts authoritative', () => {
  assert.match(registry, /backgroundUrl: crystalSeaStarportMapUrl/);
  assert.match(registry, /backgroundUrl: starfieldFarmMapUrl/);
  assert.match(visuals, /theme-background:/);
  assert.match(visuals, /if \(backgroundTexture\)/);
  assert.match(floor, /theme\.backgroundUrl/);
  assert.match(floor, /createThemeVisuals\([\s\S]*backgroundTexture/);
  assert.doesNotMatch(visuals, /isWalkable|pathfind|spawnPoint/);
});

test('starfield-farm persists through the existing config boundary without a new lifecycle path', () => {
  for (const config of configs) assert.match(config, /'starfield-farm'/);
  assert.match(picker, /await loadTheme\(id\)[\s\S]*await window\.cth\.updateConfig\(\{ officeTheme: id \}\)/);
  assert.doesNotMatch(picker, /killPty|archiveAgent|disposeTerminal|spawnAgent/);
});

test('shell treatment changes material tokens while preserving the command center and agent card structure', () => {
  assert.match(commandCenter, /className="cth-command-center"/);
  assert.match(commandCenter, /var\(--cth-skin-surface\)/);
  assert.match(agentCard, /className="cth-agent-card"/);
  assert.match(agentCard, /var\(--cth-skin-border\)/);
  assert.match(agentStrip, /var\(--cth-skin-ground\)/);
});
