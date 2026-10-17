import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAGILE, STREAK } from '../js/config.js';
import { createStaticIndex } from '../js/collide.js';
import { createGame } from '../js/game.js';
import { settleDelivery, settleOrder, streakMultiplier } from '../js/orders.js';
import { createGraph } from '../js/route.js';

test('the multiplier grows by 10% for each delivery in a row and stops at 1.5', () => {
  assert.equal(streakMultiplier(0), 1);
  assert.equal(streakMultiplier(1), 1.1);
  assert.equal(streakMultiplier(3), 1.3);
  assert.equal(streakMultiplier(5), STREAK.cap);
  assert.equal(streakMultiplier(6), STREAK.cap);
  assert.equal(streakMultiplier(500), STREAK.cap);
});

test('a missing or negative streak is no bonus', () => {
  assert.equal(streakMultiplier(-4), 1);
  assert.equal(streakMultiplier(undefined), 1);
});

test('the multiplier never falls as the streak grows', () => {
  let last = 0;
  for (let n = 0; n < 20; n += 1) {
    const m = streakMultiplier(n);
    assert.ok(m >= last);
    last = m;
  }
});

const clock = { base: 1000, elapsed: 10, budget: 40 };

test('an on-time delivery is paid times the streak multiplier', () => {
  const plain = settleDelivery(clock).total;
  assert.equal(settleOrder({ ...clock, streak: 2 }).total, Math.round(plain * 1.2));
  assert.equal(settleOrder({ ...clock, streak: 2 }).multiplier, 1.2);
  assert.equal(settleOrder({ ...clock, streak: 9 }).total, Math.round(plain * STREAK.cap));
});

test('a late delivery gets no streak bonus', () => {
  const late = { base: 1000, elapsed: 50, budget: 40 };
  const pay = settleOrder({ ...late, streak: 4 });
  assert.equal(pay.multiplier, 1);
  assert.equal(pay.total, settleDelivery(late).total);
});

test('a spoiled parcel gets no streak bonus', () => {
  const pay = settleOrder({ ...clock, fragile: true, condition: FRAGILE.spoiledBelow - 1, streak: 4 });
  assert.equal(pay.multiplier, 1);
});

test('the streak and the condition share combine on a fragile order', () => {
  const plain = settleDelivery(clock).total;
  assert.equal(settleOrder({ ...clock, fragile: true, condition: 50, streak: 3 }).total, Math.round(plain * 0.5 * 1.3));
});

test('pay stays a whole number for any streak', () => {
  for (let n = 0; n < 8; n += 1) assert.equal(Number.isInteger(settleOrder({ base: 850, elapsed: 13, budget: 41.7, streak: n }).total), true);
});

// ---- through the game
const DT = 1 / 60;
const IDLE = { throttle: 0, brake: 0, steer: 0 };
const GO = { throttle: 1, brake: 0, steer: 0 };
const terrain = { surfaceAt: () => 'road', nearestRoadPoint: () => ({ x: 0, z: 0, heading: 0 }) };
const graph = createGraph({ nodes: [{ id: 'a', x: 0, z: -400 }, { id: 'b', x: 0, z: 400 }], edges: [{ a: 'a', b: 'b' }] });
const vendors = [
  { id: 'v1', name: 'One', type: 'Food', x: 3, z: 100 },
  { id: 'v2', name: 'Two', type: 'Parcel', x: 3, z: 130 },
  { id: 'v3', name: 'Three', type: 'Pharmacy', x: 3, z: 170 },
];
const customers = [
  { id: 'c1', hint: 'One', x: 3, z: 260 },
  { id: 'c2', hint: 'Two', x: 3, z: 300 },
  { id: 'c3', hint: 'Three', x: 3, z: 340 },
];
const wall = { type: 'box', x: 0, z: 200, hw: 30, hd: 1 };

function make() {
  const game = createGame({
    terrain, index: createStaticIndex([wall], 16), graph, vendors, customers, stops: [], populated: false, spawn: { x: 0, z: 0, heading: 0 },
  });
  game.start(8);
  return game;
}

function run(game, seconds, input = IDLE) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) events.push(...game.step(DT, input));
  return events;
}

const put = (game, spot) => Object.assign(game.state.bike, { x: spot.x, z: spot.z, speed: 0, heading: 0, course: 0 });

// Deliver the active order at once (so it is on time) and take the first offer.
function deliver(game, { slow = 0 } = {}) {
  const { order } = game.state;
  put(game, order.vendor);
  run(game, 0.05);
  if (slow) run(game, slow);
  put(game, order.customer);
  const events = run(game, 0.05);
  game.chooseOffer(0);
  return events.find((e) => e.type === 'delivery');
}

test('each on-time delivery raises the streak and the next one pays more', () => {
  const game = make();
  const pays = [];
  for (let i = 0; i < 3; i += 1) {
    const delivery = deliver(game);
    pays.push(delivery.pay.multiplier);
  }
  assert.deepEqual(pays, [1, 1.1, 1.2]);
  assert.equal(game.state.streak, 3);
});

test('a late delivery ends the streak', () => {
  const game = make();
  deliver(game);
  deliver(game);
  assert.equal(game.state.streak, 2);
  const { order } = game.state;
  const late = deliver(game, { slow: order.budget + 3 });
  assert.equal(late.pay.late, true);
  assert.equal(game.state.streak, 0);
});

test('a wreck ends the streak, and a bump does not', () => {
  const game = make();
  deliver(game);
  assert.equal(game.state.streak, 1);
  // A slow nudge against the wall costs little and keeps the streak.
  put(game, { x: 0, z: 196 });
  game.state.bike.speed = 4;
  const soft = run(game, 1);
  const nudge = soft.find((e) => e.type === 'crash');
  assert.ok(nudge && nudge.damage < STREAK.wreckDamage, 'a soft knock');
  assert.equal(game.state.streak, 1);
  // A fast hit is a wreck.
  put(game, { x: 0, z: 170 });
  game.state.bike.speed = 16;
  const events = run(game, 2, GO);
  const crash = events.find((e) => e.type === 'crash');
  assert.ok(crash && crash.damage >= STREAK.wreckDamage, 'a hard crash');
  assert.equal(game.state.streak, 0);
  assert.ok(events.some((e) => e.type === 'streakLost'));
});

test('a new shift starts with no streak', () => {
  const game = make();
  deliver(game);
  game.start(9);
  assert.equal(game.state.streak, 0);
});
