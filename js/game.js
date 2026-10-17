// The shift state machine: ready, playing, paused, game over. Pure: no three.js, no DOM.
// It owns the bike, health, the clock and the orders, and reports what happened as events
// for the renderer, the HUD and the sound to react to.

import {
  BIKE, COLLIDE, FRAGILE, GUIDE, ORDERS, PEDS, RATING, SHIFT, STREAK, SURFACES,
} from './config.js';
import { applyImpact, createBike, stepBike } from './bike.js';
import { bikeCircles, contact, createNearMissTracker, deepestContact } from './collide.js';
import { createLaneNet } from './lanes.js';
import { createHazardTracker, generateHazards, hazardEffect } from './hazards.js';
import {
  crashConditionLoss, generateOffers, generateOrder, loseCondition, nearMissPayout, rateCrash, rateDelivery, ratePedestrian, settleOrder, tipAt,
} from './orders.js';
import { createPedestrians } from './pedestrians.js';
import { createRng } from './rng.js';
import { routeBetween } from './route.js';
import { createTraffic } from './traffic.js';
import { createWeather, gripFor } from './weather.js';

/**
 * @param {{ terrain: ReturnType<typeof import('./terrain.js').createTerrain>,
 *   index: ReturnType<typeof import('./collide.js').createStaticIndex>,
 *   graph: import('./route.js').Graph, vendors: object[], customers: object[], stops: string[],
 *   spawn: { x: number, z: number, heading: number }, populated?: boolean }} world `stops` are the node ids
 *   where danfos halt; `populated: false` leaves the streets empty, for rule tests
 */
export function createGame({
  terrain, index, graph, vendors, customers, stops, crossings = [], spawn, populated = true,
}) {
  const net = createLaneNet(graph);
  const stopNodes = new Set(stops);
  let state = blank();
  let rng = createRng(1);
  let traffic = createTraffic({ net, rng: createRng(2), stops: stopNodes });
  let peds = createPedestrians({ graph, index, rng: createRng(3), crossings });
  let weather = createWeather({ rng: createRng(4) });
  let hazards = { potholes: [], bumps: [] };
  const hazardTracker = createHazardTracker();
  const nearMiss = createNearMissTracker({
    maxGap: COLLIDE.nearMissGap, minSpeed: COLLIDE.nearMissMinSpeed, cooldownSeconds: COLLIDE.nearMissCooldownSeconds,
  });

  function blank() {
    return {
      phase: 'ready',
      elapsed: 0,
      remaining: SHIFT.seconds,
      bike: createBike(spawn),
      health: SHIFT.startHealth,
      surface: 'road',
      sinceHit: Infinity,
      sinceHorn: Infinity,
      hornHeld: false,
      rain: 0,
      wet: 0,
      stuckFor: 0,
      canRecover: false,
      over: null,
      earnings: 0,
      deliveries: 0,
      streak: 0,
      rating: RATING.start,
      order: null,
      offers: null,
      offerLeft: 0,
      lastVendorId: null,
      lastCustomerId: null,
      guide: null,
      sinceGuide: Infinity,
    };
  }

  const target = (order) => (order.stage === 'pickup' ? order.vendor : order.customer);

  const fresh = (order) => ({ ...order, stage: 'pickup', clock: 0, late: false });

  function takeOrder(order, events) {
    state.order = fresh(order);
    state.offers = null;
    state.sinceGuide = Infinity;
    events.push({ type: 'order', order: state.order });
  }

  // The first order of a shift is simply given; after that the player chooses between two.
  function nextOrder(events, { choose }) {
    const offers = generateOffers({
      rng, graph, vendors, customers, from: state.bike, lastVendorId: state.lastVendorId, lastCustomerId: state.lastCustomerId,
    });
    state.order = null;
    state.guide = null;
    if (offers.length === 0) return;
    if (!choose || offers.length < 2) {
      takeOrder(offers[0], events);
      return;
    }
    state.offers = offers.map(fresh);
    state.offerLeft = ORDERS.offerSeconds;
    events.push({ type: 'offers', offers: state.offers });
  }

  /**
   * Take one of the orders on offer. Does nothing when none are.
   * @param {number} index 0 or 1
   * @returns {object[]} events
   */
  function chooseOffer(index) {
    const events = [];
    const picked = state.phase === 'playing' && state.offers ? state.offers[index] : null;
    if (picked) takeOrder(picked, events);
    return events;
  }

  /**
   * Begin a fresh shift.
   * @param {number} seed seeds every random choice in the shift
   * @returns {object[]} events for the new shift
   */
  function start(seed) {
    rng = createRng(seed);
    // Each part of the world draws from its own stream, so changing one never shifts another.
    traffic = createTraffic({ net, rng: createRng(seed + 1), stops: stopNodes });
    peds = createPedestrians({ graph, index, rng: createRng(seed + 2), crossings });
    weather = createWeather({ rng: createRng(seed + 3) });
    hazards = populated ? generateHazards({ graph, rng: createRng(seed + 4), keepClear: [spawn] }) : { potholes: [], bumps: [] };
    hazardTracker.reset();
    nearMiss.reset();
    state = { ...blank(), phase: 'playing' };
    if (populated) {
      traffic.reset({ player: state.bike, view: viewOf(state.bike) });
      peds.reset({ player: state.bike, view: viewOf(state.bike) });
    }
    const events = [];
    nextOrder(events, { choose: false });
    return events;
  }

  function end(reason, events) {
    state.phase = 'gameover';
    state.over = reason;
    // An order still on the bike when the shift ends earns nothing.
    state.order = null;
    state.offers = null;
    state.guide = null;
    events.push({ type: 'gameover', reason });
  }

  /** @param {boolean} paused */
  function setPaused(paused) {
    if (paused && state.phase === 'playing') state.phase = 'paused';
    else if (!paused && state.phase === 'paused') state.phase = 'playing';
  }

  const viewOf = (bike) => ({ fx: Math.sin(bike.heading), fz: Math.cos(bike.heading) });

  // Push the bike out of anything it overlaps, and react to the strongest hit. Vehicles count
  // as obstacles that are themselves moving: only the closing speed hurts.
  function resolveCollisions(events, vehicles) {
    const { bike } = state;
    const dynamic = new Map(vehicles.map((v) => [v.shape, v]));
    for (let pass = 0; pass < COLLIDE.pushPasses; pass += 1) {
      const circles = bikeCircles(bike, BIKE);
      const solids = index.query(bike.x, bike.z, COLLIDE.queryRadius).concat(vehicles.map((v) => v.shape));
      const hit = deepestContact(circles, solids);
      if (!hit) return;
      bike.x += hit.nx * hit.depth;
      bike.z += hit.nz * hit.depth;
      const other = dynamic.get(hit.solid);
      const { impact, damage } = applyImpact(bike, hit, other ?? undefined);
      if (other && impact > 0) traffic.bump(other.id);
      if (damage > 0 && state.sinceHit >= BIKE.hitCooldownSeconds) {
        state.health = Math.max(0, state.health - damage);
        state.sinceHit = 0;
        state.rating = rateCrash(state.rating);
        if (state.order) state.order.clean = false;
        spoilParcel(crashConditionLoss(damage));
        if (damage >= STREAK.wreckDamage) breakStreak(events);
        events.push({ type: 'crash', impact, damage, health: state.health, with: other ? other.id : null });
      }
    }
  }

  function breakStreak(events) {
    if (state.streak === 0) return;
    events.push({ type: 'streakLost', streak: state.streak });
    state.streak = 0;
  }

  // A fragile parcel only suffers once it is in the box, after pickup.
  function spoilParcel(loss) {
    const { order } = state;
    if (order && order.fragile && order.stage === 'delivery') order.condition = loseCondition(order.condition, loss);
  }

  // Potholes and speed bumps slow the bike, shake the load and tell the renderer to jolt.
  function checkHazards(events) {
    const { bike } = state;
    const hits = hazardTracker.update({ time: state.elapsed, circles: bikeCircles(bike, BIKE), hazards });
    for (const hit of hits) {
      const effect = hazardEffect(hit.kind, bike.speed);
      if (effect.speedFactor === 1) continue;
      bike.speed *= effect.speedFactor;
      spoilParcel(effect.conditionLoss);
      events.push({ type: 'hazard', ...hit, ...effect });
    }
  }

  // Riding into a person: they fall and get up; it costs money and rating, and slows the bike.
  function checkPedHits(events) {
    const { bike } = state;
    const circles = bikeCircles(bike, BIKE);
    for (const ped of peds.shapes()) {
      if (ped.down) continue;
      const shape = { ...ped.shape, r: PEDS.hitRadius };
      if (!circles.some((c) => contact(c, shape)) || !peds.hit(ped.id)) continue;
      const penalty = Math.min(state.earnings, PEDS.hitPenalty);
      state.earnings -= penalty;
      state.rating = ratePedestrian(state.rating);
      if (state.order) state.order.clean = false;
      spoilParcel(FRAGILE.pedestrianLoss);
      bike.speed *= PEDS.hitSpeedFactor;
      events.push({ type: 'pedhit', id: ped.id, penalty, x: shape.x, z: shape.z });
    }
  }

  // A close pass at speed pays a small bonus, a few times per order.
  function checkNearMisses(events, vehicles) {
    const { bike } = state;
    const found = nearMiss.update({
      time: state.elapsed,
      circles: bikeCircles(bike, BIKE),
      velocity: { x: Math.sin(bike.course) * bike.speed, z: Math.cos(bike.course) * bike.speed },
      speed: bike.speed,
      others: vehicles,
    });
    for (const hit of found) {
      let payout = { paid: false, bonus: 0 };
      if (state.order) {
        payout = nearMissPayout(state.order.nearMisses);
        if (payout.paid) {
          state.order.nearMisses += 1;
          state.earnings += payout.bonus;
        }
      }
      events.push({ type: 'nearmiss', id: hit.id, gap: hit.gap, ...payout });
    }
  }

  // Pickup and drop-off: ride into the marker's circle, no stopping needed.
  function updateOrder(dt, events) {
    const order = state.order;
    if (!order) return;
    const spot = target(order);
    const radius = order.stage === 'pickup' ? ORDERS.pickupRadius : ORDERS.dropRadius;
    if (order.stage === 'delivery') {
      order.clock += dt;
      if (!order.late && order.clock > order.budget) {
        order.late = true;
        events.push({ type: 'late', order });
      }
    }
    if (Math.hypot(state.bike.x - spot.x, state.bike.z - spot.z) > radius) return;

    if (order.stage === 'pickup') {
      order.stage = 'delivery';
      order.clock = 0;
      state.sinceGuide = Infinity;
      events.push({ type: 'pickup', order });
      return;
    }
    const pay = settleOrder({
      base: order.base, elapsed: order.clock, budget: order.budget, fragile: order.fragile, condition: order.condition, streak: state.streak,
    });
    // A spoiled parcel neither extends the streak nor breaks it.
    if (pay.late) breakStreak(events);
    else if (!pay.spoiled) state.streak += 1;
    state.earnings += pay.total;
    state.deliveries += 1;
    state.rating = rateDelivery(state.rating, { late: pay.late, clean: order.clean });
    state.lastVendorId = order.vendor.id;
    state.lastCustomerId = order.customer.id;
    events.push({ type: 'delivery', order, pay, earnings: state.earnings, deliveries: state.deliveries, rating: state.rating });
    nextOrder(events, { choose: true });
  }

  // Wait too long and the first offer is taken for you.
  function updateOffers(dt, events) {
    if (!state.offers) return;
    state.offerLeft -= dt;
    if (state.offerLeft <= 0) takeOrder(state.offers[0], events);
  }

  // Keep the guidance route fresh: the minimap draws it and the order card reads its length.
  function updateGuide(dt) {
    state.sinceGuide += dt;
    if (!state.order) {
      state.guide = null;
      return;
    }
    if (state.sinceGuide < GUIDE.routeEvery) return;
    state.sinceGuide = 0;
    state.guide = routeBetween(graph, state.bike, target(state.order));
  }

  /**
   * Advance the shift by one fixed step.
   * @param {number} dt seconds
   * @param {{ throttle: number, brake: number, steer: number }} input
   * @returns {object[]} events from this step
   */
  function step(dt, input) {
    const events = [];
    if (state.phase !== 'playing') return events;
    state.elapsed += dt;
    state.remaining = Math.max(0, SHIFT.seconds - state.elapsed);
    state.sinceHit += dt;
    state.sinceHorn += dt;

    const { bike } = state;
    // The horn sounds once per press, not once per frame.
    if (input.horn && !state.hornHeld && state.sinceHorn >= BIKE.hornCooldownSeconds) {
      state.sinceHorn = 0;
      events.push({ type: 'honk', x: bike.x, z: bike.z });
      if (populated) events.push(...peds.startleAround(bike, PEDS.hornRadius));
    }
    state.hornHeld = Boolean(input.horn);
    state.surface = terrain.surfaceAt(bike.x, bike.z);
    const surface = SURFACES[state.surface] ?? SURFACES.sand;
    events.push(...weather.step(dt, state.elapsed));
    state.rain = weather.rain;
    state.wet = weather.wet;
    stepBike(bike, input, { dt, grip: gripFor(weather.wet), surface });
    const velocity = { vx: Math.sin(bike.course) * bike.speed, vz: Math.cos(bike.course) * bike.speed };
    const progress = state.elapsed / SHIFT.seconds;
    if (populated) {
      events.push(...peds.step(dt, {
        player: { x: bike.x, z: bike.z, speed: bike.speed }, view: viewOf(bike), progress, vehicles: traffic.vehicles,
      }));
      events.push(...traffic.step(dt, {
        player: { x: bike.x, z: bike.z, ...velocity }, view: viewOf(bike), progress, obstacles: peds.obstacles(),
      }));
    }
    const vehicles = traffic.shapes();
    resolveCollisions(events, vehicles);
    checkPedHits(events);
    checkHazards(events);
    checkNearMisses(events, vehicles.concat(peds.shapes().filter((p) => !p.down)));
    updateOffers(dt, events);
    updateOrder(dt, events);
    updateGuide(dt);

    // Stuck means trying to go and not moving: only then is the recover button offered.
    const trying = input.throttle > 0 && input.brake === 0;
    state.stuckFor = trying && bike.speed < SHIFT.stuckSpeed ? state.stuckFor + dt : 0;
    state.canRecover = state.stuckFor >= SHIFT.stuckSeconds;

    if (state.health <= 0) end('wrecked', events);
    else if (state.remaining <= 0) end('time', events);
    return events;
  }

  /** Put the bike back on the nearest road, facing along it. */
  function recover() {
    if (state.phase !== 'playing') return;
    const { bike } = state;
    const spot = terrain.nearestRoadPoint(bike.x, bike.z, bike.heading);
    Object.assign(bike, createBike(spot));
    state.stuckFor = 0;
    state.canRecover = false;
  }

  /**
   * What the live order is worth right now, for the order card.
   * @returns {{ tip: number }|null}
   */
  function liveTip() {
    const order = state.order;
    if (!order || order.stage !== 'delivery') return null;
    return { tip: order.late ? 0 : tipAt({ base: order.base, elapsed: order.clock, budget: order.budget }) };
  }

  return {
    get state() { return state; },
    /** Live traffic, for drawing. */
    get traffic() { return traffic; },
    /** Live pedestrians, for drawing. */
    get peds() { return peds; },
    /** Potholes and speed bumps of this shift, for drawing. */
    get hazards() { return hazards; },
    start, step, setPaused, recover, liveTip, chooseOffer,
  };
}
