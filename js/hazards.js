// Potholes and speed bumps. Pure: they are placed along the roads from a seed, and a tracker
// says when the bike rolls over one. What a hit costs is in `hazardEffect`.

import { BIKE, HAZARDS } from './config.js';
import { contact } from './collide.js';

/**
 * @param {{ graph: import('./route.js').Graph, rng: ReturnType<typeof import('./rng.js').createRng>,
 *   keepClear: { x: number, z: number }[] }} input `keepClear` are points (the spawn) no hazard may sit near
 * @returns {{ potholes: Array<{ id: string, type: 'circle', x: number, z: number, r: number }>,
 *   bumps: Array<{ id: string, type: 'box', x: number, z: number, hw: number, hd: number, angle: number }> }}
 */
export function generateHazards({ graph, rng, keepClear = [] }) {
  const edges = graph.edges.filter((e) => HAZARDS.roadKinds.includes(e.kind) && e.length > HAZARDS.nodeMargin * 2 + 4);
  const total = edges.reduce((sum, e) => sum + e.length, 0);
  const placed = [];
  const out = { potholes: [], bumps: [] };

  const farEnough = (x, z) => placed.every((p) => Math.hypot(p.x - x, p.z - z) >= HAZARDS.spacing)
    && keepClear.every((p) => Math.hypot(p.x - x, p.z - z) >= HAZARDS.spawnClear);

  function pickEdge() {
    let at = rng.next() * total;
    for (const edge of edges) {
      at -= edge.length;
      if (at <= 0) return edge;
    }
    return edges[edges.length - 1];
  }

  function place(kind) {
    for (let i = 0; i < HAZARDS.placeTries; i += 1) {
      const edge = pickEdge();
      const a = graph.nodes.get(edge.a);
      const b = graph.nodes.get(edge.b);
      const ux = (b.x - a.x) / edge.length;
      const uz = (b.z - a.z) / edge.length;
      const along = rng.range(HAZARDS.nodeMargin, edge.length - HAZARDS.nodeMargin);
      // A pothole sits in one of the two lanes; a bump spans the road, so it sits on the centre line.
      const lane = kind === 'pothole' ? (rng.chance(0.5) ? 1 : -1) * edge.hw * 0.5 + rng.range(-HAZARDS.jitter, HAZARDS.jitter) : 0;
      const x = a.x + ux * along - uz * lane;
      const z = a.z + uz * along + ux * lane;
      if (!farEnough(x, z)) continue;
      placed.push({ x, z });
      const id = `${kind}${out.potholes.length + out.bumps.length}`;
      if (kind === 'pothole') {
        out.potholes.push({ id, type: 'circle', x, z, r: HAZARDS.pothole.r });
      } else {
        out.bumps.push({ id, type: 'box', x, z, hw: edge.hw, hd: HAZARDS.bump.halfDepth, angle: Math.atan2(ux, uz) });
      }
      return;
    }
  }

  const potholes = Math.round((total / 100) * HAZARDS.pothole.per100m);
  const bumps = Math.round((total / 100) * HAZARDS.bump.per100m);
  for (let i = 0; i < bumps; i += 1) place('bump');
  for (let i = 0; i < potholes; i += 1) place('pothole');
  return out;
}

/**
 * What rolling over a hazard does at a given speed.
 * @param {'pothole'|'bump'} kind
 * @param {number} speed m/s
 * @returns {{ speedFactor: number, conditionLoss: number, joltSeconds: number, joltSize: number }}
 *   a bump taken gently costs nothing; both scale with how fast the bike was going
 */
export function hazardEffect(kind, speed) {
  const h = HAZARDS[kind];
  const fast = Math.min(1, speed / BIKE.topSpeed);
  if (kind === 'bump' && speed < h.gentleSpeed) return { speedFactor: 1, conditionLoss: 0, joltSeconds: 0, joltSize: 0 };
  // Even a slow pothole hit shakes the load; a fast one is worse.
  const weight = 0.5 + 0.5 * fast;
  return {
    speedFactor: 1 - (1 - h.speedFactor) * weight,
    conditionLoss: h.conditionLoss * weight,
    joltSeconds: h.joltSeconds,
    joltSize: h.joltSize * weight,
  };
}

/**
 * Says which hazards the bike has just rolled onto. A hazard cannot trigger again for a moment
 * after it does, so sitting on one is not a hit every frame.
 * @returns {{ update: (frame: { time: number, circles: object[], hazards: ReturnType<typeof generateHazards> }) =>
 *   Array<{ kind: 'pothole'|'bump', id: string, x: number, z: number }>, reset: () => void }}
 */
export function createHazardTracker() {
  const last = new Map();
  return {
    update({ time, circles, hazards }) {
      const hits = [];
      const check = (kind, list) => {
        for (const hazard of list) {
          if (time - (last.get(hazard.id) ?? -Infinity) < HAZARDS.retriggerSeconds) continue;
          if (!circles.some((c) => contact(c, hazard))) continue;
          last.set(hazard.id, time);
          hits.push({ kind, id: hazard.id, x: hazard.x, z: hazard.z });
        }
      };
      check('pothole', hazards.potholes);
      check('bump', hazards.bumps);
      return hits;
    },
    reset() { last.clear(); },
  };
}
