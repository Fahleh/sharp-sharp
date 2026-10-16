// Deterministic district generation from the map: buildings, solids, props and signs.
// Pure: no three.js, no DOM. The same seed always gives the same city.

import { CITY, COLLIDE } from './config.js';
import { createRng } from './rng.js';
import { createStaticIndex } from './collide.js';
import { MAP, WATER, blockRect } from './map.js';
import { createPlacer } from './placer.js';
import { createTerrain } from './terrain.js';
import { addStreetscape } from './streetscape.js';
import { addDecor } from './decor.js';

const FACES = Object.freeze(['n', 's', 'w', 'e']);

const box = (x0, z0, x1, z1) => ({ type: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2 });

function nearestPointDistance(rect, x, z) {
  const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
  const dz = Math.max(rect.z0 - z, 0, z - rect.z1);
  return Math.hypot(dx, dz);
}

// Split a rectangle into lots with random cuts, keeping clear of the roundabout.
function splitLots(rect, { maxSide, rng, keepOut }) {
  const lots = [];
  const stack = [rect];
  while (stack.length > 0) {
    const r = stack.pop();
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const blocked = nearestPointDistance(r, MAP.roundabout.x, MAP.roundabout.z) < keepOut;
    const fits = w <= maxSide && d <= maxSide;
    if (fits && !blocked) {
      lots.push(r);
    } else if (Math.max(w, d) < CITY.minLot * 2) {
      if (!blocked) lots.push(r);
    } else if (w >= d) {
      const cut = r.x0 + w * rng.range(0.4, 0.6);
      stack.push({ ...r, x1: cut }, { ...r, x0: cut });
    } else {
      const cut = r.z0 + d * rng.range(0.4, 0.6);
      stack.push({ ...r, z1: cut }, { ...r, z0: cut });
    }
  }
  return lots.sort((a, b) => a.x0 - b.x0 || a.z0 - b.z0);
}

function streetFaces(lot, area) {
  const touching = [];
  if (lot.z0 <= area.z0 + 1e-6) touching.push('n');
  if (lot.z1 >= area.z1 - 1e-6) touching.push('s');
  if (lot.x0 <= area.x0 + 1e-6) touching.push('w');
  if (lot.x1 >= area.x1 - 1e-6) touching.push('e');
  return touching;
}

function faceGeometry(b, face) {
  switch (face) {
    case 'n': return { length: b.w, cx: b.x, cz: b.z - b.d / 2, rot: Math.PI, nx: 0, nz: -1 };
    case 's': return { length: b.w, cx: b.x, cz: b.z + b.d / 2, rot: 0, nx: 0, nz: 1 };
    case 'w': return { length: b.d, cx: b.x - b.w / 2, cz: b.z, rot: -Math.PI / 2, nx: -1, nz: 0 };
    default: return { length: b.d, cx: b.x + b.w / 2, cz: b.z, rot: Math.PI / 2, nx: 1, nz: 0 };
  }
}

function makeBuilding({ lot, area, spec, rng, id, block }) {
  const w = lot.x1 - lot.x0;
  const d = lot.z1 - lot.z0;
  const b = {
    id, block, x: (lot.x0 + lot.x1) / 2, z: (lot.z0 + lot.z1) / 2, w, d,
    h: Math.round(rng.range(spec.minH, spec.maxH) * 2) / 2,
    color: rng.pick(CITY.palettes[spec.palette]),
    shop: null, roof: [], billboard: null,
  };
  const faces = streetFaces(lot, area);
  if (spec.shops && faces.length > 0 && rng.chance(CITY.shopChance)) {
    const face = rng.pick(faces);
    const geo = faceGeometry(b, face);
    b.shop = {
      face, length: Math.min(geo.length - 2, 10), color: rng.pick(CITY.shopColors),
      awning: rng.chance(CITY.awningChance) ? rng.pick(CITY.awningColors) : null,
    };
  }
  if (b.h >= CITY.billboardMinHeight && faces.length > 0 && rng.chance(CITY.billboardChance)) {
    b.billboard = { face: rng.pick(faces) };
  }
  const roomX = Math.max(0, w / 2 - 2);
  const roomZ = Math.max(0, d / 2 - 2);
  if (rng.chance(CITY.roofTankChance)) b.roof.push({ kind: 'tank', x: rng.range(-roomX, roomX), z: rng.range(-roomZ, roomZ) });
  if (rng.chance(CITY.roofAntennaChance)) b.roof.push({ kind: 'antenna', x: rng.range(-roomX, roomX), z: rng.range(-roomZ, roomZ), h: rng.range(3, 6) });
  if (rng.chance(CITY.roofStairChance)) b.roof.push({ kind: 'stair', x: rng.range(-roomX, roomX), z: rng.range(-roomZ, roomZ) });
  return b;
}

function buildBlock({ block, rng, addBuilding, addSolid, yards }) {
  const area = blockRect(block);
  const spec = CITY.lots[block.type];
  if (!spec) return;
  const keepOut = MAP.roundabout.outer + CITY.roundaboutClearance;
  const rects = [];
  if (block.cut) {
    const gap = block.cut.hw + MAP.sidewalk;
    rects.push({ ...area, z1: block.cut.at - gap }, { ...area, z0: block.cut.at + gap });
  } else {
    rects.push(area);
  }
  for (const rect of rects) {
    for (const lot of splitLots(rect, { maxSide: spec.maxSide, rng, keepOut })) {
      if (rng.chance(spec.yard)) {
        yards.push({ ...lot, block: block.id });
        continue;
      }
      if (block.type === 'estate') {
        const { setback, minHouse, wallThickness: t } = CITY.estate;
        const w = lot.x1 - lot.x0;
        const d = lot.z1 - lot.z0;
        const house = {
          x0: lot.x0 + Math.min(setback, (w - minHouse) / 2), x1: lot.x1 - Math.min(setback, (w - minHouse) / 2),
          z0: lot.z0 + Math.min(setback, (d - minHouse) / 2), z1: lot.z1 - Math.min(setback, (d - minHouse) / 2),
        };
        addBuilding(makeBuilding({ lot: house, area: { x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 }, spec, rng, id: addBuilding.next(), block: block.id }));
        for (const wall of [
          box(lot.x0, lot.z0, lot.x1, lot.z0 + t), box(lot.x0, lot.z1 - t, lot.x1, lot.z1),
          box(lot.x0, lot.z0, lot.x0 + t, lot.z1), box(lot.x1 - t, lot.z0, lot.x1, lot.z1),
        ]) addSolid(wall);
        yards.push({ ...lot, block: block.id, compound: true });
        continue;
      }
      addBuilding(makeBuilding({ lot, area, spec, rng, id: addBuilding.next(), block: block.id }));
    }
  }
}

/**
 * @param {{ seed?: number, terrain?: ReturnType<typeof createTerrain> }} [options]
 * @returns {{ buildings: object[], props: object[], signs: object[], crossings: object[],
 *   solids: object[], index: ReturnType<typeof createStaticIndex>, yards: object[], skyline: object[],
 *   boats: object[], walls: object[], rails: object[] }}
 */
export function generateCity({ seed = CITY.seed, terrain = createTerrain() } = {}) {
  const rng = createRng(seed);
  const solids = [];
  const index = createStaticIndex([], COLLIDE.cell);
  const addSolid = (shape) => { solids.push(shape); index.add(shape); };

  const buildings = [];
  const yards = [];
  const addBuilding = (b) => { buildings.push(b); addSolid({ type: 'box', x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2 }); };
  addBuilding.next = () => `bld${buildings.length}`;

  // Fixed solids: lagoon, inlet (split around the bridge deck), perimeter walls, roundabout island.
  const world = MAP.world;
  const lagoon = WATER.lagoon;
  const inlet = WATER.inlet;
  const deck = MAP.bridge.deckHalfWidth;
  const deckZ = MAP.graph.nodes.get(MAP.bridge.from).z;
  addSolid(box(lagoon.x0 - 20, lagoon.z0, lagoon.x1 + 20, lagoon.z1));
  addSolid(box(inlet.x0, inlet.z0, inlet.x1, deckZ - deck));
  addSolid(box(inlet.x0, deckZ + deck, inlet.x1, inlet.z1));
  const bridgeX0 = MAP.graph.nodes.get(MAP.bridge.from).x + 4;
  const bridgeX1 = MAP.graph.nodes.get(MAP.bridge.to).x - 4;
  const railThickness = 0.6;
  const rails = [
    box(bridgeX0, deckZ - deck - railThickness / 2, bridgeX1, deckZ - deck + railThickness / 2),
    box(bridgeX0, deckZ + deck - railThickness / 2, bridgeX1, deckZ + deck + railThickness / 2),
  ];
  rails.forEach(addSolid);
  const wallThickness = 1;
  const walls = [
    box(-world.wallX - wallThickness, lagoon.z1, -world.wallX, world.wallZ),
    box(world.wallX, lagoon.z1, world.wallX + wallThickness, world.wallZ),
    box(-world.wallX, world.wallZ, world.wallX, world.wallZ + wallThickness),
  ];
  walls.forEach(addSolid);
  addSolid({ type: 'circle', x: MAP.roundabout.x, z: MAP.roundabout.z, r: MAP.roundabout.island - 0.5 });

  for (const block of MAP.blocks) buildBlock({ block, rng, addBuilding, addSolid, yards });

  const placer = createPlacer({ terrain, index, addSolid });
  const extras = addStreetscape({ rng, placer, terrain, buildings, yards, addBuilding });
  const decor = addDecor({ rng });

  return {
    buildings, props: placer.props, signs: extras.signs, crossings: extras.crossings, solids, index,
    yards, skyline: decor.skyline, boats: decor.boats, walls, rails,
  };
}

export { FACES, faceGeometry };
