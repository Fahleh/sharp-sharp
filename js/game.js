// The shift state machine: ready, playing, paused, game over. Pure: no three.js, no DOM.
// It owns the bike, health and the clock, and reports what happened as events for the
// renderer, the HUD and the sound to react to.

import { BIKE, SHIFT, SURFACES } from './config.js';
import { applyImpact, createBike, stepBike } from './bike.js';
import { bikeCircles, deepestContact } from './collide.js';

const MAX_PUSH_PASSES = 4;
// Reach of the broad-phase query around the bike: more than its body length.
const QUERY_RADIUS = 3;

/**
 * @param {{ terrain: ReturnType<typeof import('./terrain.js').createTerrain>,
 *   index: ReturnType<typeof import('./collide.js').createStaticIndex>,
 *   spawn: { x: number, z: number, heading: number } }} world
 */
export function createGame({ terrain, index, spawn }) {
  let state = blank();

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
    };
  }

  /** Begin a fresh shift. */
  function start() {
    state = { ...blank(), phase: 'playing' };
  }

  function end(reason, events) {
    state.phase = 'gameover';
    state.over = reason;
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
    for (let pass = 0; pass < MAX_PUSH_PASSES; pass += 1) {
      const circles = bikeCircles(bike, BIKE);
      const hit = deepestContact(circles, index.query(bike.x, bike.z, QUERY_RADIUS));
      if (!hit) return;
      bike.x += hit.nx * hit.depth;
      bike.z += hit.nz * hit.depth;
      const { impact, damage } = applyImpact(bike, hit);
      if (damage > 0 && state.sinceHit >= BIKE.hitCooldownSeconds) {
        state.health = Math.max(0, state.health - damage);
        state.sinceHit = 0;
        events.push({ type: 'crash', impact, damage, health: state.health });
      }
    }
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

  return {
    get state() { return state; },
    start, step, setPaused, recover,
  };
}
