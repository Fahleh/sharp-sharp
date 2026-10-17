import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIKE, SHIFT, WEATHER } from '../js/config.js';
import { createRng } from '../js/rng.js';
import { createWeather, gripFor, planRain, rainAt } from '../js/weather.js';

test('rain starts between 40% and 70% of the shift and lasts its set time, for any seed', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const { start, end } = planRain(createRng(seed));
    assert.ok(start >= WEATHER.startMin * SHIFT.seconds && start <= WEATHER.startMax * SHIFT.seconds, `seed ${seed}`);
    assert.ok(Math.abs(end - start - WEATHER.seconds) < 1e-9);
    assert.ok(end <= SHIFT.seconds, 'the rain ends before the shift does');
  }
});

test('the same seed plans the same rain', () => {
  assert.deepEqual(planRain(createRng(7)), planRain(createRng(7)));
});

test('rain ramps in and out and is dry outside the event', () => {
  const plan = { start: 100, end: 145 };
  assert.equal(rainAt(plan, 99), 0);
  assert.equal(rainAt(plan, 100), 0);
  assert.ok(rainAt(plan, 103) > 0 && rainAt(plan, 103) < 1);
  assert.equal(rainAt(plan, 122), 1);
  assert.ok(rainAt(plan, 143) < 1 && rainAt(plan, 143) > 0);
  assert.equal(rainAt(plan, 145), 0);
  assert.equal(rainAt(plan, 250), 0);
});

test('grip is dry at 0 wetness, the wet value at 1, and falls steadily between', () => {
  assert.equal(gripFor(0), BIKE.gripDry);
  assert.equal(gripFor(1), WEATHER.gripWet);
  assert.ok(gripFor(0.5) < gripFor(0.25));
  assert.equal(gripFor(5), WEATHER.gripWet, 'wetness above 1 is clamped');
});

function runShift(seed) {
  const weather = createWeather({ rng: createRng(seed) });
  const events = [];
  const wet = [];
  for (let t = 0; t < SHIFT.seconds; t += 1 / 60) {
    events.push(...weather.step(1 / 60, t).map((e) => e.type));
    wet.push(weather.wet);
  }
  return { events, wet, weather };
}

test('a shift has exactly one rain start and one rain end, in order', () => {
  const { events } = runShift(3);
  assert.deepEqual(events, ['rainStart', 'rainEnd']);
});

test('the road is soaked in the rain, then dries slowly after it stops', () => {
  const weather = createWeather({ rng: createRng(3) });
  const { start, end } = weather.plan;
  let atPeak = 0;
  let afterRain = 0;
  let muchLater = 0;
  for (let t = 0; t < SHIFT.seconds; t += 1 / 60) {
    weather.step(1 / 60, t);
    if (t >= start + 20 && t < start + 20 + 1 / 60) atPeak = weather.wet;
    if (t >= end + 5 && t < end + 5 + 1 / 60) afterRain = weather.wet;
    muchLater = weather.wet;
  }
  assert.ok(atPeak > 0.99, 'fully wet in the middle of the rain');
  assert.ok(afterRain > 0.3, 'still damp five seconds after the rain stops');
  assert.ok(muchLater < afterRain, 'it dries');
});

test('wetness never leaves 0 to 1', () => {
  const { wet } = runShift(11);
  assert.ok(wet.every((w) => w >= 0 && w <= 1));
});
