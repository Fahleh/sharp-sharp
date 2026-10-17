import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY } from '../js/config.js';
import { createQualityGovernor } from '../js/quality.js';

// Feed `seconds` of frames of `ms` each; returns the steps taken, with the time they were taken.
function feed(governor, seconds, ms) {
  const taken = [];
  let t = 0;
  while (t < seconds - 1e-9) {
    const step = governor.frame(ms / 1000);
    t += ms / 1000;
    if (step) taken.push({ step, at: +t.toFixed(2) });
  }
  return taken;
}

test('a game that keeps its frame rate never gives anything up', () => {
  const g = createQualityGovernor();
  assert.deepEqual(feed(g, 120, 16.7), []);
  assert.equal(g.level(), 0);
});

test('slow frames for a full window cost the pixel ratio first', () => {
  const g = createQualityGovernor();
  const taken = feed(g, 10, 30);
  assert.equal(taken[0].step, 'pixelRatio');
  assert.ok(taken[0].at >= QUALITY.windowSeconds - 0.1 && taken[0].at <= QUALITY.windowSeconds + 0.5, `at ${taken[0].at}`);
});

test('nothing is given up before a full window has been measured', () => {
  const g = createQualityGovernor();
  assert.deepEqual(feed(g, QUALITY.windowSeconds - 0.5, 60), []);
});

test('steps come in order, each only after the new state has been measured, and then no more', () => {
  const g = createQualityGovernor();
  const taken = feed(g, 60, 40);
  assert.deepEqual(taken.map((t) => t.step), [...QUALITY.steps]);
  for (let i = 1; i < taken.length; i += 1) assert.ok(taken[i].at - taken[i - 1].at >= QUALITY.settleSeconds - 0.1, 'steps are spaced out');
  assert.equal(g.level(), QUALITY.steps.length);
});

test('detail never comes back, however fast the frames get', () => {
  const g = createQualityGovernor();
  feed(g, 4, 40);
  assert.equal(g.level(), 1);
  assert.deepEqual(feed(g, 120, 8), []);
  assert.equal(g.level(), 1);
});

test('a step that fixes the frame rate stops the slide', () => {
  const g = createQualityGovernor();
  const first = feed(g, QUALITY.windowSeconds + 0.5, 35);
  assert.equal(first.length, 1);
  assert.deepEqual(feed(g, 60, 16.7), []);
  assert.equal(g.level(), 1);
});

test('the average must be above the limit: exactly at it is fine', () => {
  const g = createQualityGovernor();
  assert.deepEqual(feed(g, 30, QUALITY.slowFrameMs), []);
});

test('a few long frames in a fast run do not trigger it', () => {
  const g = createQualityGovernor();
  const taken = [];
  for (let i = 0; i < 60 * 30; i += 1) {
    const step = g.frame((i % 60 === 0 ? 0.1 : 0.0167));
    if (step) taken.push(step);
  }
  assert.deepEqual(taken, []);
});

test('a stall longer than the ignore limit is not counted at all', () => {
  const g = createQualityGovernor();
  feed(g, 2, 16.7);
  assert.equal(g.frame(5), null);
  assert.deepEqual(feed(g, 5, 16.7), []);
});

test('restart forgets the measuring but keeps the steps already taken', () => {
  const g = createQualityGovernor();
  feed(g, 4, 40);
  assert.equal(g.level(), 1);
  g.restart();
  assert.deepEqual(feed(g, QUALITY.windowSeconds - 1, 60), [], 'the window starts over');
  assert.equal(g.level(), 1);
  feed(g, 3, 60);
  assert.equal(g.level(), 2);
});

test('a mix of fast and slow frames is judged on the average, over the window only', () => {
  const g = createQualityGovernor();
  // 10 s of fast frames first, then slow ones: the fast past must not hide the slow present.
  feed(g, 10, 12);
  const taken = feed(g, 8, 45);
  assert.equal(taken[0].step, 'pixelRatio');
});

test('frames of zero length or less are ignored', () => {
  const g = createQualityGovernor();
  assert.equal(g.frame(0), null);
  assert.equal(g.frame(-1), null);
});
