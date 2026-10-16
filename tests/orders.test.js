import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY, ORDERS, RATING } from '../js/config.js';
import { createRng } from '../js/rng.js';
import { createGraph } from '../js/route.js';
import {
  fareFor, generateOrder, nearMissPayout, rateCrash, rateDelivery, settleDelivery, timeBudgetFor, tipAt,
} from '../js/orders.js';

test('fare is 300 + 4 per metre rounded to the nearest 50', () => {
  assert.equal(fareFor(200), 1100);
  assert.equal(fareFor(0), 300);
  assert.equal(fareFor(100), 700);
  assert.equal(fareFor(123), 800); // 300 + 492 = 792
  assert.equal(fareFor(126), 800); // 804
  assert.equal(fareFor(137), 850); // 848
  for (const m of [10, 77, 250, 399]) assert.equal(fareFor(m) % 50, 0);
});

test('time budget is route over 8.5 m/s times 1.35 plus 10 s', () => {
  assert.ok(Math.abs(timeBudgetFor(200) - (200 / 8.5 * 1.35 + 10)) < 1e-9);
  assert.ok(Math.abs(timeBudgetFor(0) - 10) < 1e-9);
  assert.ok(timeBudgetFor(300) > timeBudgetFor(200));
});

test('tip starts at 60% of the fare and decays linearly to zero at the budget', () => {
  const clock = (elapsed) => ({ base: 1000, elapsed, budget: 40 });
  assert.equal(tipAt(clock(0)), 600);
  assert.equal(tipAt(clock(20)), 300);
  assert.equal(tipAt(clock(10)), 450);
  assert.equal(tipAt(clock(40)), 0);
  assert.equal(tipAt(clock(100)), 0);
  let last = Infinity;
  for (let t = 0; t <= 40; t += 1) {
    const tip = tipAt(clock(t));
    assert.ok(tip <= last);
    assert.ok(Number.isInteger(tip));
    last = tip;
  }
});

test('on time: base plus what is left of the tip', () => {
  assert.deepEqual(settleDelivery({ base: 1100, elapsed: 20, budget: 40 }), { late: false, base: 1100, tip: 330, total: 1430 });
  // Exactly at the budget is still on time, with no tip left.
  assert.deepEqual(settleDelivery({ base: 1100, elapsed: 40, budget: 40 }), { late: false, base: 1100, tip: 0, total: 1100 });
});

test('late: no tip and 60% of the fare', () => {
  assert.deepEqual(settleDelivery({ base: 1100, elapsed: 40.01, budget: 40 }), { late: true, base: 660, tip: 0, total: 660 });
  assert.equal(settleDelivery({ base: 850, elapsed: 90, budget: 40 }).total, 510);
});

test('payouts are always whole numbers', () => {
  for (let elapsed = 0; elapsed < 60; elapsed += 1.37) {
    const pay = settleDelivery({ base: 1050, elapsed, budget: 41.7 });
    assert.ok(Number.isInteger(pay.base) && Number.isInteger(pay.tip) && Number.isInteger(pay.total));
  }
});

test('near-miss bonus is 50 each and stops after 5 per order', () => {
  for (let n = 0; n < ECONOMY.nearMissMax; n += 1) assert.deepEqual(nearMissPayout(n), { paid: true, bonus: 50 });
  assert.deepEqual(nearMissPayout(5), { paid: false, bonus: 0 });
  assert.deepEqual(nearMissPayout(9), { paid: false, bonus: 0 });
});

test('rating rises on clean on-time work, barely on dirty on-time work, falls when late', () => {
  assert.ok(Math.abs(rateDelivery(4, { late: false, clean: true }) - 4.2) < 1e-9);
  assert.ok(Math.abs(rateDelivery(4, { late: false, clean: false }) - 4.05) < 1e-9);
  assert.ok(Math.abs(rateDelivery(4, { late: true, clean: true }) - 3.5) < 1e-9);
  assert.equal(rateDelivery(5, { late: false, clean: true }), RATING.max);
  assert.equal(rateDelivery(1.2, { late: true, clean: false }), RATING.min);
  assert.ok(Math.abs(rateCrash(4) - 3.85) < 1e-9);
  assert.equal(rateCrash(1), RATING.min);
});

// ---- generation
// A straight street with vendors and customers along it.
const graph = createGraph({
  nodes: Array.from({ length: 11 }, (_, i) => ({ id: `n${i}`, x: i * 50, z: 0 })),
  edges: Array.from({ length: 10 }, (_, i) => ({ a: `n${i}`, b: `n${i + 1}` })),
});
const vendors = [0, 1, 2, 3].map((i) => ({ id: `v${i}`, name: `Vendor ${i}`, type: 'Food', x: i * 120 + 25, z: 5 }));
const customers = [0, 1, 2, 3, 4].map((i) => ({ id: `c${i}`, name: `Customer ${i}`, x: i * 100 + 10, z: -5 }));

function make(seed, extra = {}) {
  return generateOrder({ rng: createRng(seed), graph, vendors, customers, from: { x: 0, z: 0 }, ...extra });
}

test('generated orders are valid and priced from the route', () => {
  for (let seed = 1; seed < 40; seed += 1) {
    const order = make(seed);
    assert.ok(order);
    assert.ok(vendors.includes(order.vendor) && customers.includes(order.customer));
    assert.ok(order.meters >= ORDERS.deliveryMin && order.meters <= ORDERS.deliveryMax);
    assert.equal(order.base, fareFor(order.meters));
    assert.equal(order.budget, timeBudgetFor(order.meters));
    assert.ok(order.pickupMeters >= ORDERS.pickupMin && order.pickupMeters <= ORDERS.pickupMax);
    assert.equal(order.type, 'Food');
  }
});

test('generation is seeded: same seed same order, other seeds vary', () => {
  const a = make(11);
  const b = make(11);
  assert.equal(a.vendor.id, b.vendor.id);
  assert.equal(a.customer.id, b.customer.id);
  const seen = new Set(Array.from({ length: 30 }, (_, i) => `${make(i).vendor.id}-${make(i).customer.id}`));
  assert.ok(seen.size > 2);
});

test('the previous vendor and customer are not repeated', () => {
  for (let seed = 1; seed < 30; seed += 1) {
    const order = make(seed, { lastVendorId: 'v1', lastCustomerId: 'c2' });
    assert.notEqual(order.vendor.id, 'v1');
    assert.notEqual(order.customer.id, 'c2');
  }
});

test('when nothing is in range it still offers the closest option', () => {
  const far = generateOrder({ rng: createRng(3), graph, vendors: [vendors[3]], customers: [customers[0]], from: { x: 0, z: 0 } });
  assert.ok(far);
  assert.equal(far.vendor.id, 'v3');
});

test('no vendors or no reachable customers gives null', () => {
  assert.equal(generateOrder({ rng: createRng(1), graph, vendors: [], customers, from: { x: 0, z: 0 } }), null);
  assert.equal(generateOrder({ rng: createRng(1), graph, vendors, customers: [], from: { x: 0, z: 0 } }), null);
});
