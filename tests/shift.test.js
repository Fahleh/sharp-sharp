import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIKE, ECONOMY, ORDERS, RATING, SHIFT } from '../js/config.js';
import { createStaticIndex } from '../js/collide.js';
import { createGame } from '../js/game.js';
import { generateCity } from '../js/city.js';
import { CUSTOMERS, MAP, SPAWN, VENDORS, graph as realGraph } from '../js/map.js';
import { fareFor, settleDelivery, tipAt, timeBudgetFor } from '../js/orders.js';
import { createGraph } from '../js/route.js';
import { createTerrain } from '../js/terrain.js';

const DT = 1 / 60;
const IDLE = { throttle: 0, brake: 0, steer: 0 };
const terrain = { surfaceAt: () => 'road', nearestRoadPoint: () => ({ x: 0, z: 0, heading: 0 }) };
const graph = createGraph({
  nodes: [{ id: 'a', x: 0, z: -400 }, { id: 'b', x: 0, z: 400 }],
  edges: [{ a: 'a', b: 'b' }],
});
const vendors = [{ id: 'v1', name: 'Vendor', type: 'Pharmacy', x: 3, z: 100 }];
const customers = [{ id: 'c1', hint: 'Near the gate', x: 3, z: 260 }];

function make(solids = [], world = { vendors, customers }) {
  const game = createGame({ terrain, index: createStaticIndex(solids, 16), graph, ...world, stops: [], populated: false, spawn: { x: 0, z: 0, heading: 0 } });
  game.start(5);
  return game;
}

function run(game, seconds, input = IDLE) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) events.push(...game.step(DT, input));
  return events;
}

const put = (game, spot) => Object.assign(game.state.bike, { x: spot.x, z: spot.z, speed: 0 });

test('a shift starts with an order to pick up, priced from the route', () => {
  const game = make();
  const { order } = game.state;
  assert.equal(order.stage, 'pickup');
  assert.equal(order.vendor.id, 'v1');
  assert.equal(order.customer.id, 'c1');
  assert.equal(order.type, 'Pharmacy');
  assert.equal(order.base, fareFor(order.meters));
  assert.equal(order.budget, timeBudgetFor(order.meters));
  assert.ok(Math.abs(order.meters - 160) < 1e-6);
});

test('pickup needs the bike inside the marker radius, then the clock starts', () => {
  const game = make();
  put(game, { x: 3 + ORDERS.pickupRadius + 0.2, z: 100 });
  assert.deepEqual(run(game, 0.1).filter((e) => e.type === 'pickup'), []);
  put(game, { x: 3 + ORDERS.pickupRadius - 0.2, z: 100 });
  const events = run(game, 0.05);
  assert.equal(events.filter((e) => e.type === 'pickup').length, 1);
  assert.equal(game.state.order.stage, 'delivery');
  assert.ok(game.state.order.clock < 0.1);
});

test('the delivery clock only runs after pickup', () => {
  const game = make();
  run(game, 5);
  assert.equal(game.state.order.clock, 0);
  put(game, { x: 3, z: 100 });
  run(game, 0.05);
  run(game, 3);
  assert.ok(Math.abs(game.state.order.clock - 3) < 0.2);
});

test('an on-time delivery pays the fare plus what is left of the tip', () => {
  const game = make();
  game.state.rating = 4;
  put(game, { x: 3, z: 100 });
  run(game, 0.05);
  const { order } = game.state;
  run(game, 10);
  put(game, { x: 3, z: 260 });
  const events = run(game, 0.05);
  const delivery = events.find((e) => e.type === 'delivery');
  assert.ok(delivery);
  const expected = settleDelivery({ base: order.base, elapsed: order.clock, budget: order.budget });
  assert.equal(delivery.pay.late, false);
  assert.equal(delivery.pay.total, delivery.pay.base + delivery.pay.tip);
  assert.ok(Math.abs(delivery.pay.tip - expected.tip) <= ECONOMY.tipShare * order.base * (0.1 / order.budget) + 1);
  assert.equal(game.state.earnings, delivery.pay.total);
  assert.equal(game.state.deliveries, 1);
  assert.ok(Math.abs(game.state.rating - 4.2) < 1e-9);
  assert.equal(Number.isInteger(game.state.earnings), true);
});

test('after a delivery the next order appears at once, with the next stage reset', () => {
  const game = make([], {
    vendors: [...vendors, { id: 'v2', name: 'Other', type: 'Food', x: 3, z: 150 }],
    customers: [...customers, { id: 'c2', hint: 'Near the tree', x: 3, z: 300 }],
  });
  const first = game.state.order;
  put(game, first.vendor);
  run(game, 0.05);
  put(game, first.customer);
  const events = run(game, 0.05);
  assert.ok(events.some((e) => e.type === 'order'));
  assert.equal(game.state.order.stage, 'pickup');
  assert.equal(game.state.order.clock, 0);
  assert.notEqual(game.state.order.vendor.id, first.vendor.id);
  assert.notEqual(game.state.order.customer.id, first.customer.id);
});

test('a map with nothing else to offer simply has no next order', () => {
  const game = make();
  put(game, { x: 3, z: 100 });
  run(game, 0.05);
  put(game, { x: 3, z: 260 });
  run(game, 0.05);
  assert.equal(game.state.deliveries, 1);
  assert.equal(game.state.order, null);
});

test('past the budget the order is flagged late once, pays 60%, and costs rating', () => {
  const game = make();
  game.state.rating = 4;
  put(game, { x: 3, z: 100 });
  run(game, 0.05);
  const { order } = game.state;
  const events = run(game, order.budget + 2);
  assert.equal(events.filter((e) => e.type === 'late').length, 1);
  assert.equal(game.state.order.late, true);
  assert.deepEqual(game.liveTip(), { tip: 0 });
  put(game, { x: 3, z: 260 });
  const delivery = run(game, 0.05).find((e) => e.type === 'delivery');
  assert.equal(delivery.pay.late, true);
  assert.equal(delivery.pay.tip, 0);
  assert.equal(delivery.pay.total, Math.round(order.base * ECONOMY.lateFareFactor));
  assert.ok(Math.abs(game.state.rating - (4 + RATING.late)) < 1e-9);
});

test('the live tip falls linearly and is absent before pickup', () => {
  const game = make();
  assert.equal(game.liveTip(), null);
  put(game, { x: 3, z: 100 });
  run(game, 0.05);
  const { order } = game.state;
  const start = game.liveTip().tip;
  assert.ok(Math.abs(start - tipAt({ base: order.base, elapsed: 0.05, budget: order.budget })) <= 1);
  run(game, order.budget / 2);
  assert.ok(Math.abs(game.liveTip().tip - start / 2) < 8);
});

test('a hard crash during an order makes it dirty and dents the rating', () => {
  const wall = { type: 'box', x: 0, z: 40, hw: 30, hd: 1 };
  const game = make([wall]);
  game.state.rating = 4;
  Object.assign(game.state.bike, { z: 20, speed: 0 });
  const events = run(game, 4, { throttle: 1, brake: 0, steer: 0 });
  assert.ok(events.some((e) => e.type === 'crash'));
  assert.equal(game.state.order.clean, false);
  assert.ok(game.state.rating < 4);
});

test('a clean, on-time delivery after a crash-free order raises the rating, a dirty one barely does', () => {
  const run1 = make();
  run1.state.rating = 4;
  put(run1, { x: 3, z: 100 });
  run(run1, 0.05);
  put(run1, { x: 3, z: 260 });
  run(run1, 0.05);
  assert.ok(Math.abs(run1.state.rating - 4.2) < 1e-9);

  const run2 = make();
  run2.state.rating = 4;
  put(run2, { x: 3, z: 100 });
  run(run2, 0.05);
  run2.state.order.clean = false;
  put(run2, { x: 3, z: 260 });
  run(run2, 0.05);
  assert.ok(Math.abs(run2.state.rating - 4.05) < 1e-9);
});

test('the shift ending with an order on the bike pays nothing for it', () => {
  const game = make();
  put(game, { x: 3, z: 100 });
  run(game, 0.05);
  game.state.elapsed = SHIFT.seconds - 0.01;
  const events = run(game, 0.1);
  assert.equal(events.some((e) => e.type === 'gameover'), true);
  assert.equal(game.state.earnings, 0);
  assert.equal(game.state.deliveries, 0);
  assert.equal(game.state.order, null);
});

test('the guide route runs to the vendor, then to the customer', () => {
  const game = make();
  run(game, 0.5);
  assert.ok(Math.abs(game.state.guide.length - 100) < 3);
  const last = game.state.guide.points.at(-1);
  assert.ok(Math.abs(last.z - 100) < 1e-6);
  put(game, { x: 3, z: 100 });
  run(game, 0.05);
  run(game, 0.5);
  assert.ok(Math.abs(game.state.guide.length - 160) < 3);
  assert.ok(Math.abs(game.state.guide.points.at(-1).z - 260) < 1e-6);
});

test('crashing out of the shift also drops the order', () => {
  const game = make();
  game.state.health = 1;
  const wall = { type: 'box', x: 0, z: 40, hw: 30, hd: 1 };
  const g = createGame({ terrain, index: createStaticIndex([wall], 16), graph, vendors, customers, stops: [], populated: false, spawn: { x: 0, z: 20, heading: 0 } });
  g.start(3);
  g.state.health = 1;
  const events = run(g, 6, { throttle: 1, brake: 0, steer: 0 });
  assert.equal(g.state.over, 'wrecked');
  assert.ok(events.some((e) => e.type === 'gameover' && e.reason === 'wrecked'));
  assert.equal(g.state.order, null);
});

// ---- on the real map
const terrainReal = createTerrain();
const city = generateCity({ terrain: terrainReal });
const realGame = (seed) => {
  const game = createGame({ terrain: terrainReal, index: city.index, graph: realGraph, vendors: VENDORS, customers: CUSTOMERS, stops: MAP.landmarks.map((l) => l.node), spawn: SPAWN });
  game.start(seed);
  return game;
};

test('on the real map the same seed gives the same orders, in order', () => {
  const chain = (seed) => {
    const game = realGame(seed);
    const ids = [];
    for (let i = 0; i < 6; i += 1) {
      const { order } = game.state;
      ids.push(`${order.vendor.id}>${order.customer.id}`);
      put(game, order.vendor);
      run(game, 0.05);
      put(game, order.customer);
      run(game, 0.05);
      // After a delivery two orders are offered; take the first, as the timer would.
      game.chooseOffer(0);
    }
    return { ids, earnings: game.state.earnings, deliveries: game.state.deliveries };
  };
  assert.deepEqual(chain(42), chain(42));
  assert.notDeepEqual(chain(42).ids, chain(43).ids);
  const result = chain(42);
  assert.equal(result.deliveries, 6);
  assert.equal(Number.isInteger(result.earnings), true);
  assert.ok(result.earnings > 0);
});

test('on the real map every order offered is valid', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const game = realGame(seed);
    for (let i = 0; i < 8; i += 1) {
      const { order } = game.state;
      assert.ok(order.meters >= ORDERS.deliveryMin - 1e-9 && order.meters <= ORDERS.deliveryMax + 1e-9, `seed ${seed} ${order.meters}`);
      assert.notEqual(order.vendor.id, game.state.lastVendorId);
      assert.notEqual(order.customer.id, game.state.lastCustomerId);
      put(game, order.vendor);
      run(game, 0.05);
      put(game, order.customer);
      run(game, 0.05);
      // After a delivery two orders are offered; take the first, as the timer would.
      game.chooseOffer(0);
    }
  }
});

test('the bike is on a road at the start of a real shift', () => {
  const game = realGame(1);
  assert.equal(terrainReal.surfaceAt(game.state.bike.x, game.state.bike.z), 'road');
  assert.ok(BIKE.topSpeed > 0);
  assert.equal(MAP.spawn, SPAWN);
});
