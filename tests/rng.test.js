import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randomSeed } from '../js/rng.js';

test('same seed gives the same sequence, different seeds differ', () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const seqA = Array.from({ length: 20 }, () => a.next());
  const seqB = Array.from({ length: 20 }, () => b.next());
  const seqC = Array.from({ length: 20 }, () => c.next());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
});

test('next stays in [0, 1)', () => {
  const rng = createRng(7);
  for (let i = 0; i < 5000; i += 1) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1);
  }
});

test('range, int and pick respect their bounds', () => {
  const rng = createRng(99);
  const items = ['a', 'b', 'c'];
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const r = rng.range(5, 10);
    assert.ok(r >= 5 && r < 10);
    const n = rng.int(2, 4);
    assert.ok(Number.isInteger(n) && n >= 2 && n <= 4);
    seen.add(rng.pick(items));
  }
  assert.equal(seen.size, 3);
});

test('int reaches both ends', () => {
  const rng = createRng(1);
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(rng.int(0, 2));
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});

test('chance(0) never and chance(1) always', () => {
  const rng = createRng(5);
  for (let i = 0; i < 200; i += 1) {
    assert.equal(rng.chance(0), false);
    assert.equal(rng.chance(1), true);
  }
});

test('randomSeed returns an unsigned 32-bit integer', () => {
  const seed = randomSeed();
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
});
