const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shell theme projects one root office-skin attribute and finite tokens', () => {
  const app = read('src/renderer/src/App.tsx');
  const skin = read('src/renderer/src/design/officeSkin.ts');
  const css = read('src/renderer/src/design/tokens.css');
  assert.match(app, /projectOfficeSkin\(officeTheme\)/);
  assert.match(skin, /dataset\.officeSkin/);
  for (const token of ['ground', 'surface', 'border', 'active', 'attention']) {
    assert.match(css, new RegExp(`--cth-skin-${token}`));
  }
});

test('picker exposes three cards and validates before persistence', () => {
  const picker = read('src/renderer/src/components/OfficeThemePicker.tsx');
  assert.match(picker, /id: 'office'/);
  assert.match(picker, /id: 'starship'/);
  assert.match(picker, /id: 'starfield-farm'/);
  assert.ok(picker.indexOf('await loadTheme') < picker.indexOf('updateConfig'));
});
