// Scenery that is only ever looked at: the far skyline and boats on the lagoon. Pure.
// Nothing here is solid.

import { CITY as C } from './config.js';
import { MAP, WATER } from './map.js';

const SKYLINE_TINTS = Object.freeze(['#a9b4c2', '#b9b4ad', '#9fb0b0', '#b3a9b8', '#c4b8a6']);
const BOAT_COLORS = Object.freeze(['#4a3b2f', '#2f4b6e', '#7a3f2f', '#2f5a4a']);

/** @param {{ rng: object }} input */
export function addDecor({ rng }) {
  const world = MAP.world;
  const skyline = [];
  for (let i = 0; i < C.skylineCount; i += 1) {
    // Pick a side of the district and a spot beyond the wall; the lagoon side is far shore.
    const side = rng.pick(['s', 'e', 'w', 'n', 's', 'e', 'w']);
    const depth = rng.range(C.skylineNear, C.skylineFar);
    let x;
    let z;
    if (side === 's') { x = rng.range(-world.wallX - 90, world.wallX + 90); z = depth - 20; }
    else if (side === 'n') { x = rng.range(-world.wallX - 90, world.wallX + 90); z = WATER.lagoon.z1 - depth - 140; }
    else { x = (side === 'e' ? 1 : -1) * depth; z = rng.range(WATER.lagoon.z1 - 120, world.wallZ + 90); }
    skyline.push({
      x, z, w: rng.range(18, 40), d: rng.range(18, 40), h: rng.range(35, 95), color: rng.pick(SKYLINE_TINTS),
    });
  }
  const boats = [];
  for (let i = 0; i < C.boats; i += 1) {
    const inInlet = i < 2;
    boats.push({
      x: inInlet ? rng.range(WATER.inlet.x0 + 10, WATER.inlet.x1 - 10) : rng.range(-200, 200),
      z: inInlet ? rng.range(-185, -125) : rng.range(WATER.lagoon.z1 - 90, WATER.lagoon.z1 - 14),
      rot: inInlet ? rng.range(-0.3, 0.3) : rng.range(0, Math.PI * 2),
      length: rng.range(5, 9),
      color: rng.pick(BOAT_COLORS),
      cabin: rng.chance(0.6),
    });
  }
  return { skyline, boats };
}
