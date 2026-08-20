'use strict';

// Deterministic authoring helper for the two high-fidelity visual maps. The
// bitmap is presentation; these Tiled layers are the game-space contract that
// tells the existing Pixi/BFS runtime where walls, desks, paths, seats and
// activity zones actually are. No Agent or lifecycle state is stored here.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/renderer/src/assets/maps/office.tmj'), 'utf8'));
const W = 34;
const H = 22;
const TS = 16;

function point(name, x, y) {
  return { id: 0, name, type: '', x: x * TS, y: y * TS, width: 0, height: 0, rotation: 0, visible: true, point: true };
}

function zone(name, x, y, width, height) {
  return { id: 0, name, type: '', x: x * TS, y: y * TS, width: width * TS, height: height * TS, rotation: 0, visible: true };
}

function obstacle(name, x, y, width, height) {
  return { id: 0, name, type: 'obstacle', x, y, width, height, rotation: 0, visible: true };
}

const FOOT_RADIUS = 3.5;

function circleIntersectsRect(cx, cy, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

/** Bake the coarse BFS grid from the fine art-aligned collider source of truth.
 *  A tile represents the character's foot anchor (bottom-centre), not the
 *  whole 16 px visual cell. `FOOT_RADIUS` performs configuration-space
 *  expansion, so the path centre never approaches furniture closer than the
 *  3.5 px feet collider permits. */
function makeCollision(obstacles) {
  const data = Array(W * H).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const footX = x * TS + TS / 2;
      const footY = y * TS + TS;
      if (obstacles.some((rect) => circleIntersectsRect(footX, footY, FOOT_RADIUS, rect))) {
        data[y * W + x] = 1;
      }
    }
  }
  return data;
}

function writeTheme(filename, spec) {
  const map = structuredClone(BASE);
  const collision = map.layers.find((layer) => layer.name === 'collision');
  collision.data = makeCollision(spec.obstacles);
  const previousGeometry = map.layers.findIndex((layer) => layer.name === 'collision-geometry');
  if (previousGeometry >= 0) map.layers.splice(previousGeometry, 1);
  const collisionIndex = map.layers.findIndex((layer) => layer.name === 'collision');
  map.layers.splice(collisionIndex + 1, 0, {
    id: 0,
    name: 'collision-geometry',
    type: 'objectgroup',
    opacity: 1,
    visible: false,
    draworder: 'topdown',
    objects: spec.obstacles.map((rect) => obstacle(rect.name, rect.x, rect.y, rect.width, rect.height)),
  });
  const spawns = map.layers.find((layer) => layer.name === 'spawn-points');
  spawns.objects = spec.seats.map(([name, x, y]) => point(name, x, y));
  for (const [name, x, y] of spec.seats) {
    if (collision.data[y * W + x] !== 0) {
      throw new Error(`${filename}: operational anchor ${name} intersects fine collision at ${x},${y}`);
    }
  }
  const zones = map.layers.find((layer) => layer.name === 'zones');
  zones.objects = spec.zones.map((z) => zone(...z));
  let objectId = 1;
  for (const layer of map.layers) {
    for (const object of layer.objects ?? []) object.id = objectId++;
  }
  map.nextobjectid = objectId;
  fs.writeFileSync(path.join(ROOT, 'src/renderer/src/assets/maps', filename), `${JSON.stringify(map, null, 2)}\n`);
}

const r = (name, x, y, width, height) => ({ name, x, y, width, height });

const crystalSeats = [
  ['desk-ceo', 3, 6],
  ['pc-1', 26, 5], ['pc-2', 29, 5], ['pc-3', 23, 7],
  ['pc-4', 2, 13], ['pc-5', 6, 13], ['pc-6', 10, 13],
  ['desk-chief-architect', 14, 13], ['desk-product-manager', 18, 13],
  ['desk-team-lead', 2, 17], ['desk-backend-engineer', 6, 17],
  ['desk-ui-ux-expert', 10, 17], ['desk-data-engineer', 14, 17],
  ['desk-project-manager', 18, 17], ['desk-market-researcher', 13, 6],
  ['desk-agent-organizer', 17, 6],
  ['entrance', 15, 20],
  ['cafe-seat-1', 22, 11], ['cafe-seat-2', 22, 13],
  ['cafe-seat-3', 23, 11], ['cafe-seat-4', 23, 13],
  ['cafe-stand-coffee', 27, 19], ['cafe-stand-vending', 30, 19],
];

writeTheme('crystal-sea-starport.tmj', {
  seats: crystalSeats,
  // Coordinates are logical map pixels (the source art is exactly 2x). These
  // rectangles follow ground-contact silhouettes, not a convenient tile box.
  obstacles: [
    r('outer-wall-top', 0, 0, 544, 47),
    r('outer-wall-left', 0, 0, 17, 352), r('outer-wall-right', 527, 0, 17, 352),
    r('outer-wall-bottom-west', 0, 327, 219, 25), r('outer-wall-bottom-east', 252, 327, 292, 25),
    r('briefing-table', 185, 55, 104, 46),
    r('executive-desk', 41, 65, 36, 25),
    r('north-desk-a', 411, 50, 40, 27), r('north-desk-b', 461, 50, 40, 27),
    r('north-desk-c', 363, 98, 42, 25),
    r('divider-west', 16, 128, 78, 36), r('divider-centre', 110, 128, 128, 36),
    r('divider-east', 255, 128, 98, 36),
    r('server-wall-top', 392, 145, 135, 28),
    r('server-wall-upper', 392, 145, 12, 28), r('server-wall-middle', 392, 197, 12, 55),
    r('server-wall-lower', 392, 277, 12, 50),
    ...[33, 97, 161, 225, 289].flatMap((x, index) => [
      r(`workstation-upper-${index + 1}`, x, 188, 40, 23),
      r(`workstation-lower-${index + 1}`, x, 248, 40, 23),
    ]),
    r('server-stack', 438, 202, 30, 44), r('crystal-core', 488, 174, 38, 55),
    r('archive-counter', 428, 264, 88, 34), r('server-terminal', 516, 235, 10, 18),
    r('crystal-cluster-south-west', 18, 294, 37, 31),
    r('crystal-cluster-south', 349, 302, 34, 25),
    r('crystal-cluster-south-east', 505, 294, 22, 33),
    r('bin-south', 327, 304, 11, 23),
  ],
  zones: [['boardroom', 10, 3, 10, 4], ['cafeteria', 26, 9, 7, 12]],
});

const farmSeats = [
  ['desk-ceo', 26, 5], ['pc-1', 29, 5], ['pc-2', 18, 6], ['pc-3', 21, 6],
  ['pc-4', 2, 14], ['pc-5', 5, 14], ['pc-6', 8, 14],
  ['desk-chief-architect', 20, 14], ['desk-product-manager', 2, 18],
  ['desk-team-lead', 5, 18], ['desk-backend-engineer', 8, 18],
  ['desk-ui-ux-expert', 12, 18], ['desk-data-engineer', 16, 18],
  ['desk-project-manager', 20, 18], ['desk-market-researcher', 10, 5],
  ['desk-agent-organizer', 13, 5],
  ['entrance', 11, 20],
  ['cafe-seat-1', 21, 9], ['cafe-seat-2', 21, 10],
  ['cafe-seat-3', 22, 9], ['cafe-seat-4', 22, 10],
  ['cafe-stand-coffee', 21, 18], ['cafe-stand-vending', 22, 18],
];

writeTheme('starfield-farm.tmj', {
  seats: farmSeats,
  obstacles: [
    r('outer-wall-top', 0, 0, 544, 48),
    r('outer-wall-left', 0, 0, 17, 352), r('outer-wall-right', 527, 0, 17, 352),
    r('outer-wall-bottom-west', 0, 320, 177, 32), r('outer-wall-bottom-east', 208, 320, 336, 32),
    r('north-post-centre', 260, 0, 15, 130), r('north-post-east', 375, 38, 14, 98),
    r('community-table', 136, 58, 103, 34),
    r('cottage', 38, 75, 91, 98),
    r('cottage-fence-west', 17, 107, 20, 57),
    r('garden-fence-a', 126, 110, 58, 23), r('garden-fence-b', 211, 110, 49, 23),
    r('centre-desk-a', 281, 73, 40, 27), r('centre-desk-b', 329, 73, 40, 27),
    r('north-east-desk-a', 404, 56, 40, 25), r('north-east-desk-b', 452, 56, 40, 25),
    ...[20, 67, 114].map((x, index) => r(`workstation-mid-${index + 1}`, x, 194, 40, 25)),
    ...[20, 67, 114, 181, 240, 306].map((x, index) => r(`workstation-south-${index + 1}`, x, 257, 40, 26)),
    r('workstation-pond-east', 316, 194, 40, 25),
    // The pond is a compound collider: five strips approximate its stone rim
    // closely without introducing polygon/NavMesh machinery into the runtime.
    r('pond-north', 198, 172, 86, 8), r('pond-upper', 182, 180, 118, 16),
    r('pond-centre', 173, 196, 137, 36), r('pond-lower', 182, 232, 118, 13),
    r('pond-south', 198, 245, 86, 8),
    r('east-yard-wall-upper', 372, 150, 16, 11),
    r('east-yard-wall-middle', 372, 177, 16, 80),
    r('east-yard-wall-lower', 372, 273, 16, 47),
    r('workshop', 384, 150, 143, 60),
    r('observatory', 404, 203, 99, 86),
    r('archive-counter', 389, 275, 121, 46),
  ],
  zones: [['boardroom', 8, 3, 8, 4], ['cafeteria', 24, 12, 9, 8]],
});

console.log('built crystal-sea-starport.tmj and starfield-farm.tmj (34x22)');
