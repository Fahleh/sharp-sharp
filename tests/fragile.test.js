import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAGILE } from '../js/config.js';
import { createRng } from '../js/rng.js';
import { createGraph } from '../js/route.js';
import {
  crashConditionLoss, generateOrder, isSpoiled, loseCondition, settleDelivery, settleOrder,
} from '../js/orders.js';

const clock = { base: 1000, elapsed: 10, budget: 40 };

test('a normal order pays exactly what settleDelivery says', () => {
  const normal = settleOrder(clock);
  const plain = settleDelivery(clock);
  for (const key of ['late', 'base', 'tip', 'total']) assert.equal(normal[key], plain[key]);
  assert.equal(normal.fragile, false);
});

test('a fragile order at full condition pays like a normal one', () => {
  assert.equal(settleOrder({ ...clock, fragile: true, condition: 100 }).total, settleDelivery(clock).total);
});

test('payout is multiplied by condition', () => {
  const full = settleDelivery(clock).total;
  assert.equal(settleOrder({ ...clock, fragile: true, condition: 80 }).total, Math.round(full * 0.8));
  assert.equal(settleOrder({ ...clock, fragile: true, condition: 50 }).total, Math.round(full * 0.5));
});

test('below 20% the order is spoiled: no tip, base only times condition', () => {
  const pay = settleOrder({ ...clock, fragile: true, condition: 15 });
  assert.equal(pay.spoiled, true);
  assert.equal(pay.tip, 0);
  assert.equal(pay.total, Math.round(1000 * 0.15));
});

test('exactly 20% is not spoiled', () => {
  assert.equal(isSpoiled(FRAGILE.spoiledBelow), false);
  assert.equal(isSpoiled(FRAGILE.spoiledBelow - 0.01), true);
  assert.equal(settleOrder({ ...clock, fragile: true, condition: 20 }).spoiled, false);
});

test('a better condition never pays less than a worse one', () => {
  let last = -1;
  for (let c = 0; c <= 100; c += 1) {
    const { total } = settleOrder({ ...clock, fragile: true, condition: c });
    assert.ok(total >= last, `pay falls at ${c}%`);
    last = total;
  }
});

test('a late fragile order loses the late discount and the condition share', () => {
  const pay = settleOrder({ base: 1000, elapsed: 50, budget: 40, fragile: true, condition: 50 });
  assert.equal(pay.late, true);
  assert.equal(pay.total, Math.round(600 * 0.5));
});

test('the pay is always a whole number', () => {
  for (let c = 0; c <= 100; c += 7) assert.equal(Number.isInteger(settleOrder({ ...clock, base: 850, fragile: true, condition: c }).total), true);
});

test('condition only ever goes down and stops at zero', () => {
  assert.equal(loseCondition(100, 12), 88);
  assert.equal(loseCondition(5, 12), 0);
  assert.equal(loseCondition(50, -10), 50);
  assert.ok(crashConditionLoss(35) > crashConditionLoss(10));
});

test('about the set share of generated orders are fragile, all starting at full condition', () => {
  const graph = createGraph({ nodes: [{ id: 'a', x: 0, z: -400 }, { id: 'b', x: 0, z: 400 }], edges: [{ a: 'a', b: 'b' }] });
  const vendors = [{ id: 'v1', name: 'V', type: 'Food', x: 3, z: 100 }, { id: 'v2', name: 'W', type: 'Parcel', x: 3, z: 140 }];
  const customers = [{ id: 'c1', hint: 'A', x: 3, z: 260 }, { id: 'c2', hint: 'B', x: 3, z: 300 }];
  const rng = createRng(5);
  let fragile = 0;
  const n = 400;
  for (let i = 0; i < n; i += 1) {
    const order = generateOrder({ rng, graph, vendors, customers, from: { x: 0, z: 0 } });
    assert.equal(order.condition, FRAGILE.start);
    if (order.fragile) fragile += 1;
  }
  assert.ok(Math.abs(fragile / n - FRAGILE.chance) < 0.08, `got ${fragile / n}`);
});
