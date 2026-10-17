// Lanes for traffic: every road edge gives one directed lane per direction it allows, driven
// on the right. Pure: no three.js, no DOM.
// A vehicle runs a lane from node to node, then a short curve across the junction to the next lane.

import { TRAFFIC } from './config.js';

const cross = (ax, az, bx, bz) => ax * bz - az * bx;

/**
 * @typedef {{ id: string, edge: object, dir: 1|-1, start: string, end: string,
 *   from: { x: number, z: number }, to: { x: number, z: number }, ux: number, uz: number,
 *   length: number, heading: number }} Lane
 */

/**
 * @param {import('./route.js').Graph} graph
 * @returns {{ lanes: Lane[], successors: (lane: Lane) => Lane[], laneAt: (id: string) => Lane|undefined }}
 */
export function createLaneNet(graph) {
  const lanes = [];
  const byId = new Map();
  graph.edges.forEach((edge, index) => {
    for (const dir of [1, -1]) {
      if (edge.oneWay === 'ab' && dir === -1) continue;
      if (edge.oneWay === 'ba' && dir === 1) continue;
      const startId = dir === 1 ? edge.a : edge.b;
      const endId = dir === 1 ? edge.b : edge.a;
      const a = graph.nodes.get(startId);
      const b = graph.nodes.get(endId);
      const ux = (b.x - a.x) / edge.length;
      const uz = (b.z - a.z) / edge.length;
      // Right of the direction of travel, with the same sense as `pointOnEdge`.
      const rx = -uz;
      const rz = ux;
      const offset = edge.kind === 'ring' ? 0 : edge.hw * TRAFFIC.laneShare;
      const lane = {
        id: `${index}:${dir}`,
        edge, dir, start: startId, end: endId,
        from: { x: a.x + rx * offset, z: a.z + rz * offset },
        to: { x: b.x + rx * offset, z: b.z + rz * offset },
        ux, uz, rx, rz, offset, length: edge.length, heading: Math.atan2(ux, uz),
      };
      lanes.push(lane);
      byId.set(lane.id, lane);
    }
  });
  const leaving = new Map();
  for (const lane of lanes) {
    if (!leaving.has(lane.start)) leaving.set(lane.start, []);
    leaving.get(lane.start).push(lane);
  }
  const cache = new Map();
  return {
    lanes,
    laneAt: (id) => byId.get(id),
    /** Lanes a vehicle may take after `lane`: no U-turn unless it is the only way on. */
    successors(lane) {
      if (!cache.has(lane.id)) {
        const options = (leaving.get(lane.end) ?? []).filter((l) => l.edge !== lane.edge);
        cache.set(lane.id, options.length > 0 ? options : (leaving.get(lane.end) ?? []));
      }
      return cache.get(lane.id);
    },
  };
}

/**
 * The curve across a junction from one lane to the next. It leaves the lane `exitS` metres from
 * the lane's start and joins the next lane `enterS` metres from its start, so a right turn
 * starts before the node and a left turn after it.
 * @param {Lane} from
 * @param {Lane} to
 * @returns {{ p0: object, p1: object, p2: object, length: number, angle: number, exitS: number,
 *   enterS: number, h0: number, h1: number }}
 */
export function turnPiece(from, to) {
  const turn = cross(from.ux, from.uz, to.ux, to.uz);
  const angle = Math.abs(Math.atan2(turn, from.ux * to.ux + from.uz * to.uz));
  const base = { angle, h0: from.heading, h1: to.heading };
  if (Math.abs(turn) < 1e-3) {
    // Straight on, or a U-turn: just step across between the two lane ends.
    const p0 = from.to;
    const p2 = to.from;
    const p1 = { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
    return { ...base, p0, p1, p2, length: Math.max(0.5, Math.hypot(p2.x - p0.x, p2.z - p0.z)), exitS: from.length, enterS: 0 };
  }
  // Where the two lane lines meet is the corner; start the curve a little before it and end a
  // little after, so the radius is about TRAFFIC.turnRadius.
  const k = cross(to.from.x - from.to.x, to.from.z - from.to.z, to.ux, to.uz) / turn;
  const corner = { x: from.to.x + from.ux * k, z: from.to.z + from.uz * k };
  const tangent = Math.min(TRAFFIC.turnTangentMax, TRAFFIC.turnRadius * Math.tan(angle / 2));
  const p0 = { x: corner.x - from.ux * tangent, z: corner.z - from.uz * tangent };
  const p2 = { x: corner.x + to.ux * tangent, z: corner.z + to.uz * tangent };
  const arms = 2 * tangent;
  const chord = Math.hypot(p2.x - p0.x, p2.z - p0.z);
  return {
    ...base, p0, p1: corner, p2, length: (chord + 2 * arms) / 3,
    exitS: from.length + k - tangent,
    enterS: (p2.x - to.from.x) * to.ux + (p2.z - to.from.z) * to.uz,
  };
}

/**
 * Point and heading on a junction curve.
 * @param {{ p0: object, p1: object, p2: object, h0: number, h1: number }} piece
 * @param {number} t 0 to 1
 * @returns {{ x: number, z: number, heading: number }}
 */
export function evalTurn(piece, t) {
  const u = 1 - t;
  const x = u * u * piece.p0.x + 2 * u * t * piece.p1.x + t * t * piece.p2.x;
  const z = u * u * piece.p0.z + 2 * u * t * piece.p1.z + t * t * piece.p2.z;
  const dx = 2 * u * (piece.p1.x - piece.p0.x) + 2 * t * (piece.p2.x - piece.p1.x);
  const dz = 2 * u * (piece.p1.z - piece.p0.z) + 2 * t * (piece.p2.z - piece.p1.z);
  if (Math.hypot(dx, dz) < 1e-6) {
    // No travel across the junction: turn the heading smoothly instead.
    const gap = Math.atan2(Math.sin(piece.h1 - piece.h0), Math.cos(piece.h1 - piece.h0));
    return { x, z, heading: piece.h0 + gap * t };
  }
  return { x, z, heading: Math.atan2(dx, dz) };
}
