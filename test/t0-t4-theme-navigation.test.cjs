'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function readMap(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function navigationFacts(map) {
  const collision = map.layers.find((layer) => layer.name === 'collision').data;
  const objects = map.layers.find((layer) => layer.name === 'spawn-points').objects;
  const points = new Map(objects.map((o) => [o.name, { x: Math.floor(o.x / map.tilewidth), y: Math.floor(o.y / map.tileheight) }]));
  const start = points.get('entrance');
  const key = (x, y) => `${x},${y}`;
  const seen = new Set([key(start.x, start.y)]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      if (collision[y * map.width + x] !== 0 || seen.has(key(x, y))) continue;
      seen.add(key(x, y));
      queue.push({ x, y });
    }
  }
  return { collision, points, seen, key };
}

for (const [name, path] of [
  ['crystal sea starport', 'src/renderer/src/assets/maps/crystal-sea-starport.tmj'],
  ['starfield farm', 'src/renderer/src/assets/maps/starfield-farm.tmj'],
]) {
  test(`${name} map keeps every operational spawn reachable on its own visual topology`, () => {
    const map = readMap(path);
    assert.equal(map.width, 34);
    assert.equal(map.height, 22);
    assert.equal(map.tilewidth, 16);
    const { collision, points, seen, key } = navigationFacts(map);
    assert.equal(collision.length, 34 * 22);
    assert.equal(points.size, 23);
    for (const [id, point] of points) {
      assert.equal(collision[point.y * map.width + point.x], 0, `${id} must be walkable`);
      assert.ok(seen.has(key(point.x, point.y)), `${id} must be reachable from entrance`);
    }
  });
}

test('theme maps own only presentation navigation data, not runtime state', () => {
  for (const path of [
    'src/renderer/src/assets/maps/crystal-sea-starport.tmj',
    'src/renderer/src/assets/maps/starfield-farm.tmj',
  ]) {
    const text = fs.readFileSync(path, 'utf8');
    assert.doesNotMatch(text, /session|provider|pty|task|memory|worktree/i);
  }
});
