// Vehicle simulation: cars and danfos driving the road graph's lanes. Pure: no three.js, no DOM.
// Vehicles keep a gap, slow for junctions and turns, give way to the bike and to people on a
// crossing, and danfos swing in to named stops. Nothing here is physics: they follow lanes.

import { TRAFFIC } from './config.js';
import { evalTurn, turnPiece } from './lanes.js';

// Node ids of the roundabout ring all start with this.
const RING_PREFIX = 'rb';
const PLAYER_HALF_LENGTH = 0.9;
const PLAYER_HALF_WIDTH = 0.45;

/**
 * @param {{ net: ReturnType<typeof import('./lanes.js').createLaneNet>,
 *   rng: ReturnType<typeof import('./rng.js').createRng>, stops: Set<string> }} world
 *   `stops` holds the node ids where danfos halt
 */
export function createTraffic({ net, rng, stops }) {
  /** @type {object[]} */
  let vehicles = [];
  let nextId = 1;
  let sinceSpawn = 0;
  // One vehicle at a time crosses a junction: node id -> id of the vehicle that holds it.
  const owners = new Map();
  const kindNames = Object.keys(TRAFFIC.kinds);
  const totalWeight = kindNames.reduce((sum, k) => sum + TRAFFIC.kinds[k].weight, 0);

  function pickKind(lane) {
    if (lane.edge.kind === 'market') return TRAFFIC.kinds.keke ? 'keke' : null;
    let roll = rng.next() * totalWeight;
    for (const name of kindNames) {
      const def = TRAFFIC.kinds[name];
      if (def.marketOnly) continue;
      roll -= def.weight;
      if (roll <= 0) return name;
    }
    return kindNames[0];
  }

  function enterLane(v, lane, s) {
    v.lane = lane;
    v.piece = 'lane';
    v.s = s;
    const options = net.successors(lane);
    // Only market vehicles use the market street.
    const allowed = options.filter((l) => l.edge.kind !== 'market' || v.kind === 'keke');
    v.next = rng.pick(allowed.length > 0 ? allowed : options);
    v.turnAhead = turnPiece(lane, v.next);
    v.enterS = 0;
    v.stopS = null;
    if (v.kind === 'danfo' && stops.has(lane.end) && lane.length > TRAFFIC.danfo.stopBack + 8 && rng.chance(TRAFFIC.danfo.stopChance)) {
      v.stopS = lane.length - TRAFFIC.danfo.stopBack;
    }
  }

  function place(v) {
    v.px = v.x;
    v.pz = v.z;
    v.ph = v.heading;
    if (v.piece === 'lane') {
      const { lane } = v;
      v.x = lane.from.x + lane.ux * v.s + lane.rx * v.lateral;
      v.z = lane.from.z + lane.uz * v.s + lane.rz * v.lateral;
      v.heading = lane.heading;
    } else {
      const p = evalTurn(v.turn, Math.min(1, v.s / v.turn.length));
      v.x = p.x;
      v.z = p.z;
      v.heading = p.heading;
    }
  }

  function spawnOne({ player, view, initial, forceNear }) {
    const lane = rng.pick(net.lanes);
    const kind = pickKind(lane);
    if (!kind) return false;
    const def = TRAFFIC.kinds[kind];
    const s = rng.range(lane.length * 0.1, lane.length * 0.9);
    const x = lane.from.x + lane.ux * s;
    const z = lane.from.z + lane.uz * s;
    const distance = Math.hypot(x - player.x, z - player.z);
    const near = initial ? forceNear : TRAFFIC.spawnMin;
    if (distance < near || distance > TRAFFIC.spawnMax) return false;
    if (distance < TRAFFIC.hiddenMin && inView(view, x, z, player)) return false;
    if (vehicles.some((o) => Math.hypot(o.x - x, o.z - z) < TRAFFIC.spawnClearance)) return false;
    const v = {
      id: `v${nextId}`, num: nextId, kind, def, color: rng.int(0, TRAFFIC.carColors.length - 1),
      cruise: rng.range(def.cruise[0], def.cruise[1]), speed: 0, lateral: 0, lateralTarget: 0, state: 'drive', timer: 0,
      stuck: 0, x, z, heading: lane.heading, px: x, pz: z, ph: lane.heading, turn: null, hw: def.hw, hd: def.hd,
    };
    nextId += 1;
    enterLane(v, lane, s);
    v.speed = Math.min(v.cruise * 0.6, 6);
    place(v);
    v.px = v.x;
    v.pz = v.z;
    v.ph = v.heading;
    vehicles.push(v);
    return true;
  }

  function inView(view, x, z, player) {
    const dx = x - player.x;
    const dz = z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * view.fx + dz * view.fz) / d > Math.cos(TRAFFIC.viewHalfAngle);
  }

  // The speed a vehicle may keep given what is in front of it in its own corridor.
  function obstacleLimit(v, ctx, f) {
    let limit = Infinity;
    const look = TRAFFIC.lookAhead + v.speed * TRAFFIC.lookSpeedGain;
    const r = { x: -f.z, z: f.x };
    const consider = (o) => {
      const dx = o.x - v.x;
      const dz = o.z - v.z;
      const fwd = dx * f.x + dz * f.z;
      if (fwd <= 0 || fwd > look + o.hd) return;
      const lat = dx * r.x + dz * r.z;
      // Close and ahead counts even off to the side, so two vehicles meeting at a junction do not merge.
      // Two vehicles in the same junction: the younger gives way, so they never wait on each other.
      if (o.junction && inJunction(v) && o.num > v.num) return;
      const closeAhead = fwd < v.hd + o.hd + TRAFFIC.corridorMargin && Math.abs(lat) < v.hd + o.hd && (!o.num || o.num < v.num);
      if (!closeAhead && Math.abs(lat) > v.hw + o.hw + TRAFFIC.corridorMargin) return;
      const gap = fwd - v.hd - o.hd;
      const along = o.vx * f.x + o.vz * f.z;
      limit = Math.min(limit, Math.max(0, gap - TRAFFIC.stopGap) * TRAFFIC.gapGain + Math.max(0, along));
    };
    for (const o of vehicles) {
      if (o === v) continue;
      consider({ x: o.x, z: o.z, hw: o.hw, hd: o.hd, vx: Math.sin(o.heading) * o.speed, vz: Math.cos(o.heading) * o.speed });
    }
    consider({ x: ctx.player.x, z: ctx.player.z, hw: PLAYER_HALF_WIDTH, hd: PLAYER_HALF_LENGTH, vx: ctx.player.vx, vz: ctx.player.vz });
    for (const o of ctx.obstacles) consider(o);
    return limit;
  }

  // Wait at the stop line until the junction is free, then take it.
  // Entering the roundabout: give way to anything on the ring at that node. Traffic already on the
  // ring has right of way and never waits, so the ring cannot lock up.
  function ringEntryLimit(v) {
    const node = v.lane.end;
    const toLine = Math.min(v.lane.length - TRAFFIC.stopLine, v.turnAhead.exitS - 1) - v.s;
    const busy = vehicles.some((o) => o !== v && o.lane.edge.kind === 'ring'
      && ((o.lane.end === node && o.lane.length - o.s < TRAFFIC.ringBusyDistance) || (o.lane.start === node && o.s < TRAFFIC.ringBusyDistance)));
    if (!busy) return Infinity;
    return toLine <= 0 ? 0 : Math.sqrt(2 * TRAFFIC.brake * toLine);
  }

  function junctionLimit(v) {
    const node = v.lane.end;
    if (v.lane.edge.kind === 'ring') return Infinity;
    if (node.startsWith(RING_PREFIX)) return ringEntryLimit(v);
    if (owners.get(node) === v.id) return Infinity;
    // The stop line is before the node, and before the curve starts if that is earlier.
    const toLine = Math.min(v.lane.length - TRAFFIC.stopLine, v.turnAhead.exitS - 1) - v.s;
    const stopLimit = toLine <= 0 ? 0 : Math.sqrt(2 * TRAFFIC.brake * toLine);
    if (owners.has(node)) return stopLimit;
    // Nobody holds it yet: a vehicle that is nearer the node will claim it first, so wait early
    // enough to stop. The nearer one is chosen by distance, then by age.
    const mine = v.lane.length - v.s;
    const reach = TRAFFIC.stopLine + TRAFFIC.claimZone + TRAFFIC.yieldMargin;
    for (const o of vehicles) {
      if (o === v || o.piece !== 'lane' || o.lane.end !== node || o.state !== 'drive') continue;
      const theirs = o.lane.length - o.s;
      if (theirs < reach && (theirs < mine || (theirs === mine && o.num < v.num))) return stopLimit;
    }
    if (toLine < TRAFFIC.claimZone) owners.set(node, v.id);
    return Infinity;
  }

  function stepVehicle(v, dt, ctx, events) {
    const f = { x: Math.sin(v.heading), z: Math.cos(v.heading) };
    let vmax = v.cruise * (v.lane.edge.kind === 'market' ? TRAFFIC.marketFactor : 1);
    let braking = TRAFFIC.brake;

    if (v.state === 'bumped') {
      v.timer -= dt;
      vmax = 0;
      braking = TRAFFIC.danfo.pullDecel + 2;
      if (v.timer <= 0) v.state = 'drive';
    } else if (v.state === 'dwell') {
      v.timer -= dt;
      vmax = 0;
      if (v.timer <= 0) {
        v.state = 'drive';
        v.lateralTarget = 0;
        v.stopS = null;
      }
    } else {
      if (v.piece === 'turn') {
        vmax = Math.min(vmax, TRAFFIC.turnSpeed);
      } else {
        const remaining = v.turnAhead.exitS - v.s;
        if (remaining < TRAFFIC.junctionZone) vmax = Math.min(vmax, TRAFFIC.junctionSpeed);
        // Brake early enough to take the coming turn at turn speed.
        const bend = v.turnAhead.angle > 0.5 ? TRAFFIC.turnSpeed : TRAFFIC.junctionSpeed;
        vmax = Math.min(vmax, Math.sqrt(bend * bend + 2 * TRAFFIC.brake * 0.6 * Math.max(0, remaining)));
        const held = junctionLimit(v);
        if (held < vmax) vmax = held;
        if (v.stopS !== null) {
          const toStop = v.stopS - v.s;
          if (toStop < TRAFFIC.danfo.pullInDistance) v.lateralTarget = TRAFFIC.danfo.pullLateral;
          vmax = Math.min(vmax, Math.sqrt(2 * TRAFFIC.danfo.pullDecel * Math.max(0, toStop)));
          braking = TRAFFIC.danfo.pullDecel;
        }
      }
      const limit = obstacleLimit(v, ctx, f);
      if (limit < vmax) {
        vmax = limit;
        if (limit <= 0.05 && v.speed < 0.3) v.stuck += dt;
      } else {
        v.stuck = 0;
      }
    }

    if (v.speed > vmax) v.speed = Math.max(vmax, v.speed - Math.max(braking, TRAFFIC.brake) * dt);
    else v.speed = Math.min(vmax, v.speed + TRAFFIC.accel * dt);

    if (v.lateral !== v.lateralTarget) {
      const step = TRAFFIC.danfo.pullRate * dt;
      v.lateral += Math.max(-step, Math.min(step, v.lateralTarget - v.lateral));
    }

    v.s += v.speed * dt;
    if (v.piece === 'lane') {
      if (v.stopS !== null && v.state === 'drive' && v.s >= v.stopS - 0.4 && v.speed < 0.6) {
        v.state = 'dwell';
        v.timer = rng.range(TRAFFIC.danfo.dwellSeconds[0], TRAFFIC.danfo.dwellSeconds[1]);
        events.push({ type: 'danfoStop', id: v.id, x: v.x, z: v.z });
      } else if (v.s >= v.turnAhead.exitS) {
        v.turn = v.turnAhead;
        v.piece = 'turn';
        v.s -= v.turnAhead.exitS;
        v.lateral = 0;
        v.lateralTarget = 0;
      }
    }
    if (v.piece === 'turn' && v.s >= v.turn.length) {
      const enterS = v.turn.enterS;
      enterLane(v, v.next, enterS + v.s - v.turn.length);
      v.enterS = enterS;
    }
    // The junction is handed on once the vehicle is clear of it.
    if (v.piece === 'lane' && v.s > v.enterS + TRAFFIC.clearDistance && owners.get(v.lane.start) === v.id) owners.delete(v.lane.start);
    place(v);
  }

  return {
    /** Live vehicles, for drawing. */
    get vehicles() { return vehicles; },

    /** Start a shift with a street that already has traffic on it. */
    reset({ player, view }) {
      vehicles = [];
      owners.clear();
      sinceSpawn = 0;
      for (let i = 0; i < 400 && vehicles.length < TRAFFIC.startVehicles; i += 1) {
        spawnOne({ player, view, initial: true, forceNear: 40 });
      }
    },

    /**
     * @param {number} dt seconds
     * @param {{ player: { x: number, z: number, vx: number, vz: number }, view: { fx: number, fz: number },
     *   progress: number, obstacles: Array<{ x: number, z: number, hw: number, hd: number, vx: number, vz: number }> }} ctx
     * @returns {object[]} events
     */
    step(dt, ctx) {
      const events = [];
      for (const [node, id] of owners) if (!vehicles.some((v) => v.id === id)) owners.delete(node);
      for (const v of vehicles) stepVehicle(v, dt, ctx, events);
      // Leave when far away, or a bit closer once out of sight.
      vehicles = vehicles.filter((v) => {
        const d = Math.hypot(v.x - ctx.player.x, v.z - ctx.player.z);
        if (d > TRAFFIC.despawnFar) return false;
        // A vehicle jammed for a long time is quietly removed once nobody is close enough to see it.
        if (v.stuck > TRAFFIC.stuckDespawnSeconds && d > TRAFFIC.stuckDespawnDistance) return false;
        return !(d > TRAFFIC.despawnNear && !inView(ctx.view, v.x, v.z, ctx.player));
      });
      sinceSpawn += dt;
      const want = Math.round(TRAFFIC.startVehicles + (TRAFFIC.endVehicles - TRAFFIC.startVehicles) * ctx.progress);
      if (sinceSpawn >= TRAFFIC.spawnEverySeconds && vehicles.length < Math.min(want, TRAFFIC.maxVehicles)) {
        sinceSpawn = 0;
        for (let i = 0; i < 6; i += 1) {
          if (spawnOne({ player: ctx.player, view: ctx.view, initial: false })) break;
        }
      }
      return events;
    },

    /** The vehicle's wreck-proof body shapes, with how fast each is moving. */
    shapes() {
      return vehicles.map((v) => ({
        id: v.id,
        kind: 'vehicle',
        shape: { type: 'box', x: v.x, z: v.z, hw: v.hw, hd: v.hd, angle: v.heading },
        vx: Math.sin(v.heading) * v.speed,
        vz: Math.cos(v.heading) * v.speed,
      }));
    },

    /** A hit vehicle stops for a moment. */
    bump(id) {
      const v = vehicles.find((o) => o.id === id);
      if (v && v.state !== 'bumped') {
        v.state = 'bumped';
        v.timer = TRAFFIC.bumpedSeconds;
      }
    },
  };
}
