// Who gets to speak, and when. Pure: no three.js, no DOM.
// Picks a line from the right category, never the same line twice in a row for a category,
// and keeps the chatter in check: a cooldown per speaker, a global cooldown, at most a few
// bubbles at once, and the loudest event wins when there is no room.

/**
 * @typedef {{ id: number, npcId: string, text: string, category: string, priority: number,
 *   from: number, until: number }} Bubble
 */

/**
 * @param {{ rng: ReturnType<typeof import('./rng.js').createRng>, lines: Record<string, readonly string[]>,
 *   rules: { npcCooldownSeconds: number, globalCooldownSeconds: number, maxLive: number, durationSeconds: number,
 *   priorities: Record<string, number>, categories: Record<string, string> } }} input
 */
export function createBanter({ rng, lines, rules }) {
  /** @type {Bubble[]} */
  let live = [];
  let nextId = 1;
  let lastTime = -Infinity;
  let lastPriority = 0;
  let enabled = true;
  const lastByNpc = new Map();
  const lastTextByCategory = new Map();

  const prune = (time) => {
    live = live.filter((b) => b.until > time);
  };

  return {
    /**
     * Ask for a line to be said.
     * @param {{ category: string, npcId: string, time: number }} request
     * @returns {Bubble|null} the new bubble, or null when it is not allowed or there is no room
     */
    request({ category, npcId, time }) {
      if (!enabled) return null;
      // Own properties only, so a category named like an Object method is just unknown.
      if (!Object.hasOwn(lines, category) || !Object.hasOwn(rules.categories, category)) return null;
      const pool = lines[category];
      const kind = rules.categories[category];
      if (!Array.isArray(pool) || pool.length === 0) return null;
      const priority = rules.priorities[kind];
      prune(time);

      const spoke = lastByNpc.get(npcId);
      if (spoke !== undefined && time - spoke < rules.npcCooldownSeconds) return null;
      // A louder event may cut across the global cooldown; an equal or quieter one may not.
      if (time - lastTime < rules.globalCooldownSeconds && priority <= lastPriority) return null;

      if (live.length >= rules.maxLive) {
        const quietest = live.reduce((a, b) => (b.priority < a.priority || (b.priority === a.priority && b.from < a.from) ? b : a));
        if (priority <= quietest.priority) return null;
        live = live.filter((b) => b !== quietest);
      }

      const last = lastTextByCategory.get(category);
      const choices = pool.length > 1 ? pool.filter((text) => text !== last) : pool;
      const text = rng.pick(choices);
      lastTextByCategory.set(category, text);
      lastByNpc.set(npcId, time);
      lastTime = time;
      lastPriority = priority;
      const bubble = { id: nextId, npcId, text, category, priority, from: time, until: time + rules.durationSeconds };
      nextId += 1;
      live.push(bubble);
      return bubble;
    },

    /** Bubbles still showing at `time`. */
    live(time) {
      prune(time);
      return live;
    },

    /** Switch chatter on or off. Off clears what is showing and refuses new lines. */
    setEnabled(value) {
      enabled = value;
      if (!enabled) live = [];
    },

    /** Forget everything, for a new shift. */
    reset() {
      live = [];
      lastTime = -Infinity;
      lastPriority = 0;
      lastByNpc.clear();
      lastTextByCategory.clear();
    },
  };
}
