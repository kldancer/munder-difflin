const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const asset = 'src/renderer/src/assets/themes/starfield-farm/starfield-farm-map-34x22.png';

test('farm hi-fi asset is a readable native 34x22 RGB PNG', () => {
  const b = fs.readFileSync(asset);
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(b.toString('ascii', 12, 16), 'IHDR');
  assert.equal(b.readUInt32BE(16), 1088);
  assert.equal(b.readUInt32BE(20), 704);
  assert.equal(b[24], 8, '8-bit channels');
  assert.equal(b[25], 2, 'RGB, no alpha/UI compositing');
});

test('farm hi-fi deliverable retains a source master and native render asset', () => {
  const files = fs.readdirSync('src/renderer/src/assets/themes/starfield-farm').filter((name) => name.endsWith('.png'));
  assert.deepEqual(files.sort(), ['starfield-farm-map-34x22.png', 'starfield-farm-map-v1.png']);
  assert.ok(fs.statSync('.work/delegated/t2-farm-hi-fi/qa-preview.png').size > 100_000);
});
