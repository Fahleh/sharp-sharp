// Keeps the player from being stuck for good: it notices a bike that is getting nowhere (so the
// recover button can be offered) and makes a vehicle that keeps blocking the bike give way. Pure.

import { COLLIDE, SHIFT } from './config.js';
import { contact } from './collide.js';
import { createBlockTracker } from './blocking.js';
import { createStuckDetector } from './stuck.js';

/**
 * @returns {{ stuck: (frame: { dt: number, x: number, z: number, trying: boolean }) => boolean,
 *   touch: (id: string, time: number) => boolean, isGhost: (id: string) => boolean,
 *   release: (frame: { dt: number, time: number, circles: object[], shapes: Array<{ id: string, shape: object }>,
 *   alive: () => Set<string> }) => string[], reset: () => void }}
 *   `touch` says a vehicle has just become a ghost; `release` returns the ghosts that are solid again
 */
export function createJamGuard() {
  const detector = createStuckDetector({
    seconds: SHIFT.stuckSeconds, distance: SHIFT.stuckDistance, holdSeconds: SHIFT.stuckHoldSeconds, sampleSeconds: SHIFT.stuckSampleSeconds,
  });
  const blocks = createBlockTracker({ seconds: COLLIDE.blockSeconds, gapSeconds: COLLIDE.blockGapSeconds, clearSeconds: COLLIDE.blockClearSeconds });
  let sincePrune = 0;

  return {
    stuck: (frame) => detector.update(frame),
    touch: (id, time) => blocks.touch(id, time),
    isGhost: (id) => blocks.isGhost(id),

    // Ghosts turn solid again once the bike has been clear of them for a moment.
    release({
      dt, time, circles, shapes, alive,
    }) {
      sincePrune += dt;
      if (sincePrune >= 1) {
        sincePrune = 0;
        blocks.forget(alive());
      }
      const wide = circles.map((c) => ({ ...c, r: c.r + COLLIDE.blockClearMargin }));
      const near = new Set();
      for (const v of shapes) if (blocks.isGhost(v.id) && wide.some((c) => contact(c, v.shape))) near.add(v.id);
      return blocks.update({ time, near });
    },

    reset() {
      detector.reset();
      blocks.reset();
    },
  };
}
