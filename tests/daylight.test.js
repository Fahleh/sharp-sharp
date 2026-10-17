import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYLIGHT } from '../js/config.js';
import { daylightAt, lightsGlow } from '../js/daylight.js';

const copy = (p) => JSON.parse(JSON.stringify(daylightAt(p)));
const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

test('every stop is hit exactly at its moment', () => {
  for (const stop of DAYLIGHT.stops) {
    const got = copy(stop.at);
    for (const key of ['glow', 'dirIntensity', 'sun', 'hemiIntensity', 'shade']) {
      assert.ok(Math.abs(got[key] - stop[key]) < 1e-9, `${key} at ${stop.at}`);
    }
  }
});

test('progress outside 0 to 1 is clamped to the first and last stop', () => {
  assert.deepEqual(copy(-3), copy(0));
  assert.deepEqual(copy(9), copy(1));
});

test('the lights are off in the first part of the shift and on at the end', () => {
  assert.equal(daylightAt(0).glow, 0);
  assert.equal(daylightAt(0.3).glow, 0);
  assert.equal(daylightAt(1).glow, 1);
});

test('the lights come on in the second half: not before it, and rising after', () => {
  assert.ok(daylightAt(0.45).glow < 0.1);
  let last = -1;
  for (let p = 0.4; p <= 1; p += 0.01) {
    const g = daylightAt(p).glow;
    assert.ok(g >= last - 1e-9, `glow falls at ${p}`);
    last = g;
  }
});

test('the light and the sky only get darker as the shift goes on', () => {
  let sun = Infinity;
  let sky = Infinity;
  for (let p = 0; p <= 1; p += 0.01) {
    const d = daylightAt(p);
    assert.ok(d.dirIntensity <= sun + 1e-9, `sun light rises at ${p}`);
    assert.ok(luma(d.zenith) <= sky + 1e-9, `zenith brightens at ${p}`);
    sun = d.dirIntensity;
    sky = luma(d.zenith);
  }
});

test('every colour channel stays a valid 0 to 1 value', () => {
  for (let p = 0; p <= 1; p += 0.02) {
    const d = daylightAt(p);
    for (const key of ['horizon', 'mid', 'zenith', 'fog', 'dirColor', 'hemiSky', 'hemiGround']) {
      for (const channel of ['r', 'g', 'b']) assert.ok(d[key][channel] >= 0 && d[key][channel] <= 1);
    }
  }
});

test('asking again reuses one object, so a frame allocates nothing', () => {
  assert.equal(daylightAt(0.2), daylightAt(0.8));
});

test('rain turns the lamps on partly even in daylight, and never dims them', () => {
  assert.equal(lightsGlow(0, 0), 0);
  assert.equal(lightsGlow(0, 1), DAYLIGHT.rainGlow);
  assert.equal(lightsGlow(1, 1), 1);
  assert.equal(lightsGlow(0.8, 0.2), 0.8);
});
