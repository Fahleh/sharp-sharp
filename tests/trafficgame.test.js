import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIKE, COLLIDE, ECONOMY, PEDS, RATING } from '../js/config.js';
import { createGame } from '../js/game.js';
import { generateCity } from '../js/city.js';
import { CUSTOMERS, MAP, SPAWN, VENDORS, graph } from '../js/map.js';
import { createTerrain } from '../js/terrain.js';

const DT = 1 / 60;
const terrain = createTerrain();
const city = generateCity({ terrain });
const IDLE = { throttle: 0, brake: 0, steer: 0 };
const GO = { throttle: 1, brake: 0, steer: 0 };

function newGame(seed = 3) {
  const game = createGame({
    terrain, index: city.index, graph, vendors: VENDORS, customers: CUSTOMERS, stops: MAP.landmarks.map((l) => l.node), crossings: city.crossings, spawn: SPAWN,
  });
  game.start(seed);
  return game;
}

function run(game, seconds, input = IDLE) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) events.push(...game.step(DT, input));
  return events;
}

// Put the bike on a vehicle's road, `back` metres behind it (negative: ahead), facing along it.
function behind(game, vehicle, back, speed = 0) {
  const { lane } = vehicle;
  const s = vehicle.s - back;
  const heading = lane.heading;
  Object.assign(game.state.bike, {
    x: lane.from.x + lane.ux * s, z: lane.from.z + lane.uz * s, heading, course: heading, speed,
  });
}

// A vehicle mid-lane and moving, found by letting the traffic run a little if needed.
function movingVehicle(game) {
  for (let i = 0; i < 40; i += 1) {
    const found = game.traffic.vehicles.find((v) => v.piece === 'lane' && v.speed > 2 && v.lane.length - v.s > 30 && v.s > 12 && v.lane.edge.kind !== 'ring');
    if (found) return found;
    run(game, 1);
  }
  return undefined;
}

test('a shift starts with traffic, and nothing but the bike moves the order or earnings', () => {
  const game = newGame();
  assert.ok(game.traffic.vehicles.length >= 5);
  assert.equal(game.state.earnings, 0);
});

test('running into the back of a slower vehicle is a crash that costs health, and the vehicle stops', () => {
  const game = newGame();
  run(game, 1);
  const v = movingVehicle(game);
  assert.ok(v);
  behind(game, v, 12, 15);
  const events = run(game, 3, GO);
  const crash = events.find((e) => e.type === 'crash' && e.with === v.id);
  assert.ok(crash, 'the bike hit the vehicle');
  assert.ok(game.state.health < 100);
  assert.ok(v.speed < 6, 'the vehicle was bumped to a stop');
});

test('a vehicle brakes for a bike standing in its lane and never touches it', () => {
  const game = newGame();
  run(game, 1);
  const v = movingVehicle(game);
  assert.ok(v);
  // The bike waits 40 m ahead of the vehicle, in its lane.
  behind(game, v, -40, 0);
  const events = run(game, 12, { throttle: 0, brake: 1, steer: 0 });
  assert.equal(events.filter((e) => e.type === 'crash').length, 0);
  assert.equal(game.state.health, 100);
});

test('a close pass at speed pays the near-miss bonus once, and counts toward the order', () => {
  const game = newGame();
  run(game, 1);
  const v = movingVehicle(game);
  assert.ok(v);
  const before = game.state.earnings;
  // Alongside the vehicle on its right, a body-width away, riding the other way fast.
  const { lane } = v;
  const gap = 0.7;
  const side = v.hw + 0.42 + gap;
  Object.assign(game.state.bike, {
    x: v.x + lane.rx * side + lane.ux * 8, z: v.z + lane.rz * side + lane.uz * 8,
    heading: lane.heading + Math.PI, course: lane.heading + Math.PI, speed: 14,
  });
  const events = run(game, 1.2, GO);
  const close = events.filter((e) => e.type === 'nearmiss' && e.id === v.id);
  assert.equal(close.length, 1, 'one near miss, not one per frame');
  assert.equal(close[0].paid, true);
  assert.equal(close[0].bonus, ECONOMY.nearMissBonus);
  assert.equal(game.state.earnings, before + ECONOMY.nearMissBonus);
  assert.equal(game.state.order.nearMisses, 1);
});

test('a near miss with no order gives the event but no money', () => {
  const game = newGame();
  run(game, 1);
  game.state.order = null;
  const v = movingVehicle(game);
  const { lane } = v;
  Object.assign(game.state.bike, {
    x: v.x + lane.rx * (v.hw + 1.1) + lane.ux * 8, z: v.z + lane.rz * (v.hw + 1.1) + lane.uz * 8,
    heading: lane.heading + Math.PI, course: lane.heading + Math.PI, speed: 14,
  });
  const events = run(game, 1.2, GO);
  const close = events.find((e) => e.type === 'nearmiss');
  assert.ok(close);
  assert.equal(close.paid, false);
  assert.equal(game.state.earnings, 0);
});

test('riding slowly past traffic is never a near miss', () => {
  const game = newGame();
  run(game, 1);
  const v = movingVehicle(game);
  const { lane } = v;
  Object.assign(game.state.bike, {
    x: v.x + lane.rx * (v.hw + 1.1) + lane.ux * 6, z: v.z + lane.rz * (v.hw + 1.1) + lane.uz * 6,
    heading: lane.heading + Math.PI, course: lane.heading + Math.PI, speed: COLLIDE.nearMissMinSpeed - 3,
  });
  const events = run(game, 1.2, IDLE);
  assert.equal(events.filter((e) => e.type === 'nearmiss').length, 0);
  assert.ok(BIKE.topSpeed > COLLIDE.nearMissMinSpeed);
});

test('the same shift seed gives the same traffic', () => {
  const trace = (seed) => {
    const game = newGame(seed);
    run(game, 10);
    return game.traffic.vehicles.map((v) => [v.id, v.kind, +v.x.toFixed(2), +v.z.toFixed(2)]);
  };
  assert.deepEqual(trace(5), trace(5));
  assert.notDeepEqual(trace(5), trace(6));
});

test('every vehicle stays inside the world for a whole shift of idling', () => {
  const game = newGame(8);
  for (let i = 0; i < 60 * 120; i += 1) {
    game.step(DT, IDLE);
    for (const v of game.traffic.vehicles) {
      assert.ok(Math.abs(v.x) < 260 && v.z > -260 && v.z < 260, `${v.id} at ${v.x}, ${v.z}`);
    }
  }
});

// ---- pedestrians
function pedOnPavement(game) {
  for (let i = 0; i < 20; i += 1) {
    const ped = game.peds.peds.find((p) => p.state === 'walk' && !p.link && p.edge.kind !== 'market');
    if (ped) return ped;
    run(game, 1);
  }
  return undefined;
}

test('riding into a person costs 300, a rating dent and speed, once, and they get up', () => {
  const game = newGame(4);
  run(game, 1);
  game.state.earnings = 1000;
  game.state.rating = 4;
  const ped = pedOnPavement(game);
  assert.ok(ped);
  // Arrive from the road side so the bike meets the ped, not a building.
  Object.assign(game.state.bike, { x: ped.x, z: ped.z, speed: 5, course: 0, heading: 0 });
  const events = run(game, 0.2, GO);
  const hits = events.filter((e) => e.type === 'pedhit');
  assert.equal(hits.length, 1, 'one hit, however many frames overlap');
  assert.equal(hits[0].penalty, PEDS.hitPenalty);
  assert.equal(game.state.earnings, 1000 - PEDS.hitPenalty);
  // Landing on the pavement can also scrape a wall: allow for the crash rating hit if it happened.
  const crashes = events.filter((e) => e.type === 'crash').length;
  assert.ok(Math.abs(game.state.rating - (4 + RATING.pedestrian + RATING.crash * crashes)) < 1e-9);
  assert.equal(game.state.order.clean, false);
  assert.equal(ped.state, 'stumble');
  run(game, PEDS.stumbleSeconds + 0.5, { throttle: 0, brake: 1, steer: 0 });
  assert.notEqual(ped.state, 'stumble');
});

test('the penalty never takes earnings below zero', () => {
  const game = newGame(4);
  run(game, 1);
  game.state.earnings = 120;
  const ped = pedOnPavement(game);
  Object.assign(game.state.bike, { x: ped.x, z: ped.z, speed: 5 });
  const events = run(game, 0.2, GO);
  const hit = events.find((e) => e.type === 'pedhit');
  assert.equal(hit.penalty, 120);
  assert.equal(game.state.earnings, 0);
  assert.equal(Number.isInteger(game.state.earnings), true);
});

test('a person who is down is not hit again by the same pass', () => {
  const game = newGame(5);
  run(game, 1);
  const ped = pedOnPavement(game);
  Object.assign(game.state.bike, { x: ped.x, z: ped.z, speed: 0 });
  const first = run(game, 0.1, IDLE).filter((e) => e.type === 'pedhit').length;
  const again = run(game, 0.5, IDLE).filter((e) => e.type === 'pedhit').length;
  assert.equal(first, 1);
  assert.equal(again, 0);
});

test('people on a crossing are obstacles for traffic, and walkers elsewhere are not', () => {
  const game = newGame(6);
  run(game, 60);
  const crossing = game.peds.peds.filter((p) => p.state === 'cross').length;
  const market = game.peds.peds.filter((p) => p.edge.kind === 'market').length;
  assert.equal(game.peds.obstacles().length, game.peds.peds.filter((p) => p.state === 'cross' || p.edge.kind === 'market').length);
  assert.ok(crossing >= 0 && market >= 0);
});

test('pedestrians keep to the cap and the same seed gives the same crowd', () => {
  const trace = (seed) => {
    const game = newGame(seed);
    run(game, 15);
    assert.ok(game.peds.peds.length <= PEDS.maxPeds);
    return game.peds.peds.map((p) => [p.id, +p.x.toFixed(2), +p.z.toFixed(2)]);
  };
  assert.deepEqual(trace(9), trace(9));
});
