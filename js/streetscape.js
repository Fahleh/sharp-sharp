// Street furniture, stops, vendor kiosks, customer gates and junction detail. Pure.
// Everything goes through the placer so props never overlap or land on a road.

import { CITY, PROPS } from './config.js';
import { MAP, SIDEWALK, WATER, blockRect, pointOnEdge } from './map.js';

const BRANDS = Object.freeze([
  'Gidi Fizz', 'Orisun Telecom', 'Pepper Pop', 'Alaba Mega Mart', 'Lekki Glow Soap', 'Sunrise Noodles',
  'Bright Naija Bulbs', 'Eko Fresh Water', 'Iya Ewa Foods', 'Zippy Rides', 'Mainland Cement', 'Kobo Kings Bakery',
]);

// Road direction as the rotation that puts a prop's local x axis along it.
const alongRotation = (dx, dz) => Math.atan2(-dz, dx);

const incident = (node) => MAP.graph.links.get(node).map((l) => l.edge);

function nodeReach(id) {
  if (id.startsWith('rb')) return 10;
  return Math.max(...incident(id).map((e) => e.hw)) + SIDEWALK + 1;
}

function cornerOffsets(nodeIdValue) {
  const edges = incident(nodeIdValue).filter((e) => e.kind !== 'ring');
  const node = MAP.graph.nodes.get(nodeIdValue);
  const half = (vertical) => Math.max(0, ...edges
    .filter((e) => {
      const other = MAP.graph.nodes.get(e.a === nodeIdValue ? e.b : e.a);
      return vertical ? other.x === node.x : other.z === node.z;
    })
    .map((e) => e.hw));
  return { node, column: half(true), row: half(false) };
}

/**
 * @param {{ rng: object, placer: ReturnType<typeof import('./placer.js').createPlacer>,
 *   terrain: object, buildings: object[], yards: object[], addBuilding: Function }} input
 * @returns {{ signs: object[], crossings: object[] }}
 */
export function addStreetscape({ rng, placer, terrain, buildings, yards, addBuilding }) {
  const { place } = placer;
  const signs = [];
  const crossings = [];
  const roads = MAP.graph.edges.filter((e) => e.kind !== 'ring' && e.kind !== 'bridge');
  const roundabout = MAP.roundabout;
  const nearRoundabout = (x, z) => Math.hypot(x - roundabout.x, z - roundabout.z) < roundabout.outer + 2;

  // ---- stops (the named landmarks)
  for (const landmark of MAP.landmarks) {
    const { node, column, row } = cornerOffsets(landmark.node);
    const corners = [landmark.corner, [-landmark.corner[0], landmark.corner[1]], [landmark.corner[0], -landmark.corner[1]], [-landmark.corner[0], -landmark.corner[1]]];
    for (const [sx, sz] of corners) {
      const x = node.x + sx * (column + SIDEWALK / 2 + 0.3);
      const z = node.z + sz * (row + SIDEWALK / 2 + 0.3);
      if (place('shelter', x, z, 0, { data: { name: landmark.name } })) {
        signs.push({ kind: 'stop', text: landmark.name.toUpperCase(), x, y: PROPS.shelter.h + 0.9, z, w: 3.4, h: 0.9, rotY: 0, both: true });
        break;
      }
    }
    if (landmark.signalised) {
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        place('light', node.x + sx * (column + 0.6), node.z + sz * (row + 0.6), 0, { data: { sx, sz } });
      }
      for (const edge of incident(landmark.node)) {
        if (edge.kind === 'ring') continue;
        const other = MAP.graph.nodes.get(edge.a === landmark.node ? edge.b : edge.a);
        const len = Math.hypot(other.x - node.x, other.z - node.z);
        const dx = (other.x - node.x) / len;
        const dz = (other.z - node.z) / len;
        const crossHalf = Math.abs(dx) > Math.abs(dz) ? column : row;
        const at = crossHalf + 2.5;
        // `s` is the crossing's distance along its edge from the edge's first node, for the people who use it.
        if (len > at + 6) {
          crossings.push({
            x: node.x + dx * at, z: node.z + dz * at, alongX: Math.abs(dx) > Math.abs(dz), half: edge.hw,
            a: edge.a, b: edge.b, s: landmark.node === edge.a ? at : edge.length - at,
          });
        }
      }
    }
  }

  // ---- vendors: a kiosk at the building line, with its name above
  for (const vendor of MAP.vendors) {
    const edge = vendor.edgeRef;
    const a = MAP.graph.nodes.get(edge.a);
    const b = MAP.graph.nodes.get(edge.b);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const spot = pointOnEdge(edge, vendor.t, vendor.side * (edge.hw + SIDEWALK - PROPS.kiosk.hd - 0.3));
    const kiosk = place('kiosk', spot.x, spot.z, alongRotation((b.x - a.x) / len, (b.z - a.z) / len), { data: { vendor: vendor.id, color: rng.pick(CITY.shopColors) } });
    if (kiosk) {
      signs.push({
        kind: 'vendor', text: vendor.name, x: spot.x - vendor.nx * 0.2, y: PROPS.kiosk.h + 1.1, z: spot.z - vendor.nz * 0.2,
        w: 4.2, h: 1, rotY: Math.atan2(-vendor.nx, -vendor.nz), both: true,
      });
    }
  }

  // ---- customers: a coloured gate at the building line
  for (const customer of MAP.customers) {
    const edge = customer.edgeRef;
    const a = MAP.graph.nodes.get(edge.a);
    const b = MAP.graph.nodes.get(edge.b);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const spot = pointOnEdge(edge, customer.t, customer.side * (edge.hw + SIDEWALK - PROPS.gate.hd - 0.25));
    place('gate', spot.x, spot.z, alongRotation((b.x - a.x) / len, (b.z - a.z) / len), { data: { customer: customer.id, color: customer.gateColor } });
  }

  // ---- along the roads
  for (const edge of roads) {
    const a = MAP.graph.nodes.get(edge.a);
    const b = MAP.graph.nodes.get(edge.b);
    const len = edge.length;
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    const rot = alongRotation(dx, dz);
    const from = nodeReach(edge.a);
    const to = len - nodeReach(edge.b);
    const at = (s, side, offset) => ({ x: a.x + dx * s - dz * side * offset, z: a.z + dz * s + dx * side * offset });
    if (edge.kind === 'market') {
      for (const side of [-1, 1]) {
        for (let s = from + 1; s < to; s += CITY.stallSpacing) {
          const p = at(s, side, edge.hw + 1.7);
          place('stall', p.x, p.z, rot, { data: { color: rng.pick(CITY.awningColors) } });
        }
      }
      continue;
    }
    let k = 0;
    for (let s = from; s < to; s += CITY.lampSpacing) {
      const p = at(s + CITY.lampSpacing / 2, k % 2 === 0 ? 1 : -1, edge.hw + 0.9);
      if (!nearRoundabout(p.x, p.z)) place('lamp', p.x, p.z, 0, { pad: 0.3 });
      k += 1;
    }
    for (const side of [-1, 1]) {
      for (let s = from + CITY.treeSpacing / 2; s < to; s += CITY.treeSpacing) {
        const jitter = rng.range(-3, 3);
        if (rng.chance(CITY.kioskChance)) {
          const p = at(s + jitter, side, edge.hw + SIDEWALK - PROPS.kiosk.hd - 0.3);
          if (!nearRoundabout(p.x, p.z)) place('kiosk', p.x, p.z, rot, { pad: 0.6, data: { color: rng.pick(CITY.shopColors) } });
        } else if (rng.chance(0.75)) {
          const p = at(s + jitter, side, edge.hw + 1.6);
          if (!nearRoundabout(p.x, p.z)) place(rng.chance(0.6) ? 'palm' : 'almond', p.x, p.z, rng.range(0, 6.28), { pad: 0.6 });
        }
      }
    }
  }

  // ---- the school, parks, sand lots and yards
  const field = MAP.blocks.find((bl) => bl.type === 'field');
  const fieldRect = blockRect(field);
  const school = {
    id: 'school', block: field.id, x: (fieldRect.x0 + fieldRect.x1) / 2, z: fieldRect.z0 + CITY.school.depth / 2,
    w: CITY.school.width, d: CITY.school.depth, h: CITY.school.height, color: '#e7d6b8',
    shop: null, roof: [{ kind: 'stair', x: 0, z: 0 }], billboard: null,
  };
  addBuilding(school);
  place('goal', fieldRect.x0 + 6, (fieldRect.z0 + fieldRect.z1) / 2 + 8);
  place('goal', fieldRect.x1 - 6, (fieldRect.z0 + fieldRect.z1) / 2 + 8, Math.PI);

  const scatter = (rect, count, kinds, pad) => {
    for (let i = 0; i < count; i += 1) {
      place(rng.pick(kinds), rng.range(rect.x0 + 1.5, rect.x1 - 1.5), rng.range(rect.z0 + 1.5, rect.z1 - 1.5), rng.range(0, 6.28), { pad });
    }
  };
  scatter({ ...fieldRect, z0: fieldRect.z0 + CITY.school.depth + 2 }, 8, ['almond', 'palm'], 2.5);
  const parkBlock = MAP.blocks.find((bl) => bl.type === 'park');
  const park = { ...blockRect(parkBlock), z0: WATER.inlet.z1 + 3 };
  scatter(park, CITY.parkTrees, ['palm', 'palm', 'almond'], 2.2);
  place('shelter', (park.x0 + park.x1) / 2, (park.z0 + park.z1) / 2, 0, { pad: 1 });
  for (let i = 0; i < 6; i += 1) {
    place('bench', rng.range(park.x0 + 3, park.x1 - 3), rng.range(park.z0 + 3, park.z1 - 3), rng.pick([0, Math.PI / 2]), { pad: 1.5 });
  }
  const sandBlock = MAP.blocks.find((bl) => bl.type === 'sandlot');
  const sand = blockRect(sandBlock);
  for (let i = 0; i < 4; i += 1) {
    place('container', rng.range(sand.x0 + 4, sand.x1 - 4), rng.range(sand.z0 + 6, sand.z1 - 6), rng.pick([0, Math.PI / 2]), { pad: 1.5, data: { color: rng.pick(CITY.shopColors) } });
  }
  scatter(sand, 8, ['barrier'], 1);

  for (const yard of yards) {
    if (yard.compound) {
      place('almond', (yard.x0 + yard.x1) / 2 + rng.range(-3, 3), yard.z1 - 2.5, 0, { pad: 1 });
      continue;
    }
    let parked = 0;
    for (let x = yard.x0 + 2; x < yard.x1 - 1 && parked < CITY.parkedCarsPerYard; x += CITY.parkedCarSpacing) {
      for (let z = yard.z0 + 3; z < yard.z1 - 2 && parked < CITY.parkedCarsPerYard; z += PROPS.car.hd * 2 + 1) {
        if (rng.chance(0.65) && place('car', x, z, 0, { pad: 0.2, data: { color: rng.pick(CITY.shopColors) } })) parked += 1;
      }
    }
  }

  // ---- scatter along sidewalks: barriers, generators, rubbish
  const sidewalkSpot = () => {
    const edge = rng.pick(roads);
    const side = rng.pick([-1, 1]);
    return { edge, side, ...pointOnEdge(edge, rng.range(0.2, 0.8), side * (edge.hw + rng.range(0.8, SIDEWALK - 0.8))) };
  };
  for (let i = 0; i < CITY.barrierCount; i += 1) {
    const spot = sidewalkSpot();
    const a = MAP.graph.nodes.get(spot.edge.a);
    const b = MAP.graph.nodes.get(spot.edge.b);
    place('barrier', spot.x, spot.z, alongRotation(b.x - a.x, b.z - a.z), { pad: 0.8 });
  }
  const shopBuildings = buildings.filter((bl) => bl.shop);
  for (let i = 0; i < CITY.generatorCount && shopBuildings.length > 0; i += 1) {
    const bl = rng.pick(shopBuildings);
    const face = bl.shop.face;
    const nx = face === 'w' ? -1 : face === 'e' ? 1 : 0;
    const nz = face === 'n' ? -1 : face === 's' ? 1 : 0;
    const along = rng.range(-bl.w / 3, bl.w / 3);
    const alongZ = rng.range(-bl.d / 3, bl.d / 3);
    const x = bl.x + (nx !== 0 ? nx * (bl.w / 2 + 0.6) : along);
    const z = bl.z + (nz !== 0 ? nz * (bl.d / 2 + 0.6) : alongZ);
    place('generator', x, z, nx !== 0 ? Math.PI / 2 : 0);
  }
  for (let i = 0; i < CITY.rubbishCount; i += 1) {
    const spot = sidewalkSpot();
    place('rubbish', spot.x, spot.z, rng.range(0, 6.28), { data: { color: rng.pick(['#5b6b4a', '#7a5a43', '#8a8f94', '#b5483a']) } });
  }

  // ---- billboards on tall roofs, with invented brands
  buildings.filter((bl) => bl.billboard).forEach((bl, i) => {
    const face = bl.billboard.face;
    const nx = face === 'w' ? -1 : face === 'e' ? 1 : 0;
    const nz = face === 'n' ? -1 : face === 's' ? 1 : 0;
    const span = nx !== 0 ? bl.d : bl.w;
    signs.push({
      kind: 'billboard', text: BRANDS[i % BRANDS.length], x: bl.x + nx * (bl.w / 2 - 1.2), y: bl.h + 4, z: bl.z + nz * (bl.d / 2 - 1.2),
      w: Math.min(span - 2, 12), h: 4.5, rotY: Math.atan2(nx, nz), both: false, stands: true,
    });
  });

  // ---- palms around the edge of the playable area
  const edgeX = MAP.world.wallX - 8;
  for (let z = -190; z < MAP.world.wallZ - 8; z += CITY.perimeterTreeSpacing) {
    place('palm', -edgeX, z + rng.range(-3, 3), 0, { pad: 1 });
    place('almond', edgeX, z + rng.range(-3, 3), 0, { pad: 1 });
  }
  for (let x = -edgeX + 10; x < edgeX - 10; x += CITY.perimeterTreeSpacing) {
    place(rng.chance(0.5) ? 'palm' : 'almond', x + rng.range(-3, 3), MAP.world.wallZ - 8, 0, { pad: 1 });
  }
  return { signs, crossings, terrain };
}
