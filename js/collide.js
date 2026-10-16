// 2D collision on the ground plane. Pure: no three.js, no DOM.
// Shapes: { type: 'circle', x, z, r } and { type: 'box', x, z, hw, hd, angle? }.
// A box's half-width `hw` runs along its local x axis and `hd` along its local z axis;
// `angle` is a rotation about y with the same sense as the bike heading (forward = (sin a, cos a)).
// Touching without overlapping is not a contact.

/**
 * @typedef {{ type: 'circle', x: number, z: number, r: number }} Circle
 * @typedef {{ type: 'box', x: number, z: number, hw: number, hd: number, angle?: number }} Box
 * @typedef {{ nx: number, nz: number, depth: number }} Contact normal points from the solid toward the circle
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {Circle} c
 * @param {Circle} other
 * @returns {Contact|null}
 */
export function circleVsCircle(c, other) {
  const dx = c.x - other.x;
  const dz = c.z - other.z;
  const reach = c.r + other.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= reach * reach) return null;
  const d = Math.sqrt(d2);
  if (d === 0) return { nx: 1, nz: 0, depth: reach };
  return { nx: dx / d, nz: dz / d, depth: reach - d };
}

/**
 * @param {Circle} c
 * @param {Box} box
 * @returns {Contact|null}
 */
export function circleVsBox(c, box) {
  const angle = box.angle ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = c.x - box.x;
  const dz = c.z - box.z;
  // Into the box's local frame: local x axis is (cos, -sin), local z axis is (sin, cos).
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const cx = clamp(lx, -box.hw, box.hw);
  const cz = clamp(lz, -box.hd, box.hd);
  const ox = lx - cx;
  const oz = lz - cz;
  const d2 = ox * ox + oz * oz;
  if (d2 >= c.r * c.r) return null;

  let nlx;
  let nlz;
  let depth;
  if (d2 > 0) {
    const d = Math.sqrt(d2);
    nlx = ox / d;
    nlz = oz / d;
    depth = c.r - d;
  } else {
    // Centre inside the box: leave by the nearest face.
    const px = box.hw - Math.abs(lx);
    const pz = box.hd - Math.abs(lz);
    if (px < pz) {
      nlx = lx < 0 ? -1 : 1;
      nlz = 0;
      depth = px + c.r;
    } else {
      nlx = 0;
      nlz = lz < 0 ? -1 : 1;
      depth = pz + c.r;
    }
  }
  return { nx: nlx * cos + nlz * sin, nz: -nlx * sin + nlz * cos, depth };
}

/**
 * @param {Circle} c
 * @param {Circle|Box} shape
 * @returns {Contact|null}
 */
export function contact(c, shape) {
  return shape.type === 'circle' ? circleVsCircle(c, shape) : circleVsBox(c, shape);
}

/**
 * Whether two shapes overlap by more than touching. Boxes use the separating-axis test.
 * @param {Circle|Box} a
 * @param {Circle|Box} b
 * @returns {boolean}
 */
export function shapesOverlap(a, b) {
  if (a.type === 'circle') return contact(a, b) !== null;
  if (b.type === 'circle') return contact(b, a) !== null;
  const axes = (box) => {
    const angle = box.angle ?? 0;
    return [{ x: Math.cos(angle), z: -Math.sin(angle) }, { x: Math.sin(angle), z: Math.cos(angle) }];
  };
  const reach = (box, axis) => {
    const [ux, uz] = axes(box);
    return box.hw * Math.abs(ux.x * axis.x + ux.z * axis.z) + box.hd * Math.abs(uz.x * axis.x + uz.z * axis.z);
  };
  for (const axis of [...axes(a), ...axes(b)]) {
    const centres = Math.abs((b.x - a.x) * axis.x + (b.z - a.z) * axis.z);
    // Touching within rounding error is not an overlap: lots that share a wall must not count.
    if (centres >= reach(a, axis) + reach(b, axis) - 1e-9) return false;
  }
  return true;
}

/**
 * Distance between the surfaces of a circle and a shape; negative when they overlap.
 * @param {Circle} c
 * @param {Circle|Box} shape
 * @returns {number}
 */
export function surfaceGap(c, shape) {
  if (shape.type === 'circle') return Math.hypot(c.x - shape.x, c.z - shape.z) - c.r - shape.r;
  const angle = shape.angle ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = c.x - shape.x;
  const dz = c.z - shape.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const ox = lx - clamp(lx, -shape.hw, shape.hw);
  const oz = lz - clamp(lz, -shape.hd, shape.hd);
  const outside = Math.hypot(ox, oz);
  if (outside > 0) return outside - c.r;
  return -Math.min(shape.hw - Math.abs(lx), shape.hd - Math.abs(lz)) - c.r;
}

/**
 * The two circles that stand in for the bike's body.
 * @param {{ x: number, z: number, heading: number }} bike
 * @param {{ radius: number, circleOffset: number }} body
 * @returns {Circle[]}
 */
export function bikeCircles(bike, { radius, circleOffset }) {
  const fx = Math.sin(bike.heading) * circleOffset;
  const fz = Math.cos(bike.heading) * circleOffset;
  return [
    { type: 'circle', x: bike.x + fx, z: bike.z + fz, r: radius },
    { type: 'circle', x: bike.x - fx, z: bike.z - fz, r: radius },
  ];
}

/**
 * The deepest overlap between any of `circles` and any of `shapes`.
 * @param {Circle[]} circles
 * @param {Array<Circle|Box>} shapes
 * @returns {(Contact & { solid: Circle|Box }) | null}
 */
export function deepestContact(circles, shapes) {
  let worst = null;
  for (const c of circles) {
    for (const shape of shapes) {
      const hit = contact(c, shape);
      if (hit && (!worst || hit.depth > worst.depth)) worst = { ...hit, solid: shape };
    }
  }
  return worst;
}

// Axis-aligned bounds of a shape, for the grid index.
function shapeBounds(shape) {
  if (shape.type === 'circle') {
    return { x0: shape.x - shape.r, x1: shape.x + shape.r, z0: shape.z - shape.r, z1: shape.z + shape.r };
  }
  const angle = shape.angle ?? 0;
  const ex = Math.abs(Math.cos(angle)) * shape.hw + Math.abs(Math.sin(angle)) * shape.hd;
  const ez = Math.abs(Math.sin(angle)) * shape.hw + Math.abs(Math.cos(angle)) * shape.hd;
  return { x0: shape.x - ex, x1: shape.x + ex, z0: shape.z - ez, z1: shape.z + ez };
}

/**
 * A uniform grid over shapes so a query only looks at what is nearby. Shapes can be added later.
 * @param {Array<Circle|Box>} solids
 * @param {number} cell grid cell size in metres
 */
export function createStaticIndex(solids, cell) {
  const cells = new Map();
  const key = (ix, iz) => ix * 100003 + iz;
  const all = [];
  const stamp = [];
  let pass = 0;
  function add(solid) {
    const index = all.length;
    all.push(solid);
    const b = shapeBounds(solid);
    for (let ix = Math.floor(b.x0 / cell); ix <= Math.floor(b.x1 / cell); ix += 1) {
      for (let iz = Math.floor(b.z0 / cell); iz <= Math.floor(b.z1 / cell); iz += 1) {
        const k = key(ix, iz);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(index);
      }
    }
  }
  solids.forEach(add);
  return {
    /** @param {Circle|Box} solid a shape to include in later queries */
    add,
    /**
     * @param {number} x
     * @param {number} z
     * @param {number} radius
     * @returns {Array<Circle|Box>} every solid whose cells touch the query square
     */
    query(x, z, radius) {
      pass += 1;
      const found = [];
      for (let ix = Math.floor((x - radius) / cell); ix <= Math.floor((x + radius) / cell); ix += 1) {
        for (let iz = Math.floor((z - radius) / cell); iz <= Math.floor((z + radius) / cell); iz += 1) {
          const list = cells.get(key(ix, iz));
          if (!list) continue;
          for (const index of list) {
            if (stamp[index] !== pass) {
              stamp[index] = pass;
              found.push(all[index]);
            }
          }
        }
      }
      return found;
    },
  };
}

/**
 * Fraction along a segment (0 to 1) where it first enters a box, or null when it misses.
 * @param {{ ax: number, az: number, bx: number, bz: number }} segment
 * @param {Box} box
 * @returns {number|null}
 */
export function segmentVsBox({ ax, az, bx, bz }, box) {
  const angle = box.angle ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const toLocal = (px, pz) => ({ x: (px - box.x) * cos - (pz - box.z) * sin, z: (px - box.x) * sin + (pz - box.z) * cos });
  const a = toLocal(ax, az);
  const b = toLocal(bx, bz);
  let enter = 0;
  let leave = 1;
  for (const [from, to, half] of [[a.x, b.x, box.hw], [a.z, b.z, box.hd]]) {
    const delta = to - from;
    if (delta === 0) {
      if (Math.abs(from) > half) return null;
    } else {
      let t0 = (-half - from) / delta;
      let t1 = (half - from) / delta;
      if (t0 > t1) [t0, t1] = [t1, t0];
      enter = Math.max(enter, t0);
      leave = Math.min(leave, t1);
      if (enter > leave) return null;
    }
  }
  return enter;
}

/**
 * First box a segment runs into, as a fraction of its length. Circles are ignored: a lamp post
 * never hides the bike from the camera.
 * @param {ReturnType<typeof createStaticIndex>} index
 * @param {{ ax: number, az: number, bx: number, bz: number }} segment
 * @returns {number} 1 when nothing is in the way
 */
export function firstBoxHit(index, segment) {
  const mx = (segment.ax + segment.bx) / 2;
  const mz = (segment.az + segment.bz) / 2;
  const reach = Math.hypot(segment.bx - segment.ax, segment.bz - segment.az) / 2;
  let nearest = 1;
  for (const solid of index.query(mx, mz, reach)) {
    if (solid.type !== 'box') continue;
    const t = segmentVsBox(segment, solid);
    if (t !== null && t < nearest) nearest = t;
  }
  return nearest;
}

/**
 * Remembers when each thing last gave a near miss, so passing one car is one bonus.
 * @param {{ maxGap: number, minSpeed: number, cooldownSeconds: number }} rules
 * @returns {{ update: Function, reset: Function }}
 */
export function createNearMissTracker({ maxGap, minSpeed, cooldownSeconds }) {
  const last = new Map();
  return {
    /**
     * @param {{ time: number, circles: Circle[], velocity: { x: number, z: number }, speed: number,
     *   others: Array<{ id: string|number, shape: Circle|Box, vx: number, vz: number }> }} frame
     * @returns {Array<{ id: string|number, gap: number }>} new near misses this frame
     */
    update({ time, circles, velocity, speed, others }) {
      if (speed < minSpeed) return [];
      const events = [];
      for (const other of others) {
        const gap = Math.min(...circles.map((c) => surfaceGap(c, other.shape)));
        if (gap <= 0 || gap >= maxGap) continue;
        const previous = last.get(other.id);
        if (previous !== undefined && time - previous < cooldownSeconds) continue;
        // Something that is pulling away, or driving alongside, is not a close call.
        const rx = other.shape.x - circles[0].x;
        const rz = other.shape.z - circles[0].z;
        const closing = rx * (other.vx - velocity.x) + rz * (other.vz - velocity.z);
        if (closing >= 0) continue;
        last.set(other.id, time);
        events.push({ id: other.id, gap });
      }
      return events;
    },
    reset() {
      last.clear();
    },
  };
}
