import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLLIDE } from '../js/config.js';
import { createBlockTracker } from '../js/blocking.js';

const make = () => createBlockTracker({ seconds: COLLIDE.blockSeconds, gapSeconds: COLLIDE.blockGapSeconds, clearSeconds: COLLIDE.blockClearSeconds });

// Touch `id` every `every` seconds from `from` to `to`; returns the time it became a ghost, or null.
function pressAgainst(tracker, id, from, to, every = 0.4) {
  for (let t = from; t <= to + 1e-9; t += every) if (tracker.touch(id, t)) return t;
  return null;
}

test('one knock is not a block', () => {
  const t = make();
  assert.equal(t.touch('v1', 0), false);
  assert.equal(t.isGhost('v1'), false);
});

test('pressing against a vehicle for the set time makes it a ghost, once', () => {
  const t = make();
  const at = pressAgainst(t, 'v1', 0, 10);
  assert.ok(at !== null && at >= COLLIDE.blockSeconds && at < COLLIDE.blockSeconds + 0.5, `ghost at ${at}`);
  assert.equal(t.isGhost('v1'), true);
  assert.equal(t.touch('v1', at + 0.1), false, 'already a ghost: no second event');
});

test('knocks spaced further apart than the gap are separate, and never add up', () => {
  const t = make();
  assert.equal(pressAgainst(t, 'v1', 0, 60, COLLIDE.blockGapSeconds + 0.5), null);
  assert.equal(t.isGhost('v1'), false);
});

test('a block is counted per vehicle: time against one does not carry over to another', () => {
  const t = make();
  assert.equal(pressAgainst(t, 'a', 0, COLLIDE.blockSeconds - 0.5), null);
  assert.equal(t.touch('b', COLLIDE.blockSeconds - 0.4), false);
  assert.equal(t.isGhost('a'), false);
  assert.equal(t.isGhost('b'), false);
});

test('a ghost turns solid again once the bike has been clear of it long enough', () => {
  const t = make();
  const at = pressAgainst(t, 'v1', 0, 10);
  assert.deepEqual(t.update({ time: at + 0.2, near: new Set(['v1']) }), []);
  assert.deepEqual(t.update({ time: at + 0.2 + COLLIDE.blockClearSeconds - 0.1, near: new Set() }), [], 'just left: still ghost');
  assert.equal(t.isGhost('v1'), true);
  assert.deepEqual(t.update({ time: at + 0.2 + COLLIDE.blockClearSeconds, near: new Set() }), ['v1']);
  assert.equal(t.isGhost('v1'), false);
});

test('staying near a ghost keeps it a ghost however long that takes', () => {
  const t = make();
  const at = pressAgainst(t, 'v1', 0, 10);
  for (let time = at; time < at + 30; time += 0.1) assert.deepEqual(t.update({ time, near: new Set(['v1']) }), []);
  assert.equal(t.isGhost('v1'), true);
});

test('after it is solid again a fresh block starts from nothing', () => {
  const t = make();
  const at = pressAgainst(t, 'v1', 0, 10);
  t.update({ time: at + 5, near: new Set() });
  t.update({ time: at + 6, near: new Set() });
  assert.equal(t.isGhost('v1'), false);
  assert.equal(t.touch('v1', at + 7), false);
});

test('vehicles that no longer exist are forgotten', () => {
  const t = make();
  pressAgainst(t, 'v1', 0, 10);
  t.forget(new Set(['v2']));
  assert.equal(t.isGhost('v1'), false);
});

test('reset forgets every block and ghost', () => {
  const t = make();
  pressAgainst(t, 'v1', 0, 10);
  t.reset();
  assert.equal(t.isGhost('v1'), false);
});
