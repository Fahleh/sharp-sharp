import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDERS } from '../js/config.js';
import { createStaticIndex } from '../js/collide.js';
import { createGame } from '../js/game.js';
import { generateOffers } from '../js/orders.js';
import { createRng } from '../js/rng.js';
import { createGraph } from '../js/route.js';

const DT = 1 / 60;
const IDLE = { throttle: 0, brake: 0, steer: 0 };
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

function make(world = { vendors, customers }) {
  const game = createGame({
    terrain, index: createStaticIndex([], 16), graph, ...world, stops: [], populated: false, spawn: { x: 0, z: 0, heading: 0 },
  });
  game.start(8);
  return game;
}

function run(game, seconds) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) events.push(...game.step(DT, IDLE));
  return events;
}

const put = (game, spot) => Object.assign(game.state.bike, { x: spot.x, z: spot.z, speed: 0 });

function deliverFirst(game) {
  const first = game.state.order;
  put(game, first.vendor);
  run(game, 0.05);
  put(game, first.customer);
  return run(game, 0.05);
}

test('the first order of a shift is given, not offered', () => {
  const game = make();
  assert.ok(game.state.order);
  assert.equal(game.state.offers, null);
});

test('after a delivery two orders from different vendors are offered and none is active', () => {
  const game = make();
  const first = game.state.order.vendor.id;
  const events = deliverFirst(game);
  const offered = events.find((e) => e.type === 'offers');
  assert.ok(offered);
  assert.equal(offered.offers.length, 2);
  assert.notEqual(offered.offers[0].vendor.id, offered.offers[1].vendor.id);
  assert.ok(offered.offers.every((o) => o.vendor.id !== first && o.stage === 'pickup'));
  assert.equal(game.state.order, null);
  assert.ok(game.state.offerLeft > ORDERS.offerSeconds - 0.1 && game.state.offerLeft <= ORDERS.offerSeconds);
});

test('choosing an offer makes it the active order and clears the others', () => {
  const game = make();
  deliverFirst(game);
  const [, second] = game.state.offers;
  const events = game.chooseOffer(1);
  assert.equal(game.state.order.vendor.id, second.vendor.id);
  assert.equal(game.state.offers, null);
  assert.deepEqual(events.map((e) => e.type), ['order']);
});

test('waiting out the timer takes the first offer', () => {
  const game = make();
  deliverFirst(game);
  const [firstOffer] = game.state.offers;
  assert.deepEqual(run(game, ORDERS.offerSeconds - 1).filter((e) => e.type === 'order'), []);
  assert.equal(game.state.order, null);
  const events = run(game, 1.2);
  assert.equal(events.filter((e) => e.type === 'order').length, 1);
  assert.equal(game.state.order.vendor.id, firstOffer.vendor.id);
  assert.equal(game.state.offers, null);
});

test('the timer stands still while paused', () => {
  const game = make();
  deliverFirst(game);
  const before = game.state.offerLeft;
  game.setPaused(true);
  run(game, ORDERS.offerSeconds * 2);
  assert.ok(game.state.offers);
  assert.equal(game.state.offerLeft, before);
});

test('choosing with nothing on offer, or a bad number, does nothing', () => {
  const game = make();
  const order = game.state.order;
  assert.deepEqual(game.chooseOffer(0), []);
  assert.equal(game.state.order, order);
  deliverFirst(game);
  for (const bad of [-1, 2, 1.5, NaN, undefined]) assert.deepEqual(game.chooseOffer(bad), []);
  assert.ok(game.state.offers);
});

test('an offer can only be taken once', () => {
  const game = make();
  deliverFirst(game);
  game.chooseOffer(0);
  const taken = game.state.order;
  assert.deepEqual(game.chooseOffer(1), []);
  assert.equal(game.state.order, taken);
});

test('with only one order left to give, it is simply assigned', () => {
  const game = make({ vendors: vendors.slice(0, 2), customers });
  const events = deliverFirst(game);
  assert.equal(events.some((e) => e.type === 'offers'), false);
  assert.ok(game.state.order);
});

test('the offers come from where the bike is, and a pickup leg is in range', () => {
  const offers = generateOffers({
    rng: createRng(4), graph, vendors, customers, from: { x: 0, z: 0 }, lastVendorId: null, lastCustomerId: null,
  });
  assert.equal(offers.length, 2);
  assert.ok(offers.every((o) => o.pickupMeters > 0 && o.meters > 0 && o.base % 50 === 0));
});

test('no offers when there is nobody to ask', () => {
  assert.deepEqual(generateOffers({ rng: createRng(1), graph, vendors: [], customers, from: { x: 0, z: 0 } }), []);
});
