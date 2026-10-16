// Who is playing. The game starts at once with the guest look; start.ng's answer arrives in
// the background and is applied only between shifts, never in the middle of one.

import { GUEST_STYLE } from './config.js';
import { normalizeStyle, playerKey } from './validate.js';
import { whoami } from './startng.js';

const GUEST = Object.freeze({
  id: null, name: 'Guest', account: null, style: normalizeStyle(GUEST_STYLE), face: null, signedIn: false,
});

/**
 * @param {{ onApply: (player: object) => void, canApplyNow: () => boolean }} options
 * @returns {{ player: () => object, refresh: () => Promise<void>, applyPending: () => void }}
 */
export function createProfile({ onApply, canApplyNow }) {
  let player = GUEST;
  let pending = null;
  let asking = false;

  function apply(next) {
    player = next;
    pending = null;
    onApply(next);
  }

  // `focus` and `visibilitychange` often fire together: one question at a time.
  async function refresh() {
    if (asking) return;
    asking = true;
    const next = await whoami();
    asking = false;
    // No answer is the normal local-file path: keep what we have and do not retry in a loop.
    if (!next || playerKey(next) === playerKey(player)) return;
    if (canApplyNow()) apply(next);
    else pending = next;
  }

  onApply(player);
  return {
    player: () => player,
    refresh,
    /** Call at the start of a shift: a waiting character change lands now. */
    applyPending() {
      if (pending) apply(pending);
    },
  };
}
