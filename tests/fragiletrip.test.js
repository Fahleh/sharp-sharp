import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAGILE } from '../js/config.js';
import { createStaticIndex } from '../js/collide.js';
import { createGame } from '../js/game.js';
import { createGraph } from '../js/route.js';

const DT = 1 / 60;
const IDLE = { throttle: 0, brake: 0, steer: 0 };
const GO = { throttle: 1, brake: 0, steer: 0 };
const terrain = { surfaceAt: () => 'road', nearestRoadPoint: () => ({ x: 0, z: 0, heading: 0 }) };
const graph = createGraph({ nodes: [{ id: 'a', x: 0, z: -400 }, { id: 'b', x: 0, z: 400 }], edges: [{ a: 'a', b: 'b' }] });
const vendors = [{ id: 'v1', name: 'Vendor', type: 'Parcel', x: 3, z: 100 }];
const customers = [{ id: 'c1', hint: 'Near the gate', x: 3, z: 260 }];
// A wall across the road, 40 m past the vendor.
const wall = { type: 'box', x: 0, z: 140, hw: 30, hd: 1 };

function fragileGame(wantFragile) {
  const game = createGame({
    terrain, index: createStaticIndex([wall], 16), graph, vendors, customers, stops: [], populated: false, spawn: { x: 0, z: 0, heading: 0 },
  });
  for (let seed = 1; seed < 200; seed += 1) {
    game.start(seed);
    if (game.state.order.fragile === wantFragile) return game;
  }
  throw new Error('no suitable seed');
}

function run(game, seconds, input) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) events.push(...game.step(DT, input));
  return events;
}

const place = (game, x, z) => Object.assign(game.state.bike, { x, z, speed: 0, heading: 0, course: 0 });

function pickUpThenCrash(game) {
  place(game, 3, 100);
  run(game, 0.05, IDLE);
  assert.equal(game.state.order.stage, 'delivery');
  place(game, 0, 110);
  game.state.bike.speed = 15;
  return run(game, 2, GO);
}

test('a crash with a fragile parcel on board costs condition and shows in the pay', () => {
  const game = fragileGame(true);
  const events = pickUpThenCrash(game);
  const crash = events.find((e) => e.type === 'crash');
  assert.ok(crash, 'the bike hit the wall');
  const { order } = game.state;
  assert.ok(order.condition < FRAGILE.start);
  assert.ok(Math.abs(order.condition - (FRAGILE.start - crash.damage * FRAGILE.perDamage)) < 1e-6);
  place(game, 3, 260);
  const delivery = run(game, 0.05, IDLE).find((e) => e.type === 'delivery');
  assert.equal(delivery.pay.fragile, true);
  assert.ok(delivery.pay.total < order.base + Math.round(order.base * 0.6));
});

test('a crash before pickup does not hurt the parcel, since the box is still empty', () => {
  const game = fragileGame(true);
  place(game, 0, 110);
  game.state.bike.speed = 15;
  const events = run(game, 2, GO);
  assert.ok(events.some((e) => e.type === 'crash'));
  assert.equal(game.state.order.condition, FRAGILE.start);
});

test('a normal order has no condition to lose', () => {
  const game = fragileGame(false);
  pickUpThenCrash(game);
  assert.equal(game.state.order.condition, FRAGILE.start);
});
