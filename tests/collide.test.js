import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bikeCircles, circleVsBox, circleVsCircle, createNearMissTracker, createStaticIndex, deepestContact,
  firstBoxHit, segmentVsBox, surfaceGap,
} from '../js/collide.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);
const circle = (x, z, r) => ({ type: 'circle', x, z, r });
const box = (x, z, hw, hd, angle) => ({ type: 'box', x, z, hw, hd, angle });

test('circle vs circle: overlap gives depth and a normal from the other toward the first', () => {
  const hit = circleVsCircle(circle(1.5, 0, 1), circle(0, 0, 1));
  near(hit.depth, 0.5);
  near(hit.nx, 1);
  near(hit.nz, 0);
});

test('circle vs circle: edge touching is not a contact', () => {
  assert.equal(circleVsCircle(circle(2, 0, 1), circle(0, 0, 1)), null);
  assert.equal(circleVsCircle(circle(3, 0, 1), circle(0, 0, 1)), null);
});

test('circle vs circle at the same point still separates', () => {
  const hit = circleVsCircle(circle(0, 0, 1), circle(0, 0, 1));
  near(hit.depth, 2);
});

test('circle vs box: face contact', () => {
  const hit = circleVsBox(circle(3.5, 0, 0.75), box(0, 0, 3, 2));
  near(hit.depth, 0.25);
  near(hit.nx, 1);
  near(hit.nz, 0);
});

test('circle vs box: corner contact points along the diagonal', () => {
  const hit = circleVsBox(circle(4, 3, 1.5), box(0, 0, 3, 2));
  const d = Math.hypot(1, 1);
  near(hit.depth, 1.5 - d);
  near(hit.nx, 1 / d);
  near(hit.nz, 1 / d);
});

test('circle vs box: touching a face or a corner exactly is not a contact', () => {
  assert.equal(circleVsBox(circle(4, 0, 1), box(0, 0, 3, 2)), null);
  assert.equal(circleVsBox(circle(3, 3, 1), box(0, 0, 3, 2)), null);
});

test('circle vs box: centre inside leaves by the nearest face', () => {
  const hit = circleVsBox(circle(2.5, 0, 0.5), box(0, 0, 3, 2));
  near(hit.nx, 1);
  near(hit.depth, 0.5 + 0.5);
});

test('rotated box: a quarter turn swaps the half extents', () => {
  const rotated = box(0, 0, 3, 1, Math.PI / 2);
  assert.equal(circleVsBox(circle(2.5, 0, 0.4), rotated), null);
  const hit = circleVsBox(circle(0, 2.5, 0.4), rotated);
  assert.ok(hit && hit.depth > 0);
  near(hit.nz, 1);
});

test('rotated box: normals are unit length and follow the box axes', () => {
  const angle = 0.6;
  const hit = circleVsBox(circle(1.2, 0.9, 1), box(0, 0, 1, 0.5, angle));
  near(Math.hypot(hit.nx, hit.nz), 1);
  // A circle out along the box's local +x axis is pushed back along (cos, -sin).
  const side = circleVsBox(circle(1.4 * Math.cos(angle), -1.4 * Math.sin(angle), 0.6), box(0, 0, 1, 0.5, angle));
  near(side.nx, Math.cos(angle));
  near(side.nz, -Math.sin(angle));
  near(side.depth, 0.2);
});

test('surfaceGap is positive when apart, negative when overlapping', () => {
  near(surfaceGap(circle(5, 0, 1), box(0, 0, 3, 2)), 1);
  assert.ok(surfaceGap(circle(3.5, 0, 1), box(0, 0, 3, 2)) < 0);
  near(surfaceGap(circle(5, 0, 1), circle(0, 0, 1)), 3);
});

test('bike circles sit along the heading', () => {
  const [front, rear] = bikeCircles({ x: 10, z: 20, heading: 0 }, { radius: 0.4, circleOffset: 0.5 });
  near(front.z, 20.5);
  near(rear.z, 19.5);
  near(front.x, 10);
  const [sideFront] = bikeCircles({ x: 0, z: 0, heading: Math.PI / 2 }, { radius: 0.4, circleOffset: 0.5 });
  near(sideFront.x, 0.5);
});

test('bike vs static box: the front circle hits a wall the rear does not', () => {
  const wall = box(0, 5, 10, 0.5);
  const circles = bikeCircles({ x: 0, z: 4.1, heading: 0 }, { radius: 0.42, circleOffset: 0.5 });
  const hit = deepestContact(circles, [wall]);
  assert.ok(hit);
  near(hit.nz, -1);
  assert.equal(circleVsBox(circles[1], wall), null);
});

test('deepestContact is null in open ground', () => {
  const circles = bikeCircles({ x: 0, z: 0, heading: 0 }, { radius: 0.42, circleOffset: 0.5 });
  assert.equal(deepestContact(circles, [box(50, 50, 3, 3)]), null);
});

test('static index returns what is near and nothing far', () => {
  const solids = [box(0, 0, 2, 2), box(100, 100, 2, 2), circle(5, 5, 1), box(18, 0, 30, 1)];
  const index = createStaticIndex(solids, 16);
  const found = index.query(0, 0, 3);
  assert.ok(found.includes(solids[0]));
  assert.ok(!found.includes(solids[1]));
  assert.ok(found.includes(solids[3]), 'a long box is found from any cell it spans');
  assert.equal(new Set(found).size, found.length, 'no duplicates');
});

test('static index handles negative coordinates', () => {
  const solids = [box(-40, -40, 2, 2)];
  const index = createStaticIndex(solids, 16);
  assert.equal(index.query(-41, -39, 1).length, 1);
  assert.equal(index.query(40, 40, 1).length, 0);
});

test('segmentVsBox: hit fraction, miss, and start inside', () => {
  const b = box(0, 0, 2, 2);
  near(segmentVsBox({ ax: -6, az: 0, bx: 6, bz: 0 }, b), 4 / 12);
  assert.equal(segmentVsBox({ ax: -6, az: 5, bx: 6, bz: 5 }, b), null);
  assert.equal(segmentVsBox({ ax: 0, az: 0, bx: 6, bz: 0 }, b), 0);
  assert.equal(segmentVsBox({ ax: -6, az: 0, bx: -3, bz: 0 }, b), null);
});

test('firstBoxHit finds the nearest box and ignores circles', () => {
  const solids = [box(0, 10, 3, 1), box(0, 20, 3, 1), circle(0, 5, 1)];
  const index = createStaticIndex(solids, 16);
  const t = firstBoxHit(index, { ax: 0, az: 0, bx: 0, bz: 30 });
  near(t, 9 / 30);
  assert.equal(firstBoxHit(index, { ax: 50, az: 0, bx: 50, bz: 30 }), 1);
});

// ---- near miss
const tracker = () => createNearMissTracker({ maxGap: 1.2, minSpeed: 8, cooldownSeconds: 4 });
const bikeAt = (x, z) => bikeCircles({ x, z, heading: 0 }, { radius: 0.42, circleOffset: 0.5 });
const oncoming = (id, x, z) => ({ id, shape: box(x, z, 0.9, 2.2), vx: 0, vz: -8 });

test('near miss: a close pass at speed counts once', () => {
  const t = tracker();
  const events = t.update({ time: 1, circles: bikeAt(0, 0), velocity: { x: 0, z: 12 }, speed: 12, others: [oncoming('car', 2.4, 6)] });
  assert.equal(events.length, 0, 'gap too wide at first');
  const hit = t.update({ time: 1.1, circles: bikeAt(0, 4), velocity: { x: 0, z: 12 }, speed: 12, others: [oncoming('car', 1.9, 6)] });
  assert.equal(hit.length, 1);
  assert.ok(hit[0].gap > 0 && hit[0].gap < 1.2);
});

test('near miss: below the speed gate nothing counts', () => {
  const t = tracker();
  const events = t.update({ time: 1, circles: bikeAt(0, 4), velocity: { x: 0, z: 7.9 }, speed: 7.9, others: [oncoming('car', 1.9, 6)] });
  assert.equal(events.length, 0);
});

test('near miss: an actual contact is a crash, not a near miss', () => {
  const t = tracker();
  const events = t.update({ time: 1, circles: bikeAt(0, 4), velocity: { x: 0, z: 12 }, speed: 12, others: [oncoming('car', 1.0, 6)] });
  assert.equal(events.length, 0);
});

test('near miss: per-thing cooldown, then it can fire again', () => {
  const t = tracker();
  const frame = (time) => t.update({ time, circles: bikeAt(0, 4), velocity: { x: 0, z: 12 }, speed: 12, others: [oncoming('car', 1.9, 6)] });
  assert.equal(frame(10).length, 1);
  assert.equal(frame(11).length, 0);
  assert.equal(frame(13.9).length, 0);
  assert.equal(frame(14.1).length, 1);
});

test('near miss: another thing is not blocked by the first one\'s cooldown', () => {
  const t = tracker();
  const run = (id, time) => t.update({ time, circles: bikeAt(0, 4), velocity: { x: 0, z: 12 }, speed: 12, others: [oncoming(id, 1.9, 6)] });
  assert.equal(run('a', 10).length, 1);
  assert.equal(run('b', 10.1).length, 1);
});

test('near miss: something pulling away is ignored', () => {
  const t = tracker();
  const away = { id: 'away', shape: box(1.9, 2, 0.9, 2.2), vx: 0, vz: 30 };
  const events = t.update({ time: 1, circles: bikeAt(0, 0), velocity: { x: 0, z: 12 }, speed: 12, others: [away] });
  assert.equal(events.length, 0);
});

test('near miss: reset clears the cooldowns', () => {
  const t = tracker();
  const frame = (time) => t.update({ time, circles: bikeAt(0, 4), velocity: { x: 0, z: 12 }, speed: 12, others: [oncoming('car', 1.9, 6)] });
  frame(1);
  t.reset();
  assert.equal(frame(1.1).length, 1);
});
