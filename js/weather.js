// One rain event per shift. Pure: it says how hard it rains and how wet the road is at a moment
// of the shift; drawing and sound read these numbers, and the bike reads the grip.

import { BIKE, SHIFT, WEATHER } from './config.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);

/**
 * When the rain starts and stops, in seconds into the shift.
 * @param {ReturnType<typeof import('./rng.js').createRng>} rng
 * @returns {{ start: number, end: number }}
 */
export function planRain(rng) {
  const start = rng.range(WEATHER.startMin, WEATHER.startMax) * SHIFT.seconds;
  return { start, end: start + WEATHER.seconds };
}

/**
 * How hard it rains, 0 to 1, with a smooth ramp in and out.
 * @param {{ start: number, end: number }} plan
 * @param {number} elapsed seconds into the shift
 */
export function rainAt(plan, elapsed) {
  const ramp = WEATHER.rampSeconds;
  return smooth(clamp01(Math.min((elapsed - plan.start) / ramp, (plan.end - elapsed) / ramp)));
}

/**
 * Tyre grip for a wetness from 0 (dry) to 1 (soaked).
 * @param {number} wet
 */
export function gripFor(wet) {
  return BIKE.gripDry + (WEATHER.gripWet - BIKE.gripDry) * clamp01(wet);
}

/**
 * @param {{ rng: ReturnType<typeof import('./rng.js').createRng> }} options
 * @returns {{ plan: { start: number, end: number }, rain: number, wet: number,
 *   step: (dt: number, elapsed: number) => { type: 'rainStart'|'rainEnd' }[] }}
 */
export function createWeather({ rng }) {
  const plan = planRain(rng);
  const weather = { plan, rain: 0, wet: 0 };
  let started = false;
  let ended = false;
  weather.step = (dt, elapsed) => {
    const events = [];
    weather.rain = rainAt(plan, elapsed);
    // The road soaks quickly and dries slowly, so grip stays low a while after the rain stops.
    weather.wet = weather.rain > weather.wet
      ? Math.min(weather.rain, weather.wet + WEATHER.wetRate * dt)
      : Math.max(weather.rain, weather.wet - WEATHER.dryRate * dt);
    if (!started && elapsed >= plan.start) {
      started = true;
      events.push({ type: 'rainStart' });
    }
    if (!ended && elapsed >= plan.end) {
      ended = true;
      events.push({ type: 'rainEnd' });
    }
    return events;
  };
  return weather;
}
