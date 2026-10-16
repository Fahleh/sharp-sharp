// Seeded random numbers (mulberry32). Every random choice in the sim goes through one of
// these so a test or a bug report can replay it from the seed.

/**
 * @param {number} seed any integer; the same seed gives the same sequence
 * @returns {{ next: () => number, range: (min: number, max: number) => number,
 *   int: (min: number, max: number) => number, pick: <T>(items: readonly T[]) => T,
 *   chance: (p: number) => boolean }}
 */
export function createRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max], both ends included. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  };
}

/** A fresh seed for a new shift. Not used inside the sim itself. */
export function randomSeed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}
