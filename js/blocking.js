// A vehicle that keeps getting in the player's way gives way. When the bike has been pressed
// against the same vehicle for several seconds (touching again and again counts as one long
// block), the vehicle turns into a ghost the bike rides through, until the bike is clear of it.
// Pure: no three.js, no DOM.

/**
 * @param {{ seconds: number, gapSeconds: number, clearSeconds: number }} rules `seconds` of blocking
 *   make a ghost; touches closer together than `gapSeconds` are one block; a ghost turns solid again
 *   once the bike has been away from it for `clearSeconds`
 * @returns {{ touch: (id: string, time: number) => boolean, isGhost: (id: string) => boolean,
 *   update: (frame: { time: number, near: Set<string> }) => string[], forget: (alive: Set<string>) => void,
 *   reset: () => void }}
 */
export function createBlockTracker({ seconds, gapSeconds, clearSeconds }) {
  /** @type {Map<string, { first: number, last: number }>} */
  const chains = new Map();
  /** @type {Map<string, number>} id -> last time the bike was near it */
  const ghosts = new Map();

  return {
    /**
     * The bike touched this vehicle.
     * @returns {boolean} true when this touch is the one that makes it a ghost
     */
    touch(id, time) {
      const chain = chains.get(id);
      if (!chain || time - chain.last > gapSeconds) chains.set(id, { first: time, last: time });
      else chain.last = time;
      if (ghosts.has(id) || time - chains.get(id).first < seconds) return false;
      ghosts.set(id, time);
      return true;
    },

    isGhost(id) {
      return ghosts.has(id);
    },

    /**
     * Call every step with the ids the bike is currently close to.
     * @returns {string[]} ghosts that turned solid again
     */
    update({ time, near }) {
      const released = [];
      for (const [id, lastNear] of ghosts) {
        if (near.has(id)) ghosts.set(id, time);
        else if (time - lastNear >= clearSeconds) {
          ghosts.delete(id);
          chains.delete(id);
          released.push(id);
        }
      }
      return released;
    },

    /** Drop everything about vehicles that no longer exist. */
    forget(alive) {
      for (const id of chains.keys()) if (!alive.has(id)) chains.delete(id);
      for (const id of ghosts.keys()) if (!alive.has(id)) ghosts.delete(id);
    },

    reset() {
      chains.clear();
      ghosts.clear();
    },
  };
}
