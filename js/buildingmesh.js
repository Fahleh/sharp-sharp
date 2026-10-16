// Turns generated buildings into geometry: walls that tile the facade texture, flat roofs,
// shopfronts with awnings, and the odds and ends on top.

import { CITY, PROP_LOOK as L } from './config.js';

const PLAIN = { u: 0.04, v: 0.04 };
const WHITE = '#ffffff';

const FACE = Object.freeze({
  n: { rotY: Math.PI, nx: 0, nz: -1 },
  s: { rotY: 0, nx: 0, nz: 1 },
  w: { rotY: -Math.PI / 2, nx: -1, nz: 0 },
  e: { rotY: Math.PI / 2, nx: 1, nz: 0 },
});

// A wall panel whose texture repeats once per window column and storey.
function wall(batch, b, face) {
  const { rotY, nx, nz } = FACE[face];
  const length = nx !== 0 ? b.d : b.w;
  const columns = Math.max(1, Math.round(length / CITY.windowWidth));
  const floors = Math.max(1, Math.round(b.h / CITY.floorHeight));
  batch.panel({
    x: b.x + nx * (b.w / 2), y: b.h / 2, z: b.z + nz * (b.d / 2), w: length, h: b.h, rotY,
  }, b.color, { u0: 0, v0: 0, u1: columns, v1: floors });
}

function shopfront(batch, b) {
  const { face, length, color, awning } = b.shop;
  const { rotY, nx, nz } = FACE[face];
  const x = b.x + nx * (b.w / 2 + 0.05);
  const z = b.z + nz * (b.d / 2 + 0.05);
  batch.panel({ x, y: CITY.shopHeight / 2, z, w: length, h: CITY.shopHeight, rotY }, color, { u0: PLAIN.u, v0: PLAIN.v, u1: PLAIN.u, v1: PLAIN.v });
  const glass = {
    x: x + nx * 0.03, y: 1.35, z: z + nz * 0.03, w: length - 1.2, h: 1.7, rotY,
  };
  batch.panel(glass, L.glass, { u0: PLAIN.u, v0: PLAIN.v, u1: PLAIN.u, v1: PLAIN.v });
  if (awning) {
    // Alternating stripes across the awning, hung above the glass and reaching over the pavement.
    const tx = -nz;
    const tz = nx;
    const stripes = Math.max(2, Math.floor(length / 1.1));
    const stripeLength = length / stripes;
    for (let i = 0; i < stripes; i += 1) {
      const offset = -length / 2 + stripeLength * (i + 0.5);
      batch.box({
        x: x + nx * (CITY.awningDepth / 2) + tx * offset, y: CITY.awningDrop, z: z + nz * (CITY.awningDepth / 2) + tz * offset,
        w: nx !== 0 ? CITY.awningDepth : stripeLength, h: 0.12, d: nx !== 0 ? stripeLength : CITY.awningDepth,
      }, i % 2 === 0 ? awning : L.stripeWhite, PLAIN);
    }
  }
}

function roofDetails(batch, b) {
  const y = b.h;
  for (const item of b.roof) {
    const x = b.x + item.x;
    const z = b.z + item.z;
    if (item.kind === 'tank') {
      for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
        batch.box({ x: x + dx, y: y + 0.5, z: z + dz, w: 0.14, h: 1, d: 0.14 }, L.frame, PLAIN);
      }
      batch.cylinder({ x, y: y + 1.9, z, r: 1.1, h: 1.8 }, '#3f5f7f', PLAIN);
    } else if (item.kind === 'antenna') {
      batch.box({ x, y: y + item.h / 2, z, w: 0.12, h: item.h, d: 0.12 }, L.frame, PLAIN);
      batch.box({ x, y: y + item.h * 0.8, z, w: 1.4, h: 0.08, d: 0.08 }, L.frame, PLAIN);
    } else {
      batch.box({ x, y: y + 1.2, z, w: 3, h: 2.4, d: 3 }, b.color, PLAIN);
      batch.box({ x, y: y + 2.45, z, w: 3.3, h: 0.14, d: 3.3 }, L.concrete, PLAIN);
    }
  }
}

/**
 * @param {ReturnType<typeof import('./batch.js').createBatch>} batch
 * @param {object} b a building from the city generator
 */
export function addBuilding(batch, b) {
  for (const face of ['n', 's', 'w', 'e']) wall(batch, b, face);
  batch.quad(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2, b.h, CITY.roof, PLAIN);
  if (b.shop) shopfront(batch, b);
  roofDetails(batch, b);
}


/**
 * Sign quads, two-sided where asked, and the frame under a rooftop board.
 * @param {ReturnType<typeof import('./batch.js').createBatch>} batch
 * @param {object[]} signs
 * @param {{ rectFor: Function, solid: { u: number, v: number } }} atlas
 */
export function addSigns(batch, signs, atlas) {
  for (const sign of signs) {
    const rect = atlas.rectFor(sign);
    const spec = { x: sign.x, y: sign.y, z: sign.z, w: sign.w, h: sign.h, rotY: sign.rotY };
    batch.panel(spec, WHITE, rect);
    if (sign.both) batch.panel({ ...spec, x: sign.x - Math.sin(sign.rotY) * 0.06, z: sign.z - Math.cos(sign.rotY) * 0.06, rotY: sign.rotY + Math.PI }, WHITE, rect);
    if (sign.stands) {
      const tx = Math.cos(sign.rotY);
      const tz = -Math.sin(sign.rotY);
      for (const side of [-1, 1]) {
        batch.box({ x: sign.x + tx * side * sign.w * 0.35, y: sign.y - sign.h / 2 - 0.9, z: sign.z + tz * side * sign.w * 0.35 - Math.cos(sign.rotY) * 0.2, w: 0.2, h: 1.8, d: 0.2 }, L.frame, atlas.solid);
      }
    }
  }
}
