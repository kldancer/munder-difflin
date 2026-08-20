'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');

const ids = ['michael', 'jim', 'pam', 'dwight', 'kevin', 'angela', 'oscar', 'stanley', 'phyllis', 'andy', 'kelly', 'ryan', 'toby', 'creed', 'meredith'];
const roots = {
  starship: 'src/renderer/src/assets/themes/crystal-sea-starport/characters',
  'starfield-farm': 'src/renderer/src/assets/themes/starfield-farm/characters',
};

function decodeRgbaPng(path) {
  const png = fs.readFileSync(path);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, `${path} must use 8-bit channels`);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  assert.equal(colorType, 6, `${path} must be RGBA`);
  const packed = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  const prior = Buffer.alloc(stride);
  let input = 0;
  for (let y = 0; y < height; y++) {
    const filter = packed[input++];
    const row = packed.subarray(input, input + stride);
    input += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? out[x - 4] : 0;
      const up = prior[x];
      const upperLeft = x >= 4 ? prior[x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      } else assert.equal(filter, 0, `unsupported PNG filter ${filter}`);
      out[x] = (row[x] + predictor) & 255;
    }
    out.copy(prior);
  }
  return { width, height, pixels };
}

function frameBytes(atlas, sx, sy, width = 18, height = 32) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = ((sy + y) * atlas.width + sx) * 4;
    atlas.pixels.copy(out, y * width * 4, start, start + width * 4);
  }
  return out;
}

function alphaMask(frame, yLimit = 32) {
  const mask = new Set();
  for (let y = 0; y < yLimit; y++) for (let x = 0; x < 18; x++) {
    if (frame[(y * 18 + x) * 4 + 3]) mask.add(`${x},${y}`);
  }
  return mask;
}

function alphaBounds(frame, width = 18, height = 32) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (frame[(y * width + x) * 4 + 3] === 0) continue;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}

test('professional character atlases expose the fixed 15-id runtime contract', () => {
  for (const [theme, root] of Object.entries(roots)) {
    const manifest = JSON.parse(fs.readFileSync(`${root}/cast-atlas.json`, 'utf8'));
    assert.equal(manifest.theme, theme);
    assert.deepEqual(Object.keys(manifest.characters), ids);
    assert.deepEqual(manifest.portraitSize, [18, 28]);
    assert.deepEqual(manifest.frameSize, [18, 32]);
    assert.deepEqual(manifest.directionRows, ['down', 'up', 'right']);
    assert.deepEqual(manifest.actionColumns, ['walk1', 'walk2', 'walk3', 'type1', 'type2', 'read1', 'read2']);
    const cast = decodeRgbaPng(`${root}/cast-atlas.png`);
    const portraits = decodeRgbaPng(`${root}/portrait-atlas.png`);
    assert.deepEqual([cast.width, cast.height], [630, 288]);
    assert.deepEqual([portraits.width, portraits.height], [270, 28]);
  }
});

test('all 630 compiled scene frames are non-empty and every direction/action is real', () => {
  for (const root of Object.values(roots)) {
    const atlas = decodeRgbaPng(`${root}/cast-atlas.png`);
    for (let index = 0; index < ids.length; index++) {
      const row = Math.floor(index / 5), col = index % 5;
      const ox = col * 126, oy = row * 96;
      for (let direction = 0; direction < 3; direction++) {
        const frames = Array.from({ length: 7 }, (_, frame) => frameBytes(atlas, ox + frame * 18, oy + direction * 32));
        for (const frame of frames) assert.ok([...alphaMask(frame)].length > 35, `${ids[index]} has an empty frame`);
        assert.notDeepEqual(frames[1], frames[0]);
        assert.notDeepEqual(frames[2], frames[0]);
        assert.notDeepEqual(frames[3], frames[0]);
        assert.notDeepEqual(frames[4], frames[3]);
        assert.notDeepEqual(frames[5], frames[0]);
        assert.notDeepEqual(frames[6], frames[5]);
      }
      const down = frameBytes(atlas, ox, oy);
      const up = frameBytes(atlas, ox, oy + 32);
      const right = frameBytes(atlas, ox, oy + 64);
      assert.notDeepEqual(up, down, `${ids[index]} must have a genuine back row`);
      assert.notDeepEqual(right, down, `${ids[index]} must have a genuine right-facing row`);
    }
  }
});

test('every base direction keeps one complete body inside the 18x32 frame', () => {
  for (const [theme, root] of Object.entries(roots)) {
    const atlas = decodeRgbaPng(`${root}/cast-atlas.png`);
    for (let index = 0; index < ids.length; index++) {
      const row = Math.floor(index / 5), col = index % 5;
      const ox = col * 126, oy = row * 96;
      for (let direction = 0; direction < 3; direction++) {
        const bounds = alphaBounds(frameBytes(atlas, ox, oy + direction * 32));
        assert.ok(bounds.width >= 11, `${theme}/${ids[index]}/${direction} was horizontally truncated`);
        assert.ok(bounds.height >= 30, `${theme}/${ids[index]}/${direction} lost head or feet`);
        assert.ok(bounds.left > 0 && bounds.right < 17, `${theme}/${ids[index]}/${direction} touches a slicing edge`);
        assert.equal(bounds.bottom, 31, `${theme}/${ids[index]}/${direction} is not anchored at the feet`);
      }
    }
  }
});

test('farm skin preserves each starship identity head silhouette while changing wardrobe', () => {
  const starship = decodeRgbaPng(`${roots.starship}/cast-atlas.png`);
  const farm = decodeRgbaPng(`${roots['starfield-farm']}/cast-atlas.png`);
  for (let index = 0; index < ids.length; index++) {
    const row = Math.floor(index / 5), col = index % 5;
    const sx = col * 126, sy = row * 96;
    const a = alphaMask(frameBytes(starship, sx, sy), 17);
    const b = alphaMask(frameBytes(farm, sx, sy), 17);
    const intersection = [...a].filter((point) => b.has(point)).length;
    const union = new Set([...a, ...b]).size;
    assert.ok(intersection / union >= 0.7, `${ids[index]} identity silhouette drifted across skins`);
    assert.notDeepEqual(frameBytes(starship, sx, sy), frameBytes(farm, sx, sy), `${ids[index]} wardrobe did not change`);
  }
});

test('runtime consumes bitmap atlases without adding a second animation engine', () => {
  const assets = fs.readFileSync('src/renderer/src/scene/office/themeCharacterAssets.ts', 'utf8');
  const cast = fs.readFileSync('src/renderer/src/scene/office/cast.ts', 'utf8');
  assert.match(assets, /direction \* FRAME_H/);
  assert.match(assets, /texture\.source\.scaleMode = 'nearest'/);
  assert.match(cast, /await getThemeCharacterFrames\(name, theme\)/);
  assert.match(cast, /await paintThemeCharacterPortrait\(ctx, name, scale, theme\)/);
  assert.doesNotMatch(assets, /AgentState|Pty|Session|provider|worktree/i);
});
