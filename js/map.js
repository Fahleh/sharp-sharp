// The district as data: a hand-authored road grid, one roundabout, one bridge, a market street,
// a lagoon with an inlet, named stops, vendors and customers. Pure: no three.js, no DOM.
// The layout is stylised and invented. Real area names are flavour only.
// Units are metres. x runs east, z runs south. A road's side +1 is the right-hand side when
// travelling from its first node to its second.

import { createGraph } from './route.js';

export const SIDEWALK = 4;

// Grid lines. Roads run along them; the blocks are the cells between.
const X = Object.freeze([-200, -115, -35, 45, 125, 200]);
const Z = Object.freeze([-195, -100, -15, 65, 145, 195]);

const CLASS_HALF_WIDTH = Object.freeze({
  street: 4, avenue: 5, main: 7, market: 3, ring: 5, bridge: 7,
});
const ROW_CLASS = Object.freeze(['street', 'main', 'street', 'avenue', 'street', 'street']);
const COL_CLASS = Object.freeze(['street', 'street', 'street', 'avenue', 'street', 'street']);

export const BRIDGE = Object.freeze({ from: 'c2r1', to: 'c3r1', height: 4.2, deckHalfWidth: 11 });
export const ROUNDABOUT = Object.freeze({ x: X[3], z: Z[3], ringRadius: 16, island: 11, nodes: 8 });
export const WORLD = Object.freeze({
  x0: -232, x1: 232, z0: -210, z1: 226,
  // Solid wall around the playable area.
  wallX: 229, wallZ: 223,
});

export const WATER = Object.freeze({
  lagoon: Object.freeze({ x0: -232, x1: 232, z0: -330, z1: -203 }),
  inlet: Object.freeze({ x0: -27, x1: 37, z0: -203, z1: -60 }),
});

const REMOVED = new Set(['c2r0-c3r0', 'c4r2-c4r3']);
const ONE_WAY = Object.freeze({ 'row:2': 'ab', 'row:4': 'ba' });
const MARKET = Object.freeze({ z: 25, west: 'mkW', east: 'mkE' });

const nodeId = (i, j) => `c${i}r${j}`;
const ringId = (k) => `rb${((k % ROUNDABOUT.nodes) + ROUNDABOUT.nodes) % ROUNDABOUT.nodes}`;
// Grid node that the roundabout replaces, and which ring node each arm lands on.
const ROUNDABOUT_NODE = nodeId(3, 3);
const ARMS = Object.freeze({
  [`${nodeId(3, 2)}-${ROUNDABOUT_NODE}`]: [nodeId(3, 2), ringId(0)],
  [`${ROUNDABOUT_NODE}-${nodeId(3, 4)}`]: [ringId(4), nodeId(3, 4)],
  [`${nodeId(2, 3)}-${ROUNDABOUT_NODE}`]: [nodeId(2, 3), ringId(6)],
  [`${ROUNDABOUT_NODE}-${nodeId(4, 3)}`]: [ringId(2), nodeId(4, 3)],
});

function buildNodes() {
  const nodes = [];
  for (let j = 0; j < Z.length; j += 1) {
    for (let i = 0; i < X.length; i += 1) {
      if (nodeId(i, j) !== ROUNDABOUT_NODE) nodes.push({ id: nodeId(i, j), x: X[i], z: Z[j] });
    }
  }
  for (let k = 0; k < ROUNDABOUT.nodes; k += 1) {
    const a = (k / ROUNDABOUT.nodes) * Math.PI * 2;
    nodes.push({
      id: ringId(k),
      x: ROUNDABOUT.x + Math.sin(a) * ROUNDABOUT.ringRadius,
      z: ROUNDABOUT.z - Math.cos(a) * ROUNDABOUT.ringRadius,
    });
  }
  nodes.push({ id: MARKET.west, x: X[1], z: MARKET.z }, { id: MARKET.east, x: X[2], z: MARKET.z });
  return nodes;
}

function buildEdges() {
  const edges = [];
  const add = (a, b, kind, extra = {}) => {
    edges.push({ a, b, kind, hw: CLASS_HALF_WIDTH[kind], oneWay: null, ...extra });
  };
  for (let j = 0; j < Z.length; j += 1) {
    for (let i = 0; i < X.length; i += 1) {
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni >= X.length || nj >= Z.length) continue;
        const key = `${nodeId(i, j)}-${nodeId(ni, nj)}`;
        if (REMOVED.has(key)) continue;
        const kind = di === 1 ? ROW_CLASS[j] : COL_CLASS[i];
        const oneWay = di === 1 ? ONE_WAY[`row:${j}`] ?? null : null;
        if (key === `${BRIDGE.from}-${BRIDGE.to}`) {
          add(BRIDGE.from, BRIDGE.to, 'bridge', { height: BRIDGE.height });
        } else if (ARMS[key]) {
          add(ARMS[key][0], ARMS[key][1], kind);
        } else if (key === `${nodeId(1, 2)}-${nodeId(1, 3)}`) {
          add(nodeId(1, 2), MARKET.west, kind);
          add(MARKET.west, nodeId(1, 3), kind);
        } else if (key === `${nodeId(2, 2)}-${nodeId(2, 3)}`) {
          add(nodeId(2, 2), MARKET.east, kind);
          add(MARKET.east, nodeId(2, 3), kind);
        } else if (!key.includes(ROUNDABOUT_NODE)) {
          add(nodeId(i, j), nodeId(ni, nj), kind, { oneWay });
        }
      }
    }
  }
  add(MARKET.west, MARKET.east, 'market');
  // Roundabout traffic goes anticlockwise seen from above (north up), the way right-hand traffic circulates.
  for (let k = 0; k < ROUNDABOUT.nodes; k += 1) add(ringId(k + 1), ringId(k), 'ring', { oneWay: 'ab' });
  return edges;
}

const nodes = buildNodes();
const edges = buildEdges();
export const graph = createGraph({ nodes, edges });

const edgeBetween = (a, b) => graph.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));

/** Point on an edge at fraction `t`, pushed `offset` metres to its right-hand side (negative: left). */
export function pointOnEdge(edge, t, offset = 0) {
  const a = graph.nodes.get(edge.a);
  const b = graph.nodes.get(edge.b);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  return { x: a.x + dx * t - (dz / len) * offset, z: a.z + dz * t + (dx / len) * offset, nx: -dz / len, nz: dx / len };
}

// ---------------------------------------------------------------- blocks
// Cells between grid lines. `c0..c1` and `r0..r1` are grid line indices, so one block can span
// several cells. `cut` splits a block along a street through it.
export const BLOCKS = Object.freeze([
  { id: 'b00', c0: 0, c1: 1, r0: 0, r1: 1, type: 'lowrise' },
  { id: 'b10', c0: 1, c1: 2, r0: 0, r1: 1, type: 'mixed' },
  { id: 'b20', c0: 2, c1: 3, r0: 0, r1: 1, type: 'water' },
  { id: 'b30', c0: 3, c1: 4, r0: 0, r1: 1, type: 'commercial' },
  { id: 'b40', c0: 4, c1: 5, r0: 0, r1: 1, type: 'mixed' },
  { id: 'b01', c0: 0, c1: 1, r0: 1, r1: 2, type: 'mixed' },
  { id: 'b11', c0: 1, c1: 2, r0: 1, r1: 2, type: 'lowrise' },
  { id: 'b21', c0: 2, c1: 3, r0: 1, r1: 2, type: 'park' },
  { id: 'b31', c0: 3, c1: 4, r0: 1, r1: 2, type: 'commercial' },
  { id: 'b41', c0: 4, c1: 5, r0: 1, r1: 2, type: 'mixed' },
  { id: 'b02', c0: 0, c1: 1, r0: 2, r1: 3, type: 'tall' },
  { id: 'b12', c0: 1, c1: 2, r0: 2, r1: 3, type: 'market', cut: { axis: 'z', at: MARKET.z, hw: CLASS_HALF_WIDTH.market } },
  { id: 'b22', c0: 2, c1: 3, r0: 2, r1: 3, type: 'mixed' },
  { id: 'b32', c0: 3, c1: 5, r0: 2, r1: 3, type: 'mall' },
  { id: 'b03', c0: 0, c1: 1, r0: 3, r1: 4, type: 'mixed' },
  { id: 'b13', c0: 1, c1: 2, r0: 3, r1: 4, type: 'estate' },
  { id: 'b23', c0: 2, c1: 3, r0: 3, r1: 4, type: 'mixed' },
  { id: 'b33', c0: 3, c1: 4, r0: 3, r1: 4, type: 'commercial' },
  { id: 'b43', c0: 4, c1: 5, r0: 3, r1: 4, type: 'mixed' },
  { id: 'b04', c0: 0, c1: 1, r0: 4, r1: 5, type: 'field' },
  { id: 'b14', c0: 1, c1: 2, r0: 4, r1: 5, type: 'lowrise' },
  { id: 'b24', c0: 2, c1: 3, r0: 4, r1: 5, type: 'lowrise' },
  { id: 'b34', c0: 3, c1: 4, r0: 4, r1: 5, type: 'sandlot' },
  { id: 'b44', c0: 4, c1: 5, r0: 4, r1: 5, type: 'lowrise' },
]);

const lineHalfWidth = (classes, index) => CLASS_HALF_WIDTH[classes[index]];

/**
 * The ground a block's buildings may use: the cell shrunk by the road and sidewalk on each side.
 * @param {{ c0: number, c1: number, r0: number, r1: number }} block
 * @returns {{ x0: number, x1: number, z0: number, z1: number }}
 */
export function blockRect({ c0, c1, r0, r1 }) {
  return {
    x0: X[c0] + lineHalfWidth(COL_CLASS, c0) + SIDEWALK,
    x1: X[c1] - lineHalfWidth(COL_CLASS, c1) - SIDEWALK,
    z0: Z[r0] + lineHalfWidth(ROW_CLASS, r0) + SIDEWALK,
    z1: Z[r1] - lineHalfWidth(ROW_CLASS, r1) - SIDEWALK,
  };
}

// ---------------------------------------------------------------- places
export const LANDMARKS = Object.freeze([
  { id: 'yaba', name: 'Yaba', node: 'c1r2', corner: [1, 1], signalised: true },
  { id: 'ojuelegba', name: 'Ojuelegba', node: 'c4r1', corner: [-1, 1], signalised: true },
  { id: 'obalende', name: 'Obalende', node: 'c3r0', corner: [1, 1] },
  { id: 'oshodi', name: 'Oshodi', node: MARKET.west, corner: [1, -1] },
  { id: 'ikeja', name: 'Ikeja Under Bridge', node: 'c2r1', corner: [-1, 1] },
  { id: 'surulere', name: 'Surulere', node: 'c2r3', corner: [-1, -1], signalised: true },
  { id: 'cms', name: 'CMS', node: 'c3r4', corner: [1, -1] },
].map((l) => ({ ...l, ...graph.nodes.get(l.node) })));

const GATE_COLORS = Object.freeze({
  yellow: '#f2c230', green: '#2f9e5a', blue: '#2f6fd1', red: '#d9472b', white: '#f2efe6', orange: '#ee8a2d', purple: '#8a4fc7',
});
const HINT_OPENERS = Object.freeze(['Opposite', 'Beside', 'Near', 'Behind']);

function place(def) {
  const edge = edgeBetween(def.edge[0], def.edge[1]);
  if (!edge) throw new Error(`No road ${def.edge.join('-')} for ${def.id}`);
  // The marker sits on the kerb line so riding down the near half of the road counts.
  const marker = pointOnEdge(edge, def.t, def.side * edge.hw);
  return { ...def, edgeRef: edge, x: marker.x, z: marker.z, nx: marker.nx * def.side, nz: marker.nz * def.side };
}

export const VENDORS = Object.freeze([
  { id: 'v-tola', name: "Mama Tola's Kitchen", type: 'Food', edge: ['c1r2', 'c2r2'], t: 0.5, side: 1 },
  { id: 'v-bisi', name: 'Bisi Pharmacy', type: 'Pharmacy', edge: ['c2r2', 'c3r2'], t: 0.3, side: 1 },
  { id: 'v-ade', name: 'Ade & Sons Electronics', type: 'Parcel', edge: ['c3r1', 'c4r1'], t: 0.5, side: 1 },
  { id: 'v-basira', name: 'Iya Basira Pepper Soup', type: 'Food', edge: ['c0r3', 'c1r3'], t: 0.5, side: -1 },
  { id: 'v-sunrise', name: 'Sunrise Chemist', type: 'Pharmacy', edge: ['c4r1', 'c5r1'], t: 0.5, side: -1 },
  { id: 'v-tunde', name: 'Oga Tunde Spare Parts', type: 'Parcel', edge: ['c1r0', 'c2r0'], t: 0.5, side: 1 },
  { id: 'v-chop', name: 'Chop Quick Grill', type: 'Food', edge: ['c3r4', 'c4r4'], t: 0.5, side: -1 },
  { id: 'v-blessing', name: 'Blessing Boutique', type: 'Parcel', edge: ['c0r1', 'c1r1'], t: 0.5, side: 1 },
  { id: 'v-alaba', name: 'Alaba Gadget Corner', type: 'Parcel', edge: ['c2r3', 'c2r4'], t: 0.5, side: -1 },
  { id: 'v-fish', name: 'Lagoon Fish Grill', type: 'Food', edge: ['c3r0', 'c4r0'], t: 0.5, side: -1 },
  { id: 'v-rice', name: 'Mama Put Rice Spot', type: 'Food', edge: ['c4r3', 'c5r3'], t: 0.5, side: 1 },
  { id: 'v-tobi', name: 'Tobi Phone Repair', type: 'Parcel', edge: ['c1r4', 'c2r4'], t: 0.5, side: 1 },
].map(place));

const CUSTOMER_DEFS = Object.freeze([
  { id: 'c01', edge: ['c0r1', 'c0r2'], t: 0.5, side: -1, gate: 'yellow' },
  { id: 'c02', edge: ['c1r1', 'c1r2'], t: 0.5, side: -1, gate: 'green' },
  { id: 'c03', edge: ['c0r2', 'c0r3'], t: 0.5, side: -1, gate: 'blue' },
  { id: 'c04', edge: ['c1r3', 'c1r4'], t: 0.5, side: -1, gate: 'red' },
  { id: 'c05', edge: ['c2r2', 'mkE'], t: 0.5, side: -1, gate: 'white' },
  { id: 'c06', edge: ['c3r1', 'c3r2'], t: 0.5, side: -1, gate: 'purple' },
  { id: 'c07', edge: ['c4r0', 'c4r1'], t: 0.5, side: 1, gate: 'orange' },
  { id: 'c08', edge: ['c5r0', 'c5r1'], t: 0.5, side: 1, gate: 'yellow' },
  { id: 'c09', edge: ['c5r2', 'c5r3'], t: 0.5, side: 1, gate: 'blue' },
  { id: 'c10', edge: ['c4r3', 'c4r4'], t: 0.5, side: -1, gate: 'green' },
  { id: 'c11', edge: ['c2r4', 'c2r5'], t: 0.5, side: -1, gate: 'red' },
  { id: 'c12', edge: ['c0r4', 'c0r5'], t: 0.5, side: -1, gate: 'white' },
  { id: 'c13', edge: ['c4r4', 'c4r5'], t: 0.5, side: 1, gate: 'purple' },
  { id: 'c14', edge: ['c1r0', 'c1r1'], t: 0.5, side: -1, gate: 'orange' },
  { id: 'c15', edge: ['c3r4', 'c3r5'], t: 0.5, side: 1, gate: 'yellow' },
  { id: 'c16', edge: ['c4r2', 'c5r2'], t: 0.5, side: 1, gate: 'blue' },
  { id: 'c17', edge: ['c3r0', 'c3r1'], t: 0.5, side: -1, gate: 'green' },
]);

export const CUSTOMERS = Object.freeze(CUSTOMER_DEFS.map((def, index) => {
  const spot = place(def);
  const nearest = LANDMARKS.reduce((a, b) => (Math.hypot(b.x - spot.x, b.z - spot.z) < Math.hypot(a.x - spot.x, a.z - spot.z) ? b : a));
  return {
    ...spot,
    gateColor: GATE_COLORS[def.gate],
    landmark: nearest.name,
    hint: `${HINT_OPENERS[index % HINT_OPENERS.length]} the ${def.gate} gate, ${nearest.name}`,
  };
}));

// Start on the main road heading east toward the bridge, in the right-hand lane.
export const SPAWN = Object.freeze({ x: -80, z: -96, heading: Math.PI / 2 });

export const MAP = Object.freeze({
  X, Z, graph, blocks: BLOCKS, landmarks: LANDMARKS, vendors: VENDORS, customers: CUSTOMERS,
  roundabout: ROUNDABOUT, bridge: BRIDGE, water: WATER, world: WORLD, spawn: SPAWN,
  market: MARKET, sidewalk: SIDEWALK,
});
