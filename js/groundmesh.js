// Meshes the ground from the terrain raster (merged into large rectangles), plus kerbs, lane
// markings, zebra crossings, the roundabout and the bridge. All of it goes into chunk batches.

import { KERB_HEIGHT, LOOK } from './config.js';
import { SURFACE } from './terrain.js';

const FLAT = Object.freeze({
  [SURFACE.sand]: { color: LOOK.sand, y: 0 },
  [SURFACE.grass]: { color: LOOK.grass, y: 0.01 },
  [SURFACE.plaza]: { color: LOOK.plaza, y: 0.01 },
  [SURFACE.sidewalk]: { color: LOOK.sidewalk, y: LOOK.walkY },
  [SURFACE.road]: { color: LOOK.road, y: LOOK.roadY },
});

/**
 * Greedy-merge a chunk of the raster into rectangles of one surface each.
 * @param {{ x0: number, z0: number, width: number, cells: Uint8Array }} raster
 * @param {{ ix0: number, iz0: number, ix1: number, iz1: number }} area cell bounds
 * @param {(ix: number, iz: number) => boolean} skip cells another mesh owns
 * @param {(rect: { x0: number, z0: number, x1: number, z1: number, code: number }) => void} emit
 */
function mergeCells(raster, area, skip, emit) {
  const { width, cells } = raster;
  let open = new Map();
  for (let iz = area.iz0; iz < area.iz1; iz += 1) {
    const next = new Map();
    let ix = area.ix0;
    while (ix < area.ix1) {
      const code = cells[iz * width + ix];
      if (skip(ix, iz) || !FLAT[code]) { ix += 1; continue; }
      let end = ix + 1;
      while (end < area.ix1 && cells[iz * width + end] === code && !skip(end, iz)) end += 1;
      const key = `${ix}:${end}:${code}`;
      const rect = open.get(key) ?? { ix0: ix, ix1: end, iz0: iz, code };
      rect.iz1 = iz + 1;
      next.set(key, rect);
      open.delete(key);
      ix = end;
    }
    for (const rect of open.values()) emit(rect);
    open = next;
  }
  for (const rect of open.values()) emit(rect);
}

/**
 * @param {{ terrain: object, batchAt: (x: number, z: number) => object, chunks: Array<{ x0: number, z0: number, x1: number, z1: number, batch: object }>,
 *   map: object, city: object }} input
 */
export function buildGround({ terrain, chunks, map, city }) {
  const { raster } = terrain;
  const { graph, bridge } = map;
  const deckX0 = graph.nodes.get(bridge.from).x + 4;
  const deckX1 = graph.nodes.get(bridge.to).x - 4;
  const deckZ = graph.nodes.get(bridge.from).z;
  const inDeck = (x, z) => x >= deckX0 && x < deckX1 && Math.abs(z - deckZ) < bridge.deckHalfWidth;
  const cellCentre = (ix, iz) => [raster.x0 + ix + 0.5, raster.z0 + iz + 0.5];
  const skip = (ix, iz) => {
    const [x, z] = cellCentre(ix, iz);
    return inDeck(x, z);
  };
  const codeAt = (ix, iz) => (ix < 0 || iz < 0 || ix >= raster.width || iz >= raster.height ? SURFACE.sand : raster.cells[iz * raster.width + ix]);

  for (const chunk of chunks) {
    const area = {
      ix0: Math.max(0, chunk.x0 - raster.x0), ix1: Math.min(raster.width, chunk.x1 - raster.x0),
      iz0: Math.max(0, chunk.z0 - raster.z0), iz1: Math.min(raster.height, chunk.z1 - raster.z0),
    };
    mergeCells(raster, area, skip, (r) => {
      const look = FLAT[r.code];
      chunk.batch.quad(raster.x0 + r.ix0, raster.z0 + r.iz0, raster.x0 + r.ix1, raster.z0 + r.iz1, look.y, look.color);
    });

    // Kerb and quay faces where a sidewalk meets a road or the water.
    const walls = [];
    for (let iz = area.iz0; iz < area.iz1; iz += 1) {
      for (let ix = area.ix0; ix < area.ix1; ix += 1) {
        if (codeAt(ix, iz) !== SURFACE.sidewalk || skip(ix, iz)) continue;
        for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const other = codeAt(ix + dx, iz + dz);
          if (other === SURFACE.road && !skip(ix + dx, iz + dz)) walls.push({ ix, iz, dx, dz, low: LOOK.roadY, color: LOOK.kerb });
          else if (other === SURFACE.water) walls.push({ ix, iz, dx, dz, low: -0.4, color: LOOK.quay });
        }
      }
    }
    for (const w of walls) {
      const x0 = raster.x0 + w.ix;
      const z0 = raster.z0 + w.iz;
      // Corners listed counter-clockwise as seen from outside the sidewalk.
      if (w.dz === -1) chunk.batch.face([x0 + 1, w.low, z0], [x0, w.low, z0], [x0, KERB_HEIGHT, z0], [x0 + 1, KERB_HEIGHT, z0], w.color);
      else if (w.dz === 1) chunk.batch.face([x0, w.low, z0 + 1], [x0 + 1, w.low, z0 + 1], [x0 + 1, KERB_HEIGHT, z0 + 1], [x0, KERB_HEIGHT, z0 + 1], w.color);
      else if (w.dx === -1) chunk.batch.face([x0, w.low, z0], [x0, w.low, z0 + 1], [x0, KERB_HEIGHT, z0 + 1], [x0, KERB_HEIGHT, z0], w.color);
      else chunk.batch.face([x0 + 1, w.low, z0 + 1], [x0 + 1, w.low, z0], [x0 + 1, KERB_HEIGHT, z0], [x0 + 1, KERB_HEIGHT, z0 + 1], w.color);
    }
  }
  paintMarkings({ chunks, map, city });
  paintRoundabout({ chunks, map });
}

function batchFor(chunks, x, z) {
  return chunks.find((c) => x >= c.x0 && x < c.x1 && z >= c.z0 && z < c.z1)?.batch ?? chunks[0].batch;
}

function paintMarkings({ chunks, map, city }) {
  const { graph } = map;
  const mark = (x0, z0, x1, z1, color) => batchFor(chunks, (x0 + x1) / 2, (z0 + z1) / 2).quad(x0, z0, x1, z1, LOOK.markY, color);
  const half = LOOK.markWidth / 2;
  for (const edge of graph.edges) {
    if (edge.kind === 'ring' || edge.kind === 'bridge' || edge.kind === 'market') continue;
    const a = graph.nodes.get(edge.a);
    const b = graph.nodes.get(edge.b);
    const alongX = a.z === b.z;
    const start = (alongX ? Math.min(a.x, b.x) : Math.min(a.z, b.z)) + edge.hw + map.sidewalk + 2;
    const end = (alongX ? Math.max(a.x, b.x) : Math.max(a.z, b.z)) - edge.hw - map.sidewalk - 2;
    const at = alongX ? a.z : a.x;
    const lane = (offset, color) => {
      for (let s = start; s + LOOK.dash < end; s += LOOK.dash + LOOK.dashGap) {
        if (alongX) mark(s, at + offset - half, s + LOOK.dash, at + offset + half, color);
        else mark(at + offset - half, s, at + offset + half, s + LOOK.dash, color);
      }
    };
    const solid = (offset, color) => {
      if (alongX) mark(start, at + offset - half, end, at + offset + half, color);
      else mark(at + offset - half, start, at + offset + half, end, color);
    };
    if (edge.kind === 'main') {
      solid(-0.25, LOOK.roadEdge);
      solid(0.25, LOOK.roadEdge);
      lane(-edge.hw / 2, LOOK.roadMark);
      lane(edge.hw / 2, LOOK.roadMark);
    } else if (!edge.oneWay) {
      lane(0, LOOK.roadMark);
    } else {
      lane(-edge.hw / 2, LOOK.roadMark);
      lane(edge.hw / 2, LOOK.roadMark);
    }
  }
  for (const c of city.crossings) {
    for (let t = -c.half + 0.4; t < c.half - 0.4; t += LOOK.zebraStripe + LOOK.zebraGap) {
      if (c.alongX) mark(c.x - LOOK.zebraDepth / 2, c.z + t, c.x + LOOK.zebraDepth / 2, c.z + t + LOOK.zebraStripe, LOOK.zebra);
      else mark(c.x + t, c.z - LOOK.zebraDepth / 2, c.x + t + LOOK.zebraStripe, c.z + LOOK.zebraDepth / 2, LOOK.zebra);
    }
  }
}

function paintRoundabout({ chunks, map }) {
  const { x, z, ringRadius, island, roadOuter, outer } = map.roundabout;
  // The roundabout straddles chunk borders; it is small, so it goes in the chunk holding its centre.
  const batch = batchFor(chunks, x, z);
  batch.ring(x, z, island, roadOuter, LOOK.roadY, LOOK.road, 56);
  batch.ring(x, z, roadOuter, outer, LOOK.walkY, LOOK.sidewalk, 56);
  batch.ring(x, z, island - 1, island, KERB_HEIGHT + 0.16, LOOK.sidewalk, 56);
  batch.disc(x, z, island - 1, KERB_HEIGHT + 0.16, LOOK.grass, 40);
  batch.ring(x, z, ringRadius - 0.1, ringRadius + 0.1, LOOK.markY, LOOK.roadMark, 56);
}
