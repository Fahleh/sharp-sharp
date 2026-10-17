// Models each kind of prop from boxes, cylinders and cones into a chunk batch. Trees also have a
// plain version, a fraction of the triangles, for when the frame rate needs saving.

import { PROPS, PROP_LOOK as L } from './config.js';

const PLAIN = { u: 0.04, v: 0.04 };

// Leaf pivoting at the palm crown: the centre sits half a leaf out along the leaf's own direction.
function palmLeaf(batch, { x, y, z, rotY, pitch, length, color }) {
  const reach = (length / 2) * Math.cos(pitch);
  batch.box({
    x: x + Math.sin(rotY) * reach, y: y - (length / 2) * Math.sin(pitch), z: z + Math.cos(rotY) * reach,
    w: 0.55, h: 0.06, d: length, rotY, pitch,
  }, color, PLAIN);
}

const builders = {
  palm(batch, p) {
    const lean = p.rot;
    batch.cylinder({ x: p.x, y: 2.8, z: p.z, r: 0.2, h: 5.6 }, L.trunk, PLAIN);
    for (let i = 0; i < 7; i += 1) {
      palmLeaf(batch, {
        x: p.x, y: 5.6, z: p.z, rotY: lean + (i / 7) * Math.PI * 2, pitch: 0.45 + (i % 2) * 0.2, length: 3,
        color: i % 2 === 0 ? L.palmLeaf : L.palmLeafDark,
      });
    }
    batch.sphere({ x: p.x, y: 5.6, z: p.z, rx: 0.32 }, L.palmLeafDark, PLAIN);
  },
  almond(batch, p) {
    batch.cylinder({ x: p.x, y: 1.5, z: p.z, r: 0.22, h: 3 }, L.trunk, PLAIN);
    batch.sphere({ x: p.x, y: 3.6, z: p.z, rx: 2.3, ry: 0.9 }, L.almondLeaf, PLAIN);
    batch.sphere({ x: p.x, y: 4.6, z: p.z, rx: 1.6, ry: 0.8 }, L.almondLeafLight, PLAIN);
    batch.sphere({ x: p.x, y: 5.4, z: p.z, rx: 0.9, ry: 0.6 }, L.almondLeaf, PLAIN);
  },
  lamp(batch, p) {
    batch.cylinder({ x: p.x, y: 2.8, z: p.z, r: 0.1, h: 5.6 }, L.lamp, PLAIN);
    batch.box({ x: p.x, y: 5.6, z: p.z, w: 0.5, h: 0.14, d: 0.5 }, L.lamp, PLAIN);
    batch.box({ x: p.x, y: 5.45, z: p.z, w: 0.34, h: 0.12, d: 0.34 }, L.bulb, PLAIN);
  },
  light(batch, p) {
    // A pole on the kerb corner with an arm reaching over the road and a three-lamp head.
    const armX = p.x - p.sx * 1.6;
    batch.cylinder({ x: p.x, y: 2.4, z: p.z, r: 0.09, h: 4.8 }, L.lamp, PLAIN);
    batch.box({ x: (p.x + armX) / 2, y: 4.7, z: p.z, w: 1.6, h: 0.1, d: 0.1 }, L.lamp, PLAIN);
    batch.box({ x: armX, y: 4.3, z: p.z, w: 0.34, h: 0.95, d: 0.34 }, L.generatorDark, PLAIN);
    const lit = p.sz > 0 ? L.lightGreen : L.lightRed;
    batch.sphere({ x: armX, y: 4.62, z: p.z, rx: 0.1 }, p.sz > 0 ? L.lightRed : L.lightGreen, PLAIN);
    batch.sphere({ x: armX, y: 4.3, z: p.z, rx: 0.1 }, L.lightAmber, PLAIN);
    batch.sphere({ x: armX, y: 3.98, z: p.z, rx: 0.1 }, lit, PLAIN);
  },
  kiosk(batch, p) {
    const { hw, hd, h } = PROPS.kiosk;
    const s = Math.sin(p.rot);
    const c = Math.cos(p.rot);
    batch.box({ x: p.x, y: h / 2, z: p.z, w: hw * 2, h, d: hd * 2, rotY: p.rot }, p.color, PLAIN);
    batch.box({ x: p.x, y: h + 0.07, z: p.z, w: hw * 2 + 0.4, h: 0.14, d: hd * 2 + 0.4, rotY: p.rot }, L.roofWhite, PLAIN);
    // A dark serving window on each long side.
    for (const side of [-1, 1]) {
      batch.box({ x: p.x + s * side * (hd + 0.02), y: 1.5, z: p.z + c * side * (hd + 0.02), w: hw * 1.4, h: 0.9, d: 0.06, rotY: p.rot }, L.glass, PLAIN);
    }
  },
  stall(batch, p) {
    const { hw, hd } = PROPS.stall;
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      const lx = dx * (hw - 0.1);
      const lz = dz * (hd - 0.1);
      batch.box({ x: p.x + lx * c + lz * s, y: 1.0, z: p.z - lx * s + lz * c, w: 0.08, h: 2.0, d: 0.08 }, L.stall, PLAIN);
    }
    batch.box({ x: p.x, y: 0.8, z: p.z, w: hw * 2 - 0.3, h: 0.1, d: hd * 2 - 0.3, rotY: p.rot }, L.stool, PLAIN);
    batch.cone({ x: p.x, y: 2.5, z: p.z, r: 1.9, h: 0.7 }, p.color, PLAIN);
  },
  barrier(batch, p) {
    const { hw, hd, h } = PROPS.barrier;
    batch.box({ x: p.x, y: h / 2, z: p.z, w: hw * 2, h, d: hd * 2, rotY: p.rot }, L.concrete, PLAIN);
    batch.box({ x: p.x, y: h + 0.04, z: p.z, w: hw * 2, h: 0.08, d: hd * 2 - 0.1, rotY: p.rot }, L.stripeRed, PLAIN);
  },
  car(batch, p) {
    batch.box({ x: p.x, y: 0.55, z: p.z, w: 1.9, h: 0.7, d: 4.4, rotY: p.rot }, p.color, PLAIN);
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    // The cabin sits a little behind centre along the car's local z axis.
    batch.box({ x: p.x - s * 0.25, y: 1.15, z: p.z - c * 0.25, w: 1.7, h: 0.6, d: 2.3, rotY: p.rot }, L.carGlass, PLAIN);
    batch.box({ x: p.x - s * 0.25, y: 1.5, z: p.z - c * 0.25, w: 1.5, h: 0.06, d: 1.9, rotY: p.rot }, p.color, PLAIN);
    batch.box({ x: p.x, y: 0.2, z: p.z, w: 1.7, h: 0.3, d: 4.0, rotY: p.rot }, L.carTyre, PLAIN);
  },
  generator(batch, p) {
    const { hw, hd, h } = PROPS.generator;
    batch.box({ x: p.x, y: h / 2, z: p.z, w: hw * 2, h, d: hd * 2, rotY: p.rot }, L.generator, PLAIN);
    batch.box({ x: p.x, y: h + 0.15, z: p.z, w: 0.5, h: 0.3, d: 0.4, rotY: p.rot }, L.generatorDark, PLAIN);
    batch.cylinder({ x: p.x + Math.cos(p.rot) * 0.4, y: h + 0.5, z: p.z - Math.sin(p.rot) * 0.4, r: 0.05, h: 0.8 }, L.generatorDark, PLAIN);
  },
  shelter(batch, p) {
    const { hw, hd, h } = PROPS.shelter;
    batch.box({ x: p.x, y: h, z: p.z, w: hw * 2 + 0.3, h: 0.14, d: hd * 2 + 0.3 }, L.shelterRoof, PLAIN);
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) batch.box({ x: p.x + dx * (hw - 0.1), y: h / 2, z: p.z + dz * (hd - 0.1), w: 0.1, h, d: 0.1 }, L.frame, PLAIN);
    }
    batch.box({ x: p.x, y: 1.2, z: p.z - (hd - 0.1), w: hw * 2 - 0.2, h: 1.6, d: 0.05 }, L.glass, PLAIN);
    batch.box({ x: p.x, y: 0.5, z: p.z - 0.1, w: hw * 2 - 0.6, h: 0.08, d: 0.4 }, L.stool, PLAIN);
  },
  gate(batch, p) {
    const { hw, h } = PROPS.gate;
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    for (const side of [-1, 1]) {
      batch.box({ x: p.x + c * side * (hw - 0.25), y: h / 2, z: p.z - s * side * (hw - 0.25), w: 0.5, h, d: 0.5, rotY: p.rot }, L.gatePost, PLAIN);
    }
    batch.box({ x: p.x, y: 1.1, z: p.z, w: hw * 2 - 0.9, h: 2.0, d: 0.14, rotY: p.rot }, p.color, PLAIN);
    batch.box({ x: p.x, y: h + 0.1, z: p.z, w: hw * 2, h: 0.2, d: 0.5, rotY: p.rot }, L.gatePost, PLAIN);
  },
  container(batch, p) {
    const { hw, hd, h } = PROPS.container;
    batch.box({ x: p.x, y: h / 2, z: p.z, w: hw * 2, h, d: hd * 2, rotY: p.rot }, p.color, PLAIN);
    batch.box({ x: p.x, y: h + 0.03, z: p.z, w: hw * 2 - 0.2, h: 0.06, d: hd * 2 - 0.2, rotY: p.rot }, L.generatorDark, PLAIN);
  },
  bench(batch, p) {
    batch.box({ x: p.x, y: 0.5, z: p.z, w: 1.8, h: 0.1, d: 0.5, rotY: p.rot }, L.stool, PLAIN);
    batch.box({ x: p.x, y: 0.25, z: p.z, w: 1.6, h: 0.5, d: 0.1, rotY: p.rot }, L.frame, PLAIN);
  },
  rubbish(batch, p) {
    batch.box({ x: p.x, y: 0.3, z: p.z, w: 1.1, h: 0.6, d: 0.9, rotY: p.rot }, p.color, PLAIN);
    batch.box({ x: p.x + 0.3, y: 0.7, z: p.z, w: 0.6, h: 0.4, d: 0.6, rotY: p.rot + 0.5 }, L.stripeWhite, PLAIN);
  },
  goal(batch, p) {
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    for (const side of [-1, 1]) batch.cylinder({ x: p.x + c * side * 1.8, y: 1.2, z: p.z - s * side * 1.8, r: 0.06, h: 2.4 }, L.goal, PLAIN);
    batch.box({ x: p.x, y: 2.4, z: p.z, w: 3.7, h: 0.1, d: 0.1, rotY: p.rot }, L.goal, PLAIN);
  },
};

// The same trees from far fewer triangles. They stand where the full trees stand, so the
// collision circles are right either way.
const plainBuilders = {
  palm(batch, p) {
    batch.box({ x: p.x, y: 2.8, z: p.z, w: 0.4, h: 5.6, d: 0.4 }, L.trunk, PLAIN);
    for (let i = 0; i < 3; i += 1) {
      palmLeaf(batch, {
        x: p.x, y: 5.6, z: p.z, rotY: p.rot + (i / 3) * Math.PI * 2, pitch: 0.55, length: 3, color: i % 2 === 0 ? L.palmLeaf : L.palmLeafDark,
      });
    }
  },
  almond(batch, p) {
    batch.box({ x: p.x, y: 1.5, z: p.z, w: 0.44, h: 3, d: 0.44 }, L.trunk, PLAIN);
    batch.cone({ x: p.x, y: 3.1, z: p.z, r: 2.2, h: 2.6 }, L.almondLeaf, PLAIN);
  },
};

/** @param {string} kind */
export const isTree = (kind) => kind in plainBuilders;

/**
 * @param {{ batch: ReturnType<typeof import('./batch.js').createBatch>,
 *   prop: { kind: string, x: number, z: number, rot: number }, plain?: boolean }} input `plain` draws
 *   trees in the cheap version
 */
export function addProp({ batch, prop, plain = false }) {
  (plain && isTree(prop.kind) ? plainBuilders : builders)[prop.kind](batch, prop);
}
