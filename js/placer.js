// Puts props on the ground without stacking them on each other or on roads. Pure: no three.js.
// A solid prop also becomes a collision shape the bike can hit.

import { PROPS } from './config.js';
import { shapesOverlap } from './collide.js';

const OPEN_GROUND = Object.freeze(['sidewalk', 'plaza', 'grass', 'sand']);

/**
 * @param {{ terrain: ReturnType<import('./terrain.js').createTerrain>,
 *   index: ReturnType<typeof import('./collide.js').createStaticIndex>,
 *   addSolid: (shape: object) => void }} world
 */
export function createPlacer({ terrain, index, addSolid }) {
  const props = [];

  function footprint(def, x, z, rot, pad) {
    if (def.shape === 'circle') return { type: 'circle', x, z, r: def.r + pad };
    if (def.shape === 'box') return { type: 'box', x, z, hw: def.hw + pad, hd: def.hd + pad, angle: rot };
    return { type: 'circle', x, z, r: def.r + pad };
  }

  function corners(def, x, z, rot) {
    if (def.shape !== 'box') return [[x, z]];
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const pts = [[x, z]];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lx = sx * def.hw;
      const lz = sz * def.hd;
      // Local x axis is (cos, -sin) and local z axis is (sin, cos).
      pts.push([x + lx * cos + lz * sin, z - lx * sin + lz * cos]);
    }
    return pts;
  }

  /**
   * @param {keyof typeof PROPS} kind
   * @param {number} x
   * @param {number} z
   * @param {number} [rot] rotation about y, same sense as the bike heading
   * @param {{ pad?: number, ground?: readonly string[], data?: object }} [options]
   *   `pad` keeps that much clear space around the prop; `data` rides along to the mesh builder
   * @returns {object|null} the prop, or null when it did not fit
   */
  function place(kind, x, z, rot = 0, { pad = 0, ground = OPEN_GROUND, data = {} } = {}) {
    const def = PROPS[kind];
    if (!corners(def, x, z, rot).every(([px, pz]) => ground.includes(terrain.surfaceAt(px, pz)))) return null;
    const probe = footprint(def, x, z, rot, pad);
    const reach = Math.max(def.r ?? 0, def.hw ?? 0, def.hd ?? 0) + pad + 3;
    if (index.query(x, z, reach).some((other) => shapesOverlap(probe, other))) return null;
    const prop = { kind, x, z, rot, ...data };
    if (def.shape !== 'none') addSolid(footprint(def, x, z, rot, 0));
    props.push(prop);
    return prop;
  }

  return { place, props };
}
