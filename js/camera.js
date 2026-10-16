// Chase camera: behind and above the bike, critically damped so it follows without jitter
// at any frame rate. Pulls in when a building would hide the bike, and never clips a wall.

import { Vector3 } from 'three';
import { BIKE, CHASE } from './config.js';
import { firstBoxHit } from './collide.js';

// Unity-style critically damped smoothing: stable for any step size. `velocity` is `{ value }`.
function smoothDamp(current, target, velocity, smoothTime, dt) {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity.value + omega * change) * dt;
  velocity.value = (velocity.value - omega * temp) * decay;
  return target + (change + temp) * decay;
}

const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * @param {{ camera: import('three').PerspectiveCamera,
 *   blockers: ReturnType<typeof import('./collide.js').createStaticIndex>,
 *   reducedMotion: () => boolean }} input `blockers` holds only buildings tall enough to hide the bike
 */
export function createChaseCamera({ camera, blockers, reducedMotion }) {
  const pos = new Vector3();
  const look = new Vector3();
  const head = new Vector3();
  const goal = new Vector3();
  const vel = { x: { value: 0 }, y: { value: 0 }, z: { value: 0 }, yaw: { value: 0 }, fov: { value: 0 }, side: { value: 0 } };
  let yaw = 0;
  let side = 0;
  let fov = CHASE.fovBase;

  const baseFov = () => (camera.aspect < CHASE.portraitAspect ? CHASE.fovPortrait : CHASE.fovBase);

  // Where the camera wants to sit for a given heading, before any smoothing.
  function desired(bike, out) {
    out.set(bike.x - Math.sin(yaw) * CHASE.distance, bike.y + CHASE.height, bike.z - Math.cos(yaw) * CHASE.distance);
    return out;
  }

  // Pull a camera position toward the bike's head until no building is between them.
  function pullIn(bike, p) {
    head.set(bike.x, bike.y + CHASE.lookHeight, bike.z);
    const length = Math.hypot(p.x - head.x, p.z - head.z);
    if (length < 1e-6) return;
    const hit = firstBoxHit(blockers, { ax: head.x, az: head.z, bx: p.x, bz: p.z });
    if (hit >= 1) return;
    const keep = Math.max(CHASE.minDistance / length, hit - CHASE.wallMargin / length);
    p.x = head.x + (p.x - head.x) * keep;
    p.z = head.z + (p.z - head.z) * keep;
  }

  /**
   * Jump straight to the right place: at the start of a shift and after a recover.
   * @param {{ x: number, y: number, z: number, heading: number, speed: number, steer: number }} bike
   */
  function reset(bike) {
    yaw = bike.heading;
    side = 0;
    fov = baseFov();
    Object.values(vel).forEach((v) => { v.value = 0; });
    desired(bike, pos);
    pullIn(bike, pos);
    apply(bike);
  }

  function apply(bike) {
    look.set(
      bike.x + Math.sin(yaw) * CHASE.lookAhead - Math.cos(yaw) * side,
      bike.y + CHASE.lookHeight,
      bike.z + Math.cos(yaw) * CHASE.lookAhead + Math.sin(yaw) * side,
    );
    camera.position.copy(pos);
    camera.lookAt(look);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  /**
   * @param {{ x: number, y: number, z: number, heading: number, speed: number, steer: number }} bike drawn state
   * @param {number} dt seconds, any size
   */
  function update(bike, dt) {
    const calm = reducedMotion();
    const smooth = calm ? CHASE.reducedSmoothTime : CHASE.smoothTime;
    if (bike.speed > CHASE.yawMinSpeed) {
      const gap = smoothDamp(angleDelta(yaw, bike.heading), 0, vel.yaw, calm ? CHASE.reducedSmoothTime : CHASE.yawSmoothTime, dt);
      yaw = bike.heading - gap;
    }
    desired(bike, goal);
    pullIn(bike, goal);
    pos.set(
      smoothDamp(pos.x, goal.x, vel.x, smooth, dt),
      smoothDamp(pos.y, goal.y, vel.y, smooth, dt),
      smoothDamp(pos.z, goal.z, vel.z, smooth, dt),
    );
    // The smoothed position can lag into a wall when turning a corner: clamp it, and keep the
    // clamped value so the camera does not jump back next frame.
    pullIn(bike, pos);
    side = calm ? 0 : smoothDamp(side, bike.steer * CHASE.lookSide, vel.side, CHASE.yawSmoothTime, dt);
    const speedRatio = Math.min(1, bike.speed / BIKE.topSpeed);
    fov = smoothDamp(fov, baseFov() + (calm ? 0 : speedRatio * CHASE.fovSpeedGain), vel.fov, CHASE.fovSmoothTime, dt);
    apply(bike);
  }

  /**
   * A slow walk-around of the bike, framed to leave room for a card.
   * @param {{ x: number, y: number, z: number, heading: number }} bike
   * @param {number} seconds clock
   */
  function orbit(bike, seconds) {
    const o = CHASE.orbit;
    const angle = bike.heading + Math.PI + 0.9 + seconds * o.speed;
    const portrait = camera.aspect < CHASE.portraitAspect;
    const radius = portrait ? o.portraitRadius : o.radius;
    pos.set(bike.x + Math.sin(angle) * radius, bike.y + o.height, bike.z + Math.cos(angle) * radius);
    pullIn(bike, pos);
    camera.position.copy(pos);
    camera.lookAt(bike.x, bike.y + o.lookHeight, bike.z);
    if (portrait) camera.translateY(-o.shiftUp);
    else camera.translateX(-o.shiftSide);
    if (Math.abs(camera.fov - o.fov) > 0.01) {
      camera.fov = o.fov;
      camera.updateProjectionMatrix();
    }
  }

  return { update, reset, orbit };
}
