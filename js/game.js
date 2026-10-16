// The shift state machine: ready, playing, paused, game over. Pure: no three.js, no DOM.
// It owns the bike, health, the clock and the orders, and reports what happened as events
// for the renderer, the HUD and the sound to react to.

import { BIKE, COLLIDE, GUIDE, ORDERS, RATING, SHIFT, SURFACES } from './config.js';
import { applyImpact, createBike, stepBike } from './bike.js';
import { bikeCircles, deepestContact } from './collide.js';
import { generateOrder, rateCrash, rateDelivery, settleDelivery, tipAt } from './orders.js';
import { createRng } from './rng.js';
import { routeBetween } from './route.js';

/**
 * @param {{ terrain: ReturnType<typeof import('./terrain.js').createTerrain>,
 *   index: ReturnType<typeof import('./collide.js').createStaticIndex>,
 *   graph: import('./route.js').Graph, vendors: object[], customers: object[],
 *   spawn: { x: number, z: number, heading: number } }} world
 */
export function createGame({ terrain, index, graph, vendors, customers, spawn }) {
  let state = blank();
  let rng = createRng(1);

  function blank() {
    return {
      phase: 'ready',
      elapsed: 0,
      remaining: SHIFT.seconds,
      bike: createBike(spawn),
      health: SHIFT.startHealth,
      surface: 'road',
      sinceHit: Infinity,
      stuckFor: 0,
      canRecover: false,
      over: null,
      earnings: 0,
      deliveries: 0,
      rating: RATING.start,
      order: null,
      lastVendorId: null,
      lastCustomerId: null,
      guide: null,
      sinceGuide: Infinity,
    };
  }

  const target = (order) => (order.stage === 'pickup' ? order.vendor : order.customer);

  function nextOrder(events) {
    const order = generateOrder({
      rng, graph, vendors, customers, from: state.bike, lastVendorId: state.lastVendorId, lastCustomerId: state.lastCustomerId,
    });
    state.order = order && { ...order, stage: 'pickup', clock: 0, late: false };
    state.sinceGuide = Infinity;
    if (state.order) events.push({ type: 'order', order: state.order });
  }

  /**
   * Begin a fresh shift.
   * @param {number} seed seeds every random choice in the shift
   * @returns {object[]} events for the new shift
   */
  function start(seed) {
    rng = createRng(seed);
    state = { ...blank(), phase: 'playing' };
    const events = [];
    nextOrder(events);
    return events;
  }

  function end(reason, events) {
    state.phase = 'gameover';
    state.over = reason;
    // An order still on the bike when the shift ends earns nothing.
    state.order = null;
    state.guide = null;
    events.push({ type: 'gameover', reason });
  }

  /** @param {boolean} paused */
  function setPaused(paused) {
    if (paused && state.phase === 'playing') state.phase = 'paused';
    else if (!paused && state.phase === 'paused') state.phase = 'playing';
  }

  // Push the bike out of anything it overlaps, and react to the strongest hit.
  function resolveCollisions(events) {
    const { bike } = state;
    for (let pass = 0; pass < COLLIDE.pushPasses; pass += 1) {
      const circles = bikeCircles(bike, BIKE);
      const hit = deepestContact(circles, index.query(bike.x, bike.z, COLLIDE.queryRadius));
      if (!hit) return;
      bike.x += hit.nx * hit.depth;
      bike.z += hit.nz * hit.depth;
      const { impact, damage } = applyImpact(bike, hit);
      if (damage > 0 && state.sinceHit >= BIKE.hitCooldownSeconds) {
        state.health = Math.max(0, state.health - damage);
        state.sinceHit = 0;
        state.rating = rateCrash(state.rating);
        if (state.order) state.order.clean = false;
        events.push({ type: 'crash', impact, damage, health: state.health });
      }
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
    const pay = settleDelivery({ base: order.base, elapsed: order.clock, budget: order.budget });
    state.earnings += pay.total;
    state.deliveries += 1;
    state.rating = rateDelivery(state.rating, { late: pay.late, clean: order.clean });
    state.lastVendorId = order.vendor.id;
    state.lastCustomerId = order.customer.id;
    events.push({ type: 'delivery', order, pay, earnings: state.earnings, deliveries: state.deliveries, rating: state.rating });
    nextOrder(events);
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

    const { bike } = state;
    state.surface = terrain.surfaceAt(bike.x, bike.z);
    const surface = SURFACES[state.surface] ?? SURFACES.sand;
    stepBike(bike, input, { dt, grip: BIKE.gripDry, surface });
    resolveCollisions(events);
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
    start, step, setPaused, recover, liveTip,
  };
}
