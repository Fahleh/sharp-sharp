// Pedestrian simulation: people walking the sidewalks, crossing only at marked crossings, waiting
// at the kerb for a fast bike, and stumbling when it hits them. Pure: no three.js, no DOM.

import { PEDS } from './config.js';
import { shapesOverlap } from './collide.js';
import { pointOnEdge } from './map.js';

const TAU = Math.PI * 2;

/**
 * @param {{ graph: import('./route.js').Graph, index: ReturnType<typeof import('./collide.js').createStaticIndex>,
 *   rng: ReturnType<typeof import('./rng.js').createRng>,
 *   crossings: Array<{ a: string, b: string, s: number, half: number }> }} world
 */
export function createPedestrians({ graph, index, rng, crossings }) {
  /** @type {object[]} */
  let peds = [];
  let nextId = 1;
  let sinceSpawn = 0;
  // The market street has its own standing crowd; everywhere else people turn up at random.
  const walkable = graph.edges.filter((e) => e.kind !== 'ring' && e.kind !== 'market');
  const crossingsOn = new Map();
  for (const c of crossings) {
    const key = `${c.a}-${c.b}`;
    if (!crossingsOn.has(key)) crossingsOn.set(key, []);
    crossingsOn.get(key).push(c);
  }
  const market = graph.edges.find((e) => e.kind === 'market');
  const marketCentre = market ? {
    x: (graph.nodes.get(market.a).x + graph.nodes.get(market.b).x) / 2,
    z: (graph.nodes.get(market.a).z + graph.nodes.get(market.b).z) / 2,
  } : null;

  const keyOf = (edge) => `${edge.a}-${edge.b}`;

  // The market crowd appears when the player comes within range, from beyond sight, and stays
  // until they go well away again.
  let crowdOut = true;
  function fillCrowd(player, view) {
    if (!marketCentre) return;
    const d = Math.hypot(player.x - marketCentre.x, player.z - marketCentre.z);
    if (d > PEDS.marketFill + PEDS.marketHysteresis) crowdOut = true;
    if (!crowdOut || d > PEDS.marketFill) return;
    crowdOut = false;
    const have = peds.filter((p) => p.keep).length;
    for (let i = 0, added = have; i < 100 && added < PEDS.marketCrowd; i += 1) {
      if (spawnOne({ player, view, initial: true, crowd: true })) added += 1;
    }
  }

  const pickEdge = () => rng.pick(walkable);

  const inView = (view, player, x, z) => {
    const dx = x - player.x;
    const dz = z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * view.fx + dz * view.fz) / d > Math.cos(PEDS.viewHalfAngle);
  };

  // The market street's pavements are full of stalls, so people walk in the road there.
  const sidewalkOffset = (edge, sign) => (edge.kind === 'market'
    ? sign * rng.range(PEDS.marketInset, edge.hw - PEDS.marketInset)
    : sign * (edge.hw + rng.range(PEDS.lateralMin, PEDS.lateralMax)));

  function place(p) {
    p.px = p.x;
    p.pz = p.z;
    p.ph = p.heading;
    if (p.link) {
      const { link } = p;
      p.x = link.x0 + (link.x1 - link.x0) * link.t;
      p.z = link.z0 + (link.z1 - link.z0) * link.t;
      return;
    }
    const t = p.s / p.edge.length;
    const spot = pointOnEdge(p.edge, Math.max(0, Math.min(1, t)), p.lateral);
    p.x = spot.x;
    p.z = spot.z;
  }

  function spawnOne({ player, view, initial, crowd = false }) {
    const edge = crowd ? market : pickEdge();
    const s = rng.range(reachAt(edge.a, edge) + 0.5, edge.length - reachAt(edge.b, edge) - 0.5);
    const sign = rng.chance(0.5) ? 1 : -1;
    const lateral = sidewalkOffset(edge, sign);
    const spot = pointOnEdge(edge, s / edge.length, lateral);
    const distance = Math.hypot(spot.x - player.x, spot.z - player.z);
    if (!crowd) {
      if (distance < (initial ? 12 : PEDS.spawnMin) || distance > PEDS.spawnMax) return false;
      if (distance < PEDS.hiddenMin && inView(view, player, spot.x, spot.z)) return false;
    }
    if (peds.some((o) => Math.hypot(o.x - spot.x, o.z - spot.z) < PEDS.spawnClearance)) return false;
    const p = {
      keep: crowd,
      id: `p${nextId}`, num: nextId, edge, key: keyOf(edge), s, lateral, dir: rng.chance(0.5) ? 1 : -1,
      speed: rng.range(PEDS.walkSpeed[0], PEDS.walkSpeed[1]), state: 'walk', timer: 0, link: null, turnBack: 0,
      crossTarget: 0, lateralTarget: 0, decided: null, immune: 0, cooldown: 0, phase: rng.range(0, TAU),
      shirt: rng.int(0, PEDS.shirts.length - 1), trousers: rng.int(0, PEDS.trousers.length - 1), skin: rng.int(0, PEDS.skins.length - 1),
      size: rng.range(PEDS.sizes[0], PEDS.sizes[1]), x: spot.x, z: spot.z, heading: 0, px: spot.x, pz: spot.z, ph: 0,
    };
    nextId += 1;
    p.heading = headingOf(p);
    place(p);
    p.px = p.x;
    p.pz = p.z;
    p.ph = p.heading;
    peds.push(p);
    return true;
  }

  // Along the road in the direction of walking.
  function headingOf(p) {
    const a = graph.nodes.get(p.edge.a);
    const b = graph.nodes.get(p.edge.b);
    return Math.atan2((b.x - a.x) * p.dir, (b.z - a.z) * p.dir);
  }

  // Walkers stay clear of the road that crosses at each end: they turn the corner there instead.
  function reachAt(node, edge) {
    const others = graph.links.get(node).map((l) => l.edge).filter((e) => e !== edge && e.kind !== 'ring');
    return (others.length > 0 ? Math.max(...others.map((e) => e.hw)) : 0) + PEDS.cornerPocket;
  }

  // At the end of an edge, turn onto a road that meets it at an angle, on whichever side is
  // nearest; never straight on, which would mean crossing the road between the two ends.
  function turnCorner(p) {
    if (p.keep) {
      // The market crowd stays in the market.
      p.dir = -p.dir;
      return;
    }
    const node = p.dir > 0 ? p.edge.b : p.edge.a;
    const here = graph.nodes.get(p.edge.a === node ? p.edge.b : p.edge.a);
    const at = graph.nodes.get(node);
    const ux = at.x - here.x;
    const uz = at.z - here.z;
    const heading = Math.hypot(ux, uz) || 1;
    const options = graph.links.get(node).map((l) => l.edge).filter((e) => {
      if (e === p.edge || e.kind === 'ring') return false;
      const far = graph.nodes.get(e.a === node ? e.b : e.a);
      const dot = ((far.x - at.x) * ux + (far.z - at.z) * uz) / ((Math.hypot(far.x - at.x, far.z - at.z) || 1) * heading);
      return Math.abs(dot) < PEDS.turnDotMax;
    });
    if (options.length === 0) {
      p.dir = -p.dir;
      return;
    }
    const next = rng.pick(options);
    const s2 = next.a === node ? reachAt(node, next) : next.length - reachAt(node, next);
    let best = null;
    for (const sign of [1, -1]) {
      const lateral = sidewalkOffset(next, sign);
      const spot = pointOnEdge(next, s2 / next.length, lateral);
      const d = Math.hypot(spot.x - p.x, spot.z - p.z);
      if (!best || d < best.d) best = { lateral, spot, d };
    }
    p.link = { x0: p.x, z0: p.z, x1: best.spot.x, z1: best.spot.z, t: 0, length: Math.max(0.5, best.d) };
    p.edge = next;
    p.key = keyOf(next);
    p.dir = next.a === node ? 1 : -1;
    p.s = s2;
    p.lateral = best.lateral;
    p.decided = null;
  }

  function blocked(p) {
    const ahead = pointOnEdge(p.edge, Math.max(0, Math.min(1, (p.s + p.dir * PEDS.probe) / p.edge.length)), p.lateral);
    const body = { type: 'circle', x: ahead.x, z: ahead.z, r: PEDS.radius };
    return index.query(ahead.x, ahead.z, PEDS.radius).some((solid) => shapesOverlap(body, solid));
  }

  function safeToCross(p, ctx) {
    const player = ctx.player;
    if (Math.hypot(player.x - p.x, player.z - p.z) < PEDS.waitDistance && player.speed > PEDS.waitSpeed) return false;
    return !ctx.vehicles.some((v) => v.speed > 0.8 && Math.hypot(v.x - p.x, v.z - p.z) < PEDS.vehicleClear);
  }

  function step(p, dt, ctx, events) {
    p.px = p.x;
    p.pz = p.z;
    p.ph = p.heading;
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.immune = Math.max(0, p.immune - dt);
    p.turnBack = Math.max(0, p.turnBack - dt);

    if (p.state === 'stumble' || p.state === 'startled') {
      p.timer -= dt;
      if (p.state === 'startled') p.lateral += Math.max(-PEDS.stepBackSpeed * dt, Math.min(PEDS.stepBackSpeed * dt, p.lateralTarget - p.lateral));
      if (p.timer <= 0) p.state = 'walk';
      return;
    }

    // A fast pass close by makes them step back from the road.
    const dxp = ctx.player.x - p.x;
    const dzp = ctx.player.z - p.z;
    if (p.cooldown <= 0 && ctx.player.speed > PEDS.startleSpeed && Math.hypot(dxp, dzp) < PEDS.startleDistance) {
      startle(p, events);
      return;
    }

    if (p.link) {
      p.link.t += (p.speed * dt) / p.link.length;
      p.phase += p.speed * dt * PEDS.look.stepRate;
      p.heading = Math.atan2(p.link.x1 - p.link.x0, p.link.z1 - p.link.z0);
      if (p.link.t >= 1) p.link = null;
      return;
    }

    if (p.state === 'wait') {
      if (safeToCross(p, ctx)) p.state = 'cross';
      return;
    }
    if (p.state === 'cross') {
      const delta = p.crossTarget - p.lateral;
      const move = PEDS.crossSpeed * dt;
      // Facing across the road, along the edge's right-hand normal one way or the other.
      const normal = pointOnEdge(p.edge, p.s / p.edge.length, 0);
      p.heading = Math.atan2(normal.nx * Math.sign(delta), normal.nz * Math.sign(delta));
      p.phase += PEDS.crossSpeed * dt * PEDS.look.stepRate;
      if (Math.abs(delta) <= move) {
        p.lateral = p.crossTarget;
        p.state = 'walk';
        p.decided = p.s;
      } else {
        p.lateral += Math.sign(delta) * move;
      }
      return;
    }

    // Walking: maybe use a crossing we are passing.
    const crossingList = crossingsOn.get(p.key);
    if (crossingList) {
      for (const c of crossingList) {
        if (Math.abs(p.s - c.s) < PEDS.crossBand && p.decided !== c) {
          p.decided = c;
          if (rng.chance(PEDS.crossChance)) {
            p.s = c.s;
            p.crossTarget = -p.lateral;
            p.state = 'wait';
            return;
          }
        }
      }
    }

    if (p.turnBack <= 0 && blocked(p)) {
      p.dir = -p.dir;
      p.turnBack = PEDS.turnBackSeconds;
      // Try a different strip of pavement on the way back.
      p.lateral = sidewalkOffset(p.edge, Math.sign(p.lateral) || 1);
      return;
    }
    p.s += p.dir * p.speed * dt;
    p.phase += p.speed * dt * PEDS.look.stepRate;
    p.heading = headingOf(p);
    const low = reachAt(p.edge.a, p.edge);
    const high = p.edge.length - reachAt(p.edge.b, p.edge);
    if (p.s <= low || p.s >= high) {
      p.s = Math.max(low, Math.min(high, p.s));
      place(p);
      p.px = p.x;
      p.pz = p.z;
      turnCorner(p);
    }
  }

  function startle(p, events) {
    p.state = 'startled';
    p.timer = PEDS.startleSeconds;
    p.cooldown = PEDS.startleSeconds * 3;
    // Step away from the road: further out along the same side.
    const limit = p.edge.kind === 'market' ? p.edge.hw : p.edge.hw + PEDS.lateralMax + PEDS.startleStep;
    p.lateralTarget = Math.sign(p.lateral) * Math.min(limit, Math.abs(p.lateral) + PEDS.startleStep);
    events.push({ type: 'pedStartled', id: p.id, x: p.x, z: p.z });
  }

  return {
    /** Live people, for drawing. */
    get peds() { return peds; },

    reset({ player, view }) {
      peds = [];
      sinceSpawn = 0;
      crowdOut = true;
      fillCrowd(player, view);
      for (let i = 0; i < 500 && peds.length < PEDS.startPeds; i += 1) spawnOne({ player, view, initial: true });
    },

    /**
     * @param {number} dt seconds
     * @param {{ player: { x: number, z: number, speed: number }, view: { fx: number, fz: number }, progress: number,
     *   vehicles: Array<{ x: number, z: number, speed: number }> }} ctx
     * @returns {object[]} events
     */
    step(dt, ctx) {
      const events = [];
      for (const p of peds) {
        step(p, dt, ctx, events);
        place(p);
      }
      peds = peds.filter((p) => {
        const d = Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z);
        if (p.keep) return d < PEDS.crowdDespawn;
        if (d > PEDS.despawnFar) return false;
        return !(d > PEDS.despawnNear && !inView(ctx.view, ctx.player, p.x, p.z));
      });
      fillCrowd(ctx.player, ctx.view);
      sinceSpawn += dt;
      const crowd = peds.filter((p) => p.keep).length;
      const want = Math.min(PEDS.maxPeds, Math.round(PEDS.startPeds + (PEDS.endPeds - PEDS.startPeds) * ctx.progress) + crowd);
      if (sinceSpawn >= PEDS.spawnEverySeconds && peds.length < want) {
        sinceSpawn = 0;
        for (let i = 0; i < 8; i += 1) if (spawnOne({ player: ctx.player, view: ctx.view, initial: false })) break;
      }
      return events;
    },

    /** People in a vehicle's way: those out on a crossing, and anyone walking the market street. */
    obstacles() {
      return peds.filter((p) => p.state === 'cross' || p.edge.kind === 'market').map((p) => ({ x: p.x, z: p.z, hw: PEDS.radius, hd: PEDS.radius, vx: 0, vz: 0 }));
    },

    /** Round bodies, for the bike hitting them and for near misses. */
    shapes() {
      return peds.map((p) => ({
        id: p.id, kind: 'pedestrian',
        shape: { type: 'circle', x: p.x, z: p.z, r: PEDS.hitRadius },
        vx: p.link || p.state !== 'walk' ? 0 : Math.sin(p.heading) * p.speed,
        vz: p.link || p.state !== 'walk' ? 0 : Math.cos(p.heading) * p.speed,
        down: p.state === 'stumble' || p.immune > 0,
      }));
    },

    /** The bike hit this person: they fall, then get up and carry on. */
    hit(id) {
      const p = peds.find((o) => o.id === id);
      if (!p || p.state === 'stumble' || p.immune > 0) return false;
      p.state = 'stumble';
      p.timer = PEDS.stumbleSeconds;
      // Once up they are left alone for a while, even if the bike is still on top of them.
      p.immune = PEDS.stumbleSeconds + PEDS.immuneSeconds;
      p.link = null;
      return true;
    },

    /** A horn blast: everyone close steps back from the road. */
    startleAround({ x, z }, radius) {
      const events = [];
      for (const p of peds) {
        if (p.state === 'stumble' || p.state === 'startled') continue;
        if (Math.hypot(p.x - x, p.z - z) < radius) startle(p, events);
      }
      return events;
    },
  };
}
