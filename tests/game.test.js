import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIKE, SHIFT } from '../js/config.js';
import { createStaticIndex } from '../js/collide.js';
import { createGame } from '../js/game.js';
import { createGraph } from '../js/route.js';

const DT = 1 / 60;
const GO = { throttle: 1, brake: 0, steer: 0 };
const IDLE = { throttle: 0, brake: 0, steer: 0 };

// A flat world of road with one wall across the way ahead (+z) of the start.
const wall = { type: 'box', x: 0, z: 60, hw: 30, hd: 1 };
const terrain = {
  surfaceAt: () => 'road',
  nearestRoadPoint: (x, z) => ({ x: 5, z, heading: Math.PI / 2 }),
};
// A straight street along z with a vendor and a customer, so orders exist.
const graph = createGraph({
  nodes: [{ id: 'a', x: 0, z: -400 }, { id: 'b', x: 0, z: 400 }],
  edges: [{ a: 'a', b: 'b' }],
});
const vendors = [{ id: 'v1', name: 'Vendor', type: 'Food', x: 3, z: 100 }];
const customers = [{ id: 'c1', hint: 'Near the gate', x: 3, z: 260 }];
const make = (solids = [wall], spawn = { x: 0, z: 0, heading: 0 }) => createGame({
  terrain, index: createStaticIndex(solids, 16), graph, vendors, customers, stops: [], populated: false, spawn,
});
const begin = (game) => game.start(1);

function run(game, input, seconds) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) events.push(...game.step(DT, input));
  return events;
}

test('a new game waits in ready and does not move until started', () => {
  const game = make();
  assert.equal(game.state.phase, 'ready');
  run(game, GO, 1);
  assert.equal(game.state.bike.speed, 0);
  assert.equal(game.state.elapsed, 0);
});

test('start begins a full-length shift with full health', () => {
  const game = make();
  begin(game);
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.remaining, SHIFT.seconds);
  assert.equal(game.state.health, SHIFT.startHealth);
});

test('the clock runs while playing and stops while paused', () => {
  const game = make([]);
  begin(game);
  run(game, IDLE, 2);
  assert.ok(Math.abs(game.state.elapsed - 2) < 1e-6);
  game.setPaused(true);
  assert.equal(game.state.phase, 'paused');
  const before = game.state.elapsed;
  run(game, GO, 5);
  assert.equal(game.state.elapsed, before);
  assert.equal(game.state.bike.speed, 0);
  game.setPaused(false);
  assert.equal(game.state.phase, 'playing');
  run(game, IDLE, 1);
  assert.ok(game.state.elapsed > before);
});

test('pausing outside play does nothing', () => {
  const game = make();
  game.setPaused(true);
  assert.equal(game.state.phase, 'ready');
  begin(game);
  game.setPaused(false);
  assert.equal(game.state.phase, 'playing');
});

test('the shift ends on time after exactly the shift length', () => {
  const game = make([]);
  begin(game);
  const events = run(game, IDLE, SHIFT.seconds + 1);
  assert.equal(game.state.phase, 'gameover');
  assert.equal(game.state.over, 'time');
  assert.equal(events.filter((e) => e.type === 'gameover').length, 1);
  assert.equal(game.state.remaining, 0);
  assert.ok(game.state.elapsed >= SHIFT.seconds && game.state.elapsed < SHIFT.seconds + 2 * DT);
});

test('nothing moves after game over', () => {
  const game = make([]);
  begin(game);
  run(game, IDLE, SHIFT.seconds + 1);
  const elapsed = game.state.elapsed;
  assert.deepEqual(run(game, GO, 1), []);
  assert.equal(game.state.elapsed, elapsed);
});

test('hitting a wall at speed costs health once and reports a crash', () => {
  const game = make();
  begin(game);
  const events = run(game, GO, 8);
  const crashes = events.filter((e) => e.type === 'crash');
  assert.ok(crashes.length >= 1);
  assert.ok(crashes[0].damage >= BIKE.damageMin && crashes[0].damage <= BIKE.damageMax);
  assert.equal(game.state.health, SHIFT.startHealth - crashes.reduce((sum, c) => sum + c.damage, 0));
  // Never inside the wall, however long the throttle stays down.
  assert.ok(game.state.bike.z < 60 - 1 + 1e-6);
});

test('a hit is not counted twice inside the cooldown', () => {
  const game = make();
  begin(game);
  game.state.bike.z = 58.5;
  game.state.bike.speed = 16;
  const events = run(game, GO, BIKE.hitCooldownSeconds * 0.9);
  assert.equal(events.filter((e) => e.type === 'crash').length <= 1, true);
});

test('crashing until health runs out ends the shift as wrecked', () => {
  const game = make();
  begin(game);
  let ended = null;
  for (let attempt = 0; attempt < 12 && game.state.phase === 'playing'; attempt += 1) {
    Object.assign(game.state.bike, { x: 0, z: 40, speed: 0, heading: 0, course: 0, steer: 0 });
    run(game, GO, 4);
  }
  ended = game.state.over;
  assert.equal(game.state.phase, 'gameover');
  assert.equal(ended, 'wrecked');
  assert.equal(game.state.health, 0);
});

test('a full-speed bike never tunnels through a thin rail', () => {
  const rail = { type: 'box', x: 0, z: 30, hw: 20, hd: 0.3 };
  const game = make([rail]);
  begin(game);
  game.state.bike.speed = BIKE.topSpeed;
  run(game, GO, 6);
  assert.ok(game.state.bike.z < 30);
});

// Hold the bike still the way a jam would, however the throttle is pressed.
function pinned(game, input, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    game.step(DT, input);
    game.state.bike.speed = 0;
  }
}

test('not moving with the throttle down offers a recover after the delay', () => {
  const game = make([]);
  begin(game);
  pinned(game, GO, SHIFT.stuckSeconds - 0.5);
  assert.equal(game.state.canRecover, false);
  pinned(game, GO, 1);
  assert.equal(game.state.canRecover, true);
});

test('moving again clears the recover offer, after a short hold', () => {
  const game = make([]);
  begin(game);
  pinned(game, GO, SHIFT.stuckSeconds + 0.5);
  assert.equal(game.state.canRecover, true);
  run(game, GO, 1);
  assert.equal(game.state.canRecover, true, 'the button does not vanish under a thumb');
  run(game, GO, SHIFT.stuckHoldSeconds + SHIFT.stuckSeconds);
  assert.equal(game.state.canRecover, false);
});

test('bouncing on the spot is stuck even though the speed is not near zero', () => {
  const game = make([]);
  begin(game);
  const home = { x: game.state.bike.x, z: game.state.bike.z };
  for (let i = 0; i < Math.round((SHIFT.stuckSeconds + 1) / DT); i += 1) {
    game.step(DT, GO);
    // A bike that keeps hitting a stopped vehicle: knocked back and forth, never getting anywhere.
    game.state.bike.x = home.x + (Math.floor(i / 12) % 2) * 0.8;
    game.state.bike.z = home.z;
    game.state.bike.speed = 2.5;
  }
  assert.equal(game.state.canRecover, true);
});

test('braking or idling in the open is not stuck', () => {
  const game = make([]);
  begin(game);
  run(game, { throttle: 0, brake: 1, steer: 0 }, SHIFT.stuckSeconds + 2);
  assert.equal(game.state.canRecover, false);
  run(game, IDLE, SHIFT.stuckSeconds + 2);
  assert.equal(game.state.canRecover, false);
});

test('recover puts the bike on the road, stopped, and clears the offer', () => {
  const game = make([]);
  begin(game);
  game.state.bike.z = 56;
  pinned(game, GO, SHIFT.stuckSeconds + 1);
  assert.equal(game.state.canRecover, true);
  game.recover();
  const { bike } = game.state;
  assert.equal(bike.x, 5);
  assert.equal(bike.speed, 0);
  assert.equal(bike.heading, Math.PI / 2);
  assert.equal(game.state.canRecover, false);
  assert.equal(game.state.health, SHIFT.startHealth, 'recovering is free');
});

test('recover does nothing when the bike is not stuck, so it cannot skip a stretch', () => {
  const game = make([]);
  begin(game);
  run(game, GO, 2);
  const before = { ...game.state.bike };
  game.recover();
  assert.deepEqual(game.state.bike, before, 'riding freely: no teleport');
  // Only trying and getting nowhere offers it: idle and braking in place do not.
  const idle = make([]);
  begin(idle);
  run(idle, IDLE, SHIFT.stuckSeconds + 2);
  assert.equal(idle.state.canRecover, false);
  const spot = { ...idle.state.bike };
  idle.recover();
  assert.deepEqual(idle.state.bike, spot);
});

test('recover works once stuck, and only once until stuck again', () => {
  const game = make([]);
  begin(game);
  game.state.bike.z = 56;
  pinned(game, GO, SHIFT.stuckSeconds + 1);
  assert.equal(game.state.canRecover, true);
  game.recover();
  assert.equal(game.state.bike.x, 5, 'moved to the road');
  game.state.bike.z = 56;
  game.recover();
  assert.equal(game.state.bike.z, 56, 'a second press does nothing while it is not stuck');
});

test('recover only works during play', () => {
  const game = make();
  const before = { ...game.state.bike };
  game.recover();
  assert.deepEqual(game.state.bike, before);
});

test('start resets everything for the next shift', () => {
  const game = make();
  begin(game);
  run(game, GO, 8);
  begin(game);
  assert.equal(game.state.elapsed, 0);
  assert.equal(game.state.health, SHIFT.startHealth);
  assert.equal(game.state.bike.speed, 0);
  assert.equal(game.state.over, null);
});

test('holding the horn sounds once per press, and again after a release and the cooldown', () => {
  const game = make([]);
  begin(game);
  const honks = (events) => events.filter((e) => e.type === 'honk').length;
  assert.equal(honks(run(game, { ...IDLE, horn: true }, 1)), 1);
  run(game, IDLE, BIKE.hornCooldownSeconds + 0.1);
  assert.equal(honks(run(game, { ...IDLE, horn: true }, 0.2)), 1);
});

test('tapping the horn faster than its cooldown sounds once', () => {
  const game = make([]);
  begin(game);
  const events = [];
  for (let i = 0; i < 4; i += 1) {
    events.push(...run(game, { ...IDLE, horn: true }, 0.05));
    events.push(...run(game, IDLE, 0.05));
  }
  assert.equal(events.filter((e) => e.type === 'honk').length, 1);
});

test('rain starts once in a shift and the road gets wet', () => {
  const game = make([]);
  begin(game);
  const events = run(game, IDLE, SHIFT.seconds - 1);
  assert.equal(events.filter((e) => e.type === 'rainStart').length, 1);
  assert.equal(events.filter((e) => e.type === 'rainEnd').length, 1);
});

test('the same shift seed rains at the same time', () => {
  const when = (seed) => {
    const game = make([]);
    game.start(seed);
    for (let i = 0; i < SHIFT.seconds * 60; i += 1) {
      if (game.step(DT, IDLE).some((e) => e.type === 'rainStart')) return game.state.elapsed;
    }
    return null;
  };
  assert.equal(when(5), when(5));
  assert.notEqual(when(5), null);
});
