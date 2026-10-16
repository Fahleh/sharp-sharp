// Kinematic bicycle model on the ground plane. Pure: no three.js, no DOM.
// Heading 0 faces +z and forward is (sin h, cos h). Steer > 0 turns right, which lowers the heading.
// `course` is the direction the bike is actually travelling; it chases the heading, and
// less grip lets it lag, which is the small slide in rain.

import { BIKE } from './config.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
function angleDiff(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * @typedef {{ x: number, z: number, heading: number, course: number, speed: number,
 *   steer: number, steerAngle: number, lean: number }} BikeState
 */

/**
 * @param {{ x: number, z: number, heading: number }} start
 * @returns {BikeState}
 */
export function createBike({ x, z, heading }) {
  return { x, z, heading, course: heading, speed: 0, steer: 0, steerAngle: 0, lean: 0 };
}

/**
 * Largest steering angle (radians) the tyres can hold at this speed.
 * @param {number} speed m/s
 * @param {number} grip 1 on dry road, lower in rain
 * @returns {number}
 */
export function maxSteerAngle(speed, grip) {
  const mechanical = Math.tan((BIKE.maxSteerDeg * Math.PI) / 180);
  const held = (BIKE.lateralAccel * grip * BIKE.wheelbase) / Math.max(speed * speed, 1e-6);
  return Math.atan(Math.min(mechanical, held));
}

/**
 * Advance the bike by `dt` seconds. Mutates `bike`.
 * @param {BikeState} bike
 * @param {{ throttle: number, brake: number, steer: number }} input throttle and brake 0..1, steer -1..1
 * @param {{ dt: number, grip: number, surface: { speedFactor: number, overCapRate: number } }} env
 *   `surface` is the ground under the bike (see SURFACES)
 */
export function stepBike(bike, input, { dt, grip, surface }) {
  // Steering is smoothed so a key press is not a snap.
  const target = clamp(input.steer, -1, 1);
  const rate = target === 0 ? BIKE.steerFallRate : BIKE.steerRiseRate;
  bike.steer += clamp(target - bike.steer, -rate * dt, rate * dt);

  // Rougher ground lowers the speed the engine can hold, so throttle fades out at that cap.
  const cap = BIKE.topSpeed * surface.speedFactor;
  let accel = 0;
  if (input.throttle > 0) {
    const ratio = bike.speed / cap;
    accel += BIKE.accel * input.throttle * Math.max(0, 1 - ratio * ratio);
  } else if (bike.speed > 0) {
    accel -= BIKE.coastDrag * bike.speed + BIKE.rolling;
  }
  // Wet tyres stop later: braking scales with grip.
  accel -= BIKE.brake * grip * clamp(input.brake, 0, 1);

  let speed = bike.speed + accel * dt;
  if (speed > cap) speed = Math.max(cap, speed - surface.overCapRate * (speed - cap) * dt - BIKE.rolling * dt);
  bike.speed = clamp(speed, 0, BIKE.topSpeed);

  bike.steerAngle = bike.steer * maxSteerAngle(bike.speed, grip);
  const yawRate = (bike.speed / BIKE.wheelbase) * Math.tan(bike.steerAngle);
  bike.heading += -yawRate * dt;

  // The travel direction swings toward the heading; the gap is the slip angle.
  const align = BIKE.alignRate * grip * grip;
  bike.course += angleDiff(bike.course, bike.heading) * (1 - Math.exp(-align * dt));
  const slip = Math.abs(angleDiff(bike.course, bike.heading));
  bike.speed = Math.max(0, bike.speed * (1 - BIKE.slipScrub * slip * dt));

  bike.x += Math.sin(bike.course) * bike.speed * dt;
  bike.z += Math.cos(bike.course) * bike.speed * dt;

  // Lean into the turn: sideways acceleration is speed times yaw rate. Right turn leans right.
  const leanTarget = clamp(yawRate * bike.speed * BIKE.leanGain, -BIKE.leanMax, BIKE.leanMax);
  bike.lean += (leanTarget - bike.lean) * (1 - Math.exp(-BIKE.leanRate * dt));
}

/**
 * React to hitting something. `normal` points from the obstacle toward the bike. Mutates `bike`.
 * Positions are pushed out by the caller; this only changes velocity and heading.
 * @param {BikeState} bike
 * @param {{ nx: number, nz: number }} normal unit vector
 * @returns {{ impact: number, damage: number }} closing speed in m/s and health lost
 */
export function applyImpact(bike, { nx, nz }) {
  const vx = Math.sin(bike.course) * bike.speed;
  const vz = Math.cos(bike.course) * bike.speed;
  const closing = -(vx * nx + vz * nz);
  if (closing <= 0) return { impact: 0, damage: 0 };

  // Keep most of the speed along the wall, and bounce a little off it.
  const tx = vx + closing * nx;
  const tz = vz + closing * nz;
  const outX = tx * BIKE.tangentKeep + nx * closing * BIKE.restitution;
  const outZ = tz * BIKE.tangentKeep + nz * closing * BIKE.restitution;
  bike.speed = Math.hypot(outX, outZ);
  if (bike.speed > 1e-6) {
    bike.course = Math.atan2(outX, outZ);
    // Capped so a head-on hit nudges the nose aside instead of spinning the bike around.
    bike.heading += clamp(angleDiff(bike.heading, bike.course), -BIKE.maxDeflect, BIKE.maxDeflect) * BIKE.deflect;
  }
  return { impact: closing, damage: impactDamage(closing) };
}

/**
 * @param {number} impact closing speed in m/s
 * @returns {number} whole health points: 0 for a scrape, 10 to 35 for a hard hit
 */
export function impactDamage(impact) {
  if (impact < BIKE.minDamageImpact) return 0;
  const span = BIKE.damageFullImpact - BIKE.minDamageImpact;
  const k = clamp((impact - BIKE.minDamageImpact) / span, 0, 1);
  return Math.round(BIKE.damageMin + (BIKE.damageMax - BIKE.damageMin) * k);
}
