// What the ground is made of at any point: a 1 m raster painted from the map. Pure: no three.js.
// The renderer meshes the raster and the sim reads it, so what you see is what slows the bike.

import { KERB_HEIGHT } from './config.js';
import { MAP, blockRect } from './map.js';
import { projectOnGraph } from './route.js';

export const SURFACE = Object.freeze({
  sand: 0, grass: 1, plaza: 2, sidewalk: 3, road: 4, water: 5, roundabout: 6,
});
const NAMES = Object.freeze(['sand', 'grass', 'plaza', 'sidewalk', 'road', 'water', 'roundabout']);

const BLOCK_GROUND = Object.freeze({
  park: SURFACE.grass, field: SURFACE.grass, estate: SURFACE.grass, sandlot: SURFACE.sand, water: SURFACE.water,
});

/**
 * @param {typeof MAP} [map] the district to paint; defaults to the authored one
 */
export function createTerrain(map = MAP) {
  const { world, graph, roundabout, bridge, water, sidewalk } = map;
  const width = world.x1 - world.x0;
  const height = world.z1 - world.z0;
  const cells = new Uint8Array(width * height);

  function paint(x0, z0, x1, z1, code) {
    const ix0 = Math.max(0, Math.floor(x0 - world.x0));
    const ix1 = Math.min(width, Math.ceil(x1 - world.x0));
    const iz0 = Math.max(0, Math.floor(z0 - world.z0));
    const iz1 = Math.min(height, Math.ceil(z1 - world.z0));
    for (let iz = iz0; iz < iz1; iz += 1) cells.fill(code, iz * width + ix0, iz * width + ix1);
  }

  for (const block of map.blocks) {
    const r = blockRect(block);
    paint(r.x0, r.z0, r.x1, r.z1, BLOCK_GROUND[block.type] ?? SURFACE.plaza);
  }
  for (const w of [water.lagoon, water.inlet]) paint(w.x0, w.z0, w.x1, w.z1, SURFACE.water);

  const roads = graph.edges.filter((e) => e.kind !== 'ring');
  const strip = (edge, reach, code) => {
    const a = graph.nodes.get(edge.a);
    const b = graph.nodes.get(edge.b);
    paint(Math.min(a.x, b.x) - reach, Math.min(a.z, b.z) - reach, Math.max(a.x, b.x) + reach, Math.max(a.z, b.z) + reach, code);
  };
  // Sidewalks first, then roads, so a road always wins at a junction.
  for (const edge of roads) strip(edge, edge.hw + sidewalk, SURFACE.sidewalk);
  for (const edge of roads) strip(edge, edge.hw, SURFACE.road);

  const outer = roundabout.outer;
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const dx = world.x0 + ix + 0.5 - roundabout.x;
      const dz = world.z0 + iz + 0.5 - roundabout.z;
      if (dx * dx + dz * dz <= outer * outer) cells[iz * width + ix] = SURFACE.roundabout;
    }
  }

  const deckX0 = graph.nodes.get(bridge.from).x + 4;
  const deckX1 = graph.nodes.get(bridge.to).x - 4;
  const deckZ = graph.nodes.get(bridge.from).z;

  function code(x, z) {
    const ix = Math.floor(x - world.x0);
    const iz = Math.floor(z - world.z0);
    if (ix < 0 || iz < 0 || ix >= width || iz >= height) return SURFACE.sand;
    return cells[iz * width + ix];
  }

  function ringSurface(x, z) {
    const r = Math.hypot(x - roundabout.x, z - roundabout.z);
    if (r < roundabout.island) return 'grass';
    return r <= roundabout.roadOuter ? 'road' : 'sidewalk';
  }

  /** @returns {'sand'|'grass'|'plaza'|'sidewalk'|'road'|'water'} */
  function surfaceAt(x, z) {
    const c = code(x, z);
    return c === SURFACE.roundabout ? ringSurface(x, z) : NAMES[c];
  }

  /** Ground height in metres: the bridge arch, plus the kerb on sidewalks. */
  function heightAt(x, z) {
    let h = surfaceAt(x, z) === 'sidewalk' ? KERB_HEIGHT : 0;
    if (x > deckX0 && x < deckX1 && Math.abs(z - deckZ) <= bridge.deckHalfWidth) {
      h += bridge.height * Math.sin((Math.PI * (x - deckX0)) / (deckX1 - deckX0));
    }
    return h;
  }

  /**
   * Nearest road centreline point, facing along the road the way `heading` already leans.
   * @param {number} x
   * @param {number} z
   * @param {number} heading radians
   * @returns {{ x: number, z: number, heading: number }}
   */
  function nearestRoadPoint(x, z, heading) {
    const hit = projectOnGraph(graph, x, z);
    const a = graph.nodes.get(hit.edge.a);
    const b = graph.nodes.get(hit.edge.b);
    const forward = Math.atan2(b.x - a.x, b.z - a.z);
    const alongFacing = Math.cos(forward - heading) >= 0;
    return { x: hit.x, z: hit.z, heading: alongFacing ? forward : forward + Math.PI };
  }

  return {
    surfaceAt, heightAt, nearestRoadPoint, ringSurface,
    raster: { x0: world.x0, z0: world.z0, width, height, cells },
  };
}
