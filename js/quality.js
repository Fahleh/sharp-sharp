// Decides when the game should give up detail to keep its frame rate. Pure: it is fed frame
// times and says which step to take; applying the step is the renderer's job. Steps are taken in
// the order of `QUALITY.steps`, one at a time, and never undone.

import { QUALITY } from './config.js';

/**
 * @param {{ slowFrameMs?: number, windowSeconds?: number, settleSeconds?: number, ignoreFrameMs?: number,
 *   sliceSeconds?: number, steps?: readonly string[] }} [rules] defaults come from `QUALITY`
 * @returns {{ frame: (seconds: number) => string|null, level: () => number, restart: () => void }}
 *   `frame` takes the duration of the frame just drawn and returns the step to take now, or null;
 *   `restart` forgets the measuring so far (call it when play pauses or resumes), never the steps taken
 */
export function createQualityGovernor({
  slowFrameMs = QUALITY.slowFrameMs,
  windowSeconds = QUALITY.windowSeconds,
  settleSeconds = QUALITY.settleSeconds,
  ignoreFrameMs = QUALITY.ignoreFrameMs,
  sliceSeconds = QUALITY.sliceSeconds,
  steps = QUALITY.steps,
} = {}) {
  const sliceCount = Math.round(windowSeconds / sliceSeconds);
  const sums = new Float64Array(sliceCount);
  const counts = new Float64Array(sliceCount);
  let slice = 0;
  let sliceTime = 0;
  // Seconds measured since the last step (or restart); judging starts once a full window is in.
  let measured = 0;
  let taken = 0;

  const wipe = () => {
    sums.fill(0);
    counts.fill(0);
    slice = 0;
    sliceTime = 0;
    measured = 0;
  };

  return {
    frame(seconds) {
      // A stall (a hidden tab, a pause, a shader compile) says nothing about the steady frame rate.
      if (seconds * 1000 > ignoreFrameMs || seconds <= 0) return null;
      sums[slice] += seconds;
      counts[slice] += 1;
      sliceTime += seconds;
      measured += seconds;
      if (sliceTime >= sliceSeconds) {
        slice = (slice + 1) % sliceCount;
        sums[slice] = 0;
        counts[slice] = 0;
        sliceTime = 0;
      }
      if (taken >= steps.length || measured < Math.max(windowSeconds, settleSeconds)) return null;
      let total = 0;
      let n = 0;
      for (let i = 0; i < sliceCount; i += 1) {
        total += sums[i];
        n += counts[i];
      }
      if (n === 0 || (total / n) * 1000 <= slowFrameMs) return null;
      const step = steps[taken];
      taken += 1;
      wipe();
      return step;
    },
    level() {
      return taken;
    },
    restart: wipe,
  };
}
