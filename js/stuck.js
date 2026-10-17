// Is the bike stuck? Not "slow": a bike that keeps bumping a stopped vehicle bounces about at
// walking pace without getting anywhere. Stuck means the player is trying to go and the bike's
// net displacement over the last few seconds is small. Pure: no three.js, no DOM.

/**
 * @param {{ seconds: number, distance: number, holdSeconds: number, sampleSeconds: number }} rules
 *   `seconds` is the look-back window, `distance` the net movement under which the bike counts as
 *   stuck, `holdSeconds` how long the verdict stays after the movement resumes (so a button does
 *   not flicker away under a thumb), `sampleSeconds` how often a position is remembered
 * @returns {{ update: (frame: { dt: number, x: number, z: number, trying: boolean }) => boolean, reset: () => void }}
 */
export function createStuckDetector({
  seconds, distance, holdSeconds, sampleSeconds,
}) {
  const capacity = Math.ceil(seconds / sampleSeconds) + 2;
  const xs = new Float64Array(capacity);
  const zs = new Float64Array(capacity);
  const times = new Float64Array(capacity);
  let count = 0;
  let head = 0;
  let clock = 0;
  let sinceSample = Infinity;
  let hold = 0;

  const clear = () => {
    count = 0;
    head = 0;
    sinceSample = Infinity;
  };

  return {
    /** Call every step. Returns true while the bike counts as stuck. */
    update({ dt, x, z, trying }) {
      clock += dt;
      hold = Math.max(0, hold - dt);
      if (!trying) {
        // Not asking the bike to go: whatever it does, it is not stuck.
        clear();
        return hold > 0;
      }
      sinceSample += dt;
      if (sinceSample >= sampleSeconds) {
        sinceSample = 0;
        const slot = (head + count) % capacity;
        xs[slot] = x;
        zs[slot] = z;
        times[slot] = clock;
        if (count < capacity) count += 1;
        else head = (head + 1) % capacity;
      }
      // The oldest remembered position must be at least a full window old to judge anything.
      while (count > 1 && clock - times[(head + 1) % capacity] >= seconds) {
        head = (head + 1) % capacity;
        count -= 1;
      }
      if (count > 0 && clock - times[head] >= seconds - sampleSeconds / 2) {
        if (Math.hypot(x - xs[head], z - zs[head]) < distance) hold = holdSeconds;
      }
      return hold > 0;
    },
    reset() {
      clear();
      hold = 0;
    },
  };
}
