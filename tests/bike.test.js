import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIKE, SURFACES } from '../js/config.js';
import { applyImpact, createBike, impactDamage, maxSteerAngle, stepBike } from '../js/bike.js';

const DT = 1 / 60;
const road = SURFACES.road;
const deg = (rad) => (rad * 180) / Math.PI;

function run(bike, input, seconds, { grip = 1, surface = road } = {}) {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    stepBike(bike, input, { dt: DT, grip, surface });
  }
  return bike;
}

function stoppingDistance(grip) {
  const bike = createBike({ x: 0, z: 0, heading: 0 });
  bike.speed = BIKE.topSpeed;
  bike.course = 0;
  while (bike.speed > 0.01) stepBike(bike, { throttle: 0, brake: 1, steer: 0 }, { dt: DT, grip, surface: road });
  return bike.z;
}

test('throttle accelerates smoothly toward top speed and never past it', () => {
  const bike = createBike({ x: 0, z: 0, heading: 0 });
  let last = 0;
  for (let i = 0; i < 600; i += 1) {
    stepBike(bike, { throttle: 1, brake: 0, steer: 0 }, { dt: DT, grip: 1, surface: road });
    assert.ok(bike.speed >= last - 1e-12, 'speed never drops under throttle');
    assert.ok(bike.speed <= BIKE.topSpeed + 1e-9);
    last = bike.speed;
  }
  assert.ok(bike.speed > BIKE.topSpeed * 0.97);
});

test('initial acceleration is near the configured value', () => {
  const bike = createBike({ x: 0, z: 0, heading: 0 });
  run(bike, { throttle: 1, brake: 0, steer: 0 }, 0.5);
  assert.ok(Math.abs(bike.speed / 0.5 - BIKE.accel) < 0.5);
});

test('coasting settles to a stop on its own', () => {
  const bike = createBike({ x: 0, z: 0, heading: 0 });
  bike.speed = BIKE.topSpeed;
  let last = bike.speed;
  for (let i = 0; i < 60 * 40; i += 1) {
    stepBike(bike, { throttle: 0, brake: 0, steer: 0 }, { dt: DT, grip: 1, surface: road });
    assert.ok(bike.speed <= last + 1e-12);
    last = bike.speed;
  }
  assert.equal(bike.speed, 0);
});

test('braking stops inside v squared over 2a (rolling drag helps) and never reverses', () => {
  const brakeOnly = (BIKE.topSpeed ** 2) / (2 * BIKE.brake);
  const withDrag = (BIKE.topSpeed ** 2) / (2 * (BIKE.brake + BIKE.coastDrag * BIKE.topSpeed + BIKE.rolling));
  const dry = stoppingDistance(1);
  assert.ok(dry < brakeOnly && dry > withDrag, `dry ${dry} between ${withDrag} and ${brakeOnly}`);
  const bike = createBike({ x: 0, z: 0, heading: 0 });
  run(bike, { throttle: 0, brake: 1, steer: 0 }, 2);
  assert.equal(bike.speed, 0);
});

test('rain (grip 0.7) lengthens braking', () => {
  const dry = stoppingDistance(1);
  const wet = stoppingDistance(0.7);
  assert.ok(wet > dry * 1.3, `wet ${wet} dry ${dry}`);
});

test('steering angle is full at a walk and shrinks with speed and with lower grip', () => {
  near(deg(maxSteerAngle(1, 1)), BIKE.maxSteerDeg);
  const mid = maxSteerAngle(8, 1);
  const top = maxSteerAngle(BIKE.topSpeed, 1);
  assert.ok(top < mid && mid < maxSteerAngle(1, 1));
  assert.ok(maxSteerAngle(BIKE.topSpeed, 0.7) < top);
});

function near(a, b, tol = 1e-6) {
  assert.ok(Math.abs(a - b) < tol, `expected ${b}, got ${a}`);
}

test('steer input is smoothed, not instant', () => {
  const bike = createBike({ x: 0, z: 0, heading: 0 });
  stepBike(bike, { throttle: 1, brake: 0, steer: 1 }, { dt: DT, grip: 1, surface: road });
  assert.ok(bike.steer > 0 && bike.steer < 0.5);
  run(bike, { throttle: 1, brake: 0, steer: 1 }, 0.5);
  assert.equal(bike.steer, 1);
  run(bike, { throttle: 1, brake: 0, steer: 0 }, 0.5);
  assert.equal(bike.steer, 0);
});

test('turning right at heading 0 moves toward -x and lowers the heading', () => {
  const bike = createBike({ x: 0, z: 0, heading: 0 });
  bike.speed = 8;
  run(bike, { throttle: 0.5, brake: 0, steer: 1 }, 1.5);
  assert.ok(bike.heading < 0);
  assert.ok(bike.x < 0);
  assert.ok(bike.lean > 0, 'leans right into a right turn');
  const left = createBike({ x: 0, z: 0, heading: 0 });
  left.speed = 8;
  run(left, { throttle: 0.5, brake: 0, steer: -1 }, 1.5);
  assert.ok(left.heading > 0 && left.x > 0 && left.lean < 0);
});

test('a stopped bike does not turn on the spot', () => {
  const bike = createBike({ x: 0, z: 0, heading: 1 });
  run(bike, { throttle: 0, brake: 0, steer: 1 }, 1);
  assert.equal(bike.heading, 1);
  assert.equal(bike.speed, 0);
});

function turnRadiusAt(grip) {
  const bike = createBike({ x: 0, z: 0, heading: 0 });
  bike.speed = 12;
  const input = { throttle: 0.35, brake: 0, steer: 1 };
  run(bike, input, 1.2, { grip });
  // Radius from the circle through three later points.
  const pts = [];
  for (let i = 0; i < 3; i += 1) {
    run(bike, input, 0.25, { grip });
    pts.push({ x: bike.x, z: bike.z });
  }
  const [a, b, c] = pts;
  const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
  const side = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  return (side(a, b) * side(b, c) * side(a, c)) / (4 * area);
}

test('rain widens turns', () => {
  const dry = turnRadiusAt(1);
  const wet = turnRadiusAt(0.7);
  assert.ok(wet > dry * 1.1, `wet ${wet} dry ${dry}`);
});

test('rain allows a small slide: travel direction lags the heading', () => {
  const slip = (grip) => {
    const bike = createBike({ x: 0, z: 0, heading: 0 });
    bike.speed = 14;
    let worst = 0;
    for (let i = 0; i < 90; i += 1) {
      stepBike(bike, { throttle: 0.4, brake: 0, steer: 1 }, { dt: DT, grip, surface: road });
      worst = Math.max(worst, Math.abs(bike.heading - bike.course));
    }
    return worst;
  };
  assert.ok(slip(0.7) > slip(1) * 1.5);
  assert.ok(slip(0.7) < 0.5, 'a slide, not a spin');
});

test('grass and sidewalk cap the speed below the road top speed', () => {
  for (const name of ['sidewalk', 'grass', 'sand']) {
    const bike = createBike({ x: 0, z: 0, heading: 0 });
    run(bike, { throttle: 1, brake: 0, steer: 0 }, 12, { surface: SURFACES[name] });
    assert.ok(bike.speed <= BIKE.topSpeed * SURFACES[name].speedFactor + 0.01, name);
    assert.ok(bike.speed > BIKE.topSpeed * SURFACES[name].speedFactor * 0.9, name);
  }
});

test('riding onto grass sheds speed, it does not snap to the cap', () => {
  const bike = createBike({ x: 0, z: 0, heading: 0 });
  bike.speed = 16;
  stepBike(bike, { throttle: 1, brake: 0, steer: 0 }, { dt: DT, grip: 1, surface: SURFACES.grass });
  assert.ok(bike.speed > 14);
});

// ---- impacts
test('head-on at full speed bounces back and costs the most health', () => {
  const bike = createBike({ x: 0, z: 0, heading: 0 });
  bike.speed = 16;
  const result = applyImpact(bike, { nx: 0, nz: -1 });
  near(result.impact, 16);
  assert.equal(result.damage, 35);
  assert.ok(bike.speed < 16 * 0.3);
  assert.ok(Math.cos(bike.course) < 0, 'now travelling away from the wall');
});

test('a scrape along a wall costs nothing and keeps most of the speed', () => {
  const bike = createBike({ x: 0, z: 0, heading: 0.1 });
  bike.speed = 12;
  // Running along +z with a wall on the +x side: the normal points back to -x.
  const result = applyImpact(bike, { nx: -1, nz: 0 });
  assert.ok(result.impact < BIKE.minDamageImpact);
  assert.equal(result.damage, 0);
  assert.ok(bike.speed > 12 * BIKE.tangentKeep * 0.97, `kept ${bike.speed}`);
});

test('moving away from the obstacle is not an impact', () => {
  const bike = createBike({ x: 0, z: 0, heading: 0 });
  bike.speed = 10;
  const result = applyImpact(bike, { nx: 0, nz: 1 });
  assert.deepEqual(result, { impact: 0, damage: 0 });
  assert.equal(bike.speed, 10);
});

test('an impact turns the bike along the wall', () => {
  const bike = createBike({ x: 0, z: 0, heading: 0.6 });
  bike.course = 0.6;
  bike.speed = 12;
  applyImpact(bike, { nx: 0, nz: -1 });
  assert.ok(Math.abs(bike.course - Math.PI / 2) < Math.abs(0.6 - Math.PI / 2), 'course swings along the wall');
});

test('damage is 0 below the threshold, 10 to 35 above, and rises with impact', () => {
  assert.equal(impactDamage(BIKE.minDamageImpact - 0.01), 0);
  assert.equal(impactDamage(BIKE.minDamageImpact), BIKE.damageMin);
  assert.equal(impactDamage(BIKE.damageFullImpact), BIKE.damageMax);
  assert.equal(impactDamage(40), BIKE.damageMax);
  let last = 0;
  for (let v = 3; v <= 16; v += 0.5) {
    const d = impactDamage(v);
    assert.ok(d >= last);
    assert.ok(Number.isInteger(d));
    last = d;
  }
});
