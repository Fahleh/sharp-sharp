import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANTER } from '../js/config.js';
import { createBanter } from '../js/banter.js';
import { LINES } from '../js/lines.js';
import { createRng } from '../js/rng.js';

const make = (seed = 1, lines = LINES) => createBanter({ rng: createRng(seed), lines, rules: BANTER });

test('lines and categories agree, and every line is short, plain text', () => {
  assert.deepEqual(Object.keys(LINES).sort(), Object.keys(BANTER.categories).sort());
  for (const [category, lines] of Object.entries(LINES)) {
    assert.ok(lines.length >= 2, `${category} has some choice`);
    assert.equal(new Set(lines).size, lines.length, `${category} has no duplicates`);
    for (const text of lines) {
      assert.ok(text.length > 0 && text.length <= 40, `"${text}" is ${text.length} characters`);
      assert.doesNotMatch(text, /[<>&{}\\]/, `"${text}" has markup characters`);
      assert.doesNotMatch(text, /\d/, `"${text}" has digits`);
    }
  }
});

test('lines keep to the content rules: no religion, no gendered address, no brands, no violence or insults', () => {
  const words = /\b(god|allah|jesus|church|mosque|pastor|imam|madam|sir|aunty|uncle|brother|sister|coca|pepsi|mtn|glo|airtel|dangote|shoprite|jumia|uber|bolt|kill|murder|shoot|dead|blood|stupid|idiot|fool|mad)\b/i;
  for (const lines of Object.values(LINES)) for (const text of lines) assert.doesNotMatch(text, words, text);
});

test('every spoken line comes from the category that was asked for', () => {
  const banter = make(2);
  let time = 0;
  for (const category of Object.keys(LINES)) {
    for (let i = 0; i < 40; i += 1) {
      time += 20;
      const bubble = banter.request({ category, npcId: `n${i}`, time });
      assert.ok(bubble, `${category} ${i}`);
      assert.ok(LINES[category].includes(bubble.text));
      assert.equal(bubble.category, category);
    }
  }
});

test('an unknown category says nothing', () => {
  const banter = make();
  assert.equal(banter.request({ category: 'nonsense', npcId: 'a', time: 0 }), null);
  assert.equal(banter.request({ category: '__proto__', npcId: 'a', time: 0 }), null);
});

test('the same line is never said twice in a row in a category', () => {
  const banter = make(3);
  let last = null;
  for (let i = 0; i < 200; i += 1) {
    const bubble = banter.request({ category: 'collision', npcId: `v${i}`, time: i * 10 });
    assert.notEqual(bubble.text, last);
    last = bubble.text;
  }
  // A category with a single line may repeat it: there is nothing else to say.
  const lone = make(4, { ...LINES, customerLate: ['Only one.'] });
  assert.equal(lone.request({ category: 'customerLate', npcId: 'a', time: 0 }).text, 'Only one.');
  assert.equal(lone.request({ category: 'customerLate', npcId: 'b', time: 10 }).text, 'Only one.');
});

test('one speaker is quiet for the per-NPC cooldown, then may talk again', () => {
  const banter = make(5);
  assert.ok(banter.request({ category: 'annoyed', npcId: 'v1', time: 100 }));
  assert.equal(banter.request({ category: 'collision', npcId: 'v1', time: 100 + BANTER.npcCooldownSeconds - 0.1 }), null);
  assert.ok(banter.request({ category: 'annoyed', npcId: 'v1', time: 100 + BANTER.npcCooldownSeconds + 0.01 }));
});

test('the global cooldown holds back equal or quieter lines, but not a louder one', () => {
  const banter = make(6);
  assert.ok(banter.request({ category: 'conductor', npcId: 'a', time: 50 }));
  assert.equal(banter.request({ category: 'conductor', npcId: 'b', time: 50.5 }), null, 'same priority, too soon');
  assert.ok(banter.request({ category: 'collision', npcId: 'c', time: 50.6 }), 'a collision cuts across');
  assert.equal(banter.request({ category: 'annoyed', npcId: 'd', time: 50.9 }), null, 'quieter than the collision');
  assert.ok(banter.request({ category: 'conductor', npcId: 'e', time: 50.6 + BANTER.globalCooldownSeconds + 0.01 }));
});

test('at most four bubbles at once, and a louder event replaces the quietest', () => {
  // With the real 2.2 s duration the cooldowns keep it under the cap, so lengthen bubbles to test the cap itself.
  const banter = createBanter({ rng: createRng(7), lines: LINES, rules: { ...BANTER, durationSeconds: 30 } });
  const t = 200;
  const said = [];
  for (let i = 0; i < 4; i += 1) said.push(banter.request({ category: 'conductor', npcId: `c${i}`, time: t + i * (BANTER.globalCooldownSeconds + 0.01) }));
  assert.ok(said.every(Boolean));
  const now = t + 3 * (BANTER.globalCooldownSeconds + 0.01) + 0.1;
  assert.equal(banter.live(now).length, BANTER.maxLive);
  // Full, and not important enough.
  assert.equal(banter.request({ category: 'conductor', npcId: 'late', time: now + BANTER.globalCooldownSeconds }), null);
  assert.equal(banter.live(now + 0.1).length, BANTER.maxLive);
  // A collision takes the oldest quiet slot.
  const loud = banter.request({ category: 'collision', npcId: 'bang', time: now + 0.2 });
  assert.ok(loud);
  const after = banter.live(now + 0.2);
  assert.equal(after.length, BANTER.maxLive);
  assert.ok(after.includes(loud));
  assert.equal(after.includes(said[0]), false, 'the oldest quiet one made room');
});

test('bubbles end after their duration', () => {
  const banter = make(8);
  const bubble = banter.request({ category: 'impressed', npcId: 'a', time: 10 });
  assert.equal(banter.live(10 + BANTER.durationSeconds - 0.01).length, 1);
  assert.equal(banter.live(10 + BANTER.durationSeconds + 0.01).length, 0);
  assert.equal(bubble.until, 10 + BANTER.durationSeconds);
});

test('switched off, nothing is said and nothing shows; switched on, it works again', () => {
  const banter = make(9);
  banter.request({ category: 'conductor', npcId: 'a', time: 0 });
  banter.setEnabled(false);
  assert.equal(banter.live(0.5).length, 0);
  assert.equal(banter.request({ category: 'collision', npcId: 'b', time: 30 }), null);
  banter.setEnabled(true);
  assert.ok(banter.request({ category: 'collision', npcId: 'b', time: 60 }));
});

test('reset forgets cooldowns, so a new shift starts fresh', () => {
  const banter = make(10);
  banter.request({ category: 'conductor', npcId: 'a', time: 5 });
  banter.reset();
  assert.equal(banter.live(5.1).length, 0);
  assert.ok(banter.request({ category: 'conductor', npcId: 'a', time: 5.2 }));
});

test('the same seed picks the same lines', () => {
  const run = (seed) => {
    const banter = make(seed);
    return Array.from({ length: 30 }, (_, i) => banter.request({ category: 'annoyed', npcId: `n${i}`, time: i * 20 }).text);
  };
  assert.deepEqual(run(11), run(11));
  assert.notDeepEqual(run(11), run(12));
});
