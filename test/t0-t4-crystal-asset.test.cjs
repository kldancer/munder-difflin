const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const asset = path.join(root, 'src/renderer/src/assets/themes/crystal-sea-starport/crystal-sea-starport-map-34x22.png');

test('crystal sea starport map asset is a readable native 34x22 logical-grid PNG', () => {
  const bytes = fs.readFileSync(asset);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 1088);
  assert.equal(bytes.readUInt32BE(20), 704);
  assert.equal(bytes.readUInt8(24), 8);
  assert.equal(bytes.readUInt8(25), 2); // truecolor, no indexed UI palette
});

test('asset delivery retains a source master and a native 34x22 render asset', () => {
  const files = fs.readdirSync(path.join(root, 'src/renderer/src/assets/themes/crystal-sea-starport')).filter((name) => name.endsWith('.png'));
  assert.deepEqual(files.sort(), ['crystal-sea-starport-map-34x22.png', 'crystal-sea-starport-map.png']);
});
