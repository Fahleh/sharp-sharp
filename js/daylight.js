// The picture's colours and light for a moment of the shift, from golden afternoon to early
// night. Pure: no three.js. It fills and returns one reused object, so asking every frame
// allocates nothing; copy what you need before the next call.

import { DAYLIGHT } from './config.js';

/**
 * @param {string} hex `#rrggbb`
 * @returns {{ r: number, g: number, b: number }} channels from 0 to 1, as written (sRGB)
 */
export function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

const COLOR_KEYS = ['horizon', 'mid', 'zenith', 'fog', 'dirColor', 'hemiSky', 'hemiGround'];
const NUMBER_KEYS = ['dirIntensity', 'hemiIntensity', 'sun', 'glow', 'shade'];

const stops = DAYLIGHT.stops.map((stop) => {
  const parsed = { at: stop.at };
  for (const key of COLOR_KEYS) parsed[key] = hexToRgb(stop[key]);
  for (const key of NUMBER_KEYS) parsed[key] = stop[key];
  return parsed;
});

const out = {};
for (const key of COLOR_KEYS) out[key] = { r: 0, g: 0, b: 0 };
for (const key of NUMBER_KEYS) out[key] = 0;

const smooth = (x) => x * x * (3 - 2 * x);

/**
 * @param {number} progress how far through the shift, 0 to 1 (values outside are clamped)
 * @returns {{ horizon: {r:number,g:number,b:number}, mid: object, zenith: object, fog: object, dirColor: object,
 *   hemiSky: object, hemiGround: object, dirIntensity: number, hemiIntensity: number, sun: number,
 *   glow: number, shade: number }}
 */
export function daylightAt(progress) {
  const p = Math.min(1, Math.max(0, progress));
  let i = 0;
  while (i < stops.length - 2 && p > stops[i + 1].at) i += 1;
  const a = stops[i];
  const b = stops[i + 1];
  const t = smooth(Math.min(1, Math.max(0, (p - a.at) / (b.at - a.at))));
  for (const key of COLOR_KEYS) {
    out[key].r = a[key].r + (b[key].r - a[key].r) * t;
    out[key].g = a[key].g + (b[key].g - a[key].g) * t;
    out[key].b = a[key].b + (b[key].b - a[key].b) * t;
  }
  for (const key of NUMBER_KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
  return out;
}

/**
 * How bright the lamps and headlights are: the evening's own glow, lifted by rain.
 * @param {number} glow from `daylightAt`
 * @param {number} rain 0 to 1
 */
export function lightsGlow(glow, rain) {
  return Math.max(glow, rain * DAYLIGHT.rainGlow);
}
