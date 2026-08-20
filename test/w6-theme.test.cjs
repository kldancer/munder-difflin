const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (p) => fs.readFileSync(p, 'utf8');
const registry = read('src/renderer/src/scene/office/themeRegistry.ts');
const picker = read('src/renderer/src/components/OfficeThemePicker.tsx');
const loader = read('src/renderer/src/scene/office/themeLoader.ts');
const visuals = read('src/renderer/src/scene/office/themeVisuals.ts');
const floor = read('src/renderer/src/scene/office/OfficeFloor.tsx');

test('W6.1 registers office and starship skins on one topology contract', () => {
  assert.match(registry, /\| 'office'/);
  assert.match(registry, /\| 'starship'/);
  assert.match(registry, /export const STARSHIP_THEME/);
  assert.match(registry, /\.\.\.OFFICE_THEME/);
  assert.match(registry, /starship: STARSHIP_THEME/);
  assert.match(registry, /stars: true/);
});

test('theme picker validates before persistence and never tears down agents', () => {
  assert.match(picker, /await loadTheme\(id\)/);
  assert.match(picker, /updateConfig\(\{ officeTheme: id \}\)/);
  assert.doesNotMatch(picker, /killPty|archiveAgent|disposeTerminal|delete \$\{/);
  assert.doesNotMatch(picker, /toggleFlag|tvShowOffices/);
  assert.match(picker, /PTYs, sessions, queues, memory and worktrees remain untouched/);
  assert.match(picker, /const current = useStore\(\(s\) => s\.officeTheme\)/);
  assert.doesNotMatch(picker, /useState<ThemeId>/);
});

test('failed theme loads are explicit instead of silently claiming office success', () => {
  assert.match(loader, /if \(!theme\) throw new Error/);
  assert.match(loader, /throw new Error\(`Theme '\$\{id\}' is not renderable`\)/);
  assert.doesNotMatch(loader, /falling back to 'office'/);
});

test('starship visuals are procedural and inserted as a visual-only layer', () => {
  assert.match(visuals, /createThemeVisuals/);
  assert.match(visuals, /visual-only/);
  assert.match(visuals, /stars/);
  assert.match(visuals, /grid/);
});

test('floor rendering pauses while hidden or covered by fullscreen UI', () => {
  assert.match(floor, /document\.addEventListener\('visibilitychange'/);
  assert.match(floor, /const paused = !!fullscreenAgentId \|\| !!fullscreenFilePath \|\| docHidden/);
  assert.match(floor, /if \(paused\) ticker\.stop\(\); else ticker\.start\(\)/);
});
