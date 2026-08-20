'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function mapFacts(path) {
  const map = JSON.parse(fs.readFileSync(path, 'utf8'));
  const collision = map.layers.find((layer) => layer.name === 'collision').data;
  const geometry = map.layers.find((layer) => layer.name === 'collision-geometry').objects;
  const footprintBlocked = (px, py, radius = 3.5) => geometry.some((rect) => {
    const closestX = Math.max(rect.x, Math.min(px, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(py, rect.y + rect.height));
    return (px - closestX) ** 2 + (py - closestY) ** 2 < radius ** 2;
  });
  return {
    map,
    geometry,
    blocked: (x, y) => collision[y * map.width + x] !== 0,
    footprintBlocked,
  };
}

test('character-to-character collision uses a feet-only native-pixel footprint', () => {
  const character = fs.readFileSync('src/renderer/src/scene/office/Character.ts', 'utf8');
  const floor = fs.readFileSync('src/renderer/src/scene/office/OfficeFloor.tsx', 'utf8');
  assert.match(character, /CHARACTER_FOOTPRINT_RADIUS = 3\.5/);
  assert.match(character, /this\.mapRenderer\.isFootprintWalkable/);
  assert.match(character, /staticBlocked \|\| this\.isFootprintBlocked/);
  assert.match(character, /this\.isFootprintBlocked\?\.\(nextPx, nextPy, this\.agentId\)/);
  assert.match(character, /collisionWait >= 0\.65/);
  assert.match(character, /isTileOccupied/);
  assert.match(floor, /const distance = Math\.hypot\(other\.x - px, other\.y - py\)/);
  assert.match(floor, /distance >= minDistance/);
  assert.match(floor, /CHARACTER_FOOTPRINT_RADIUS \* 2/);
  assert.match(floor, /const currentDistance = self/);
  assert.match(floor, /selfId\.localeCompare\(id\) < 0 && distance > currentDistance/);
  assert.doesNotMatch(floor, /sprite\.(width|height).*collision|collision.*sprite\.(width|height)/i);
});

test('crystal starport owns art-aligned fine colliders for walls, desks and equipment', () => {
  const map = mapFacts('src/renderer/src/assets/maps/crystal-sea-starport.tmj');
  const named = new Map(map.geometry.map((rect) => [rect.name, rect]));
  assert.deepEqual(rectFacts(named.get('briefing-table')), expectRect(185, 55, 104, 46));
  assert.deepEqual(rectFacts(named.get('workstation-upper-1')), expectRect(33, 188, 40, 23));
  assert.deepEqual(rectFacts(named.get('server-wall-middle')), expectRect(392, 197, 12, 55));
  assert.deepEqual(rectFacts(named.get('crystal-core')), expectRect(488, 174, 38, 55));
  assert.deepEqual(rectFacts(named.get('archive-counter')), expectRect(428, 264, 88, 34));
  for (const [x, y] of [[200, 70], [50, 200], [396, 220], [500, 200], [450, 280]]) {
    assert.equal(map.footprintBlocked(x, y), true, `expected blocked crystal pixel ${x},${y}`);
  }
  for (const [x, y] of [[104, 172], [248, 320], [360, 224], [416, 256]]) {
    assert.equal(map.footprintBlocked(x, y), false, `expected clear crystal pixel ${x},${y}`);
  }
});

test('starfield farm owns compound art-aligned colliders for cottage, pond and workshop', () => {
  const map = mapFacts('src/renderer/src/assets/maps/starfield-farm.tmj');
  const named = new Map(map.geometry.map((rect) => [rect.name, rect]));
  assert.deepEqual(rectFacts(named.get('community-table')), expectRect(136, 58, 103, 34));
  assert.deepEqual(rectFacts(named.get('cottage')), expectRect(38, 75, 91, 98));
  assert.deepEqual(rectFacts(named.get('pond-centre')), expectRect(173, 196, 137, 36));
  assert.deepEqual(rectFacts(named.get('workshop')), expectRect(384, 150, 143, 60));
  assert.deepEqual(rectFacts(named.get('archive-counter')), expectRect(389, 275, 121, 46));
  for (const [x, y] of [[180, 70], [80, 120], [240, 210], [420, 170], [450, 300]]) {
    assert.equal(map.footprintBlocked(x, y), true, `expected blocked farm pixel ${x},${y}`);
  }
  for (const [x, y] of [[184, 320], [376, 144], [344, 176], [320, 240]]) {
    assert.equal(map.footprintBlocked(x, y), false, `expected clear farm pixel ${x},${y}`);
  }
});

function expectRect(x, y, width, height) {
  return { x, y, width, height };
}

function rectFacts(rect) {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

test('the coarse BFS grid is baked exactly from the 3.5 px fine-collider clearance', () => {
  for (const path of [
    'src/renderer/src/assets/maps/crystal-sea-starport.tmj',
    'src/renderer/src/assets/maps/starfield-farm.tmj',
  ]) {
    const facts = mapFacts(path);
    assert.ok(facts.geometry.length >= 30);
    for (let y = 0; y < facts.map.height; y++) {
      for (let x = 0; x < facts.map.width; x++) {
        const px = x * facts.map.tilewidth + facts.map.tilewidth / 2;
        const py = y * facts.map.tileheight + facts.map.tileheight;
        assert.equal(facts.blocked(x, y), facts.footprintBlocked(px, py), `${path} tile ${x},${y}`);
      }
    }
    const spawns = facts.map.layers.find((layer) => layer.name === 'spawn-points').objects;
    for (const spawn of spawns) {
      assert.equal(facts.footprintBlocked(spawn.x + 8, spawn.y + 16), false, `${spawn.name} fine clearance`);
    }

    // A coarse edge is valid only when the whole straight step is valid. This
    // catches thin walls that sit between two otherwise-clear tile anchors.
    for (let y = 0; y < facts.map.height; y++) {
      for (let x = 0; x < facts.map.width; x++) {
        if (facts.blocked(x, y)) continue;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= facts.map.width || ny >= facts.map.height || facts.blocked(nx, ny)) continue;
          for (let sample = 1; sample < 16; sample++) {
            const t = sample / 16;
            const px = (x * 16 + 8) * (1 - t) + (nx * 16 + 8) * t;
            const py = (y * 16 + 16) * (1 - t) + (ny * 16 + 16) * t;
            assert.equal(facts.footprintBlocked(px, py), false, `${path} edge ${x},${y} -> ${nx},${ny}`);
          }
        }
      }
    }
  }
});
