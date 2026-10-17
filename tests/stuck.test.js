import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIFT } from '../js/config.js';
import { createStuckDetector } from '../js/stuck.js';

const DT = 1 / 60;
const make = () => createStuckDetector({
  seconds: SHIFT.stuckSeconds, distance: SHIFT.stuckDistance, holdSeconds: SHIFT.stuckHoldSeconds, sampleSeconds: SHIFT.stuckSampleSeconds,
});

// Feed `seconds` of frames; `path(t)` gives the position at time t.
function feed(detector, seconds, path, trying = true) {
  let verdict = false;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    const t = i * DT;
    const [x, z] = path(t);
    verdict = detector.update({ dt: DT, x, z, trying });
  }
  return verdict;
}

test('a bike that is not moving while the player tries to go is stuck after the window', () => {
  const d = make();
  assert.equal(feed(d, SHIFT.stuckSeconds - 0.5, () => [10, 10]), false);
  assert.equal(feed(d, 1, () => [10, 10]), true);
});

test('riding along at a modest pace is never stuck', () => {
  const d = make();
  let any = false;
  for (let i = 0; i < 600; i += 1) any = d.update({ dt: DT, x: 3 * i * DT, z: 0, trying: true }) || any;
  assert.equal(any, false);
});

test('walking pace for a long time is not stuck while it goes somewhere', () => {
  const d = make();
  const pace = (SHIFT.stuckDistance / SHIFT.stuckSeconds) * 1.5;
  let any = false;
  for (let i = 0; i < 900; i += 1) any = d.update({ dt: DT, x: pace * i * DT, z: 0, trying: true }) || any;
  assert.equal(any, false);
});

test('bouncing back and forth on the spot is stuck, whatever the speed', () => {
  const d = make();
  const verdict = feed(d, SHIFT.stuckSeconds + 1, (t) => [Math.sin(t * 6) * 1.2, 0]);
  assert.equal(verdict, true);
});

test('going nowhere is not stuck when the player is not trying to go', () => {
  const d = make();
  assert.equal(feed(d, SHIFT.stuckSeconds + 3, () => [0, 0], false), false);
});

test('time spent not trying does not count toward being stuck', () => {
  const d = make();
  feed(d, SHIFT.stuckSeconds + 1, () => [0, 0], false);
  assert.equal(feed(d, SHIFT.stuckSeconds - 0.6, () => [0, 0]), false);
  assert.equal(feed(d, 1, () => [0, 0]), true);
});

test('the verdict holds for a moment after the bike gets going, then clears', () => {
  const d = make();
  feed(d, SHIFT.stuckSeconds + 0.5, () => [0, 0]);
  assert.equal(d.update({ dt: DT, x: 5, z: 0, trying: true }), true);
  assert.equal(feed(d, SHIFT.stuckHoldSeconds + SHIFT.stuckSeconds + 0.5, (t) => [10 + 5 * t, 0]), false);
});

test('reset forgets the history', () => {
  const d = make();
  feed(d, SHIFT.stuckSeconds + 1, () => [0, 0]);
  d.reset();
  assert.equal(d.update({ dt: DT, x: 0, z: 0, trying: true }), false);
  assert.equal(feed(d, SHIFT.stuckSeconds - 0.6, () => [0, 0]), false);
});

test('a slow frame rate gives the same verdict', () => {
  const d = make();
  let verdict = false;
  for (let i = 0; i < 40; i += 1) verdict = d.update({ dt: 0.1, x: 0, z: 0, trying: true });
  assert.equal(verdict, true);
});
