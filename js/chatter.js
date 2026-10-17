// Connects what happens on the road to who shouts about it: it asks the banter picker for a
// line when something worth a comment happens, and keeps the bubbles over the speakers.
// It decides no rules; the picker and `lines.js` do.

import { BANTER } from './config.js';

const CUSTOMER_PREFIX = 'customer:';

/**
 * @param {{ game: ReturnType<typeof import('./game.js').createGame>,
 *   banter: ReturnType<typeof import('./banter.js').createBanter>,
 *   bubbles: ReturnType<typeof import('./bubbles.js').createBubbles>,
 *   rng: ReturnType<typeof import('./rng.js').createRng>, terrain: { heightAt: (x: number, z: number) => number } }} parts
 */
export function createChatter({ game, banter, bubbles, rng, terrain }) {
  let sinceCheck = 0;
  // Where each bubble's speaker was last seen, so a bubble finishes in place if they drive away.
  const lastSeen = new Map();
  const customers = new Map();

  const now = () => game.state.elapsed;
  const say = (category, npcId) => banter.request({ category, npcId, time: now() });

  function lift(x, z, height) {
    return { x, y: terrain.heightAt(x, z) + height, z };
  }

  function locate(bubble) {
    const { npcId } = bubble;
    let spot = null;
    if (npcId.startsWith(CUSTOMER_PREFIX)) {
      const at = customers.get(npcId);
      spot = at ? lift(at.x, at.z, BANTER.height.customer) : null;
    } else if (npcId.startsWith('v')) {
      const v = game.traffic.vehicles.find((o) => o.id === npcId);
      spot = v ? lift(v.x, v.z, v.kind === 'danfo' ? BANTER.height.danfo : BANTER.height.vehicle) : null;
    } else {
      const p = game.peds.peds.find((o) => o.id === npcId);
      spot = p ? lift(p.x, p.z, BANTER.height.pedestrian) : null;
    }
    if (spot) lastSeen.set(bubble.id, spot);
    return spot ?? lastSeen.get(bubble.id) ?? null;
  }

  const bikeDistance = (x, z) => Math.hypot(game.state.bike.x - x, game.state.bike.z - z);

  return {
    /** @param {object[]} events from the game */
    handle(events) {
      for (const event of events) {
        switch (event.type) {
          case 'nearmiss':
            // People on foot are covered by the startled lines; this is for drivers.
            if (event.id.startsWith('v')) say(rng.chance(BANTER.impressedShare) ? 'impressed' : 'annoyed', event.id);
            break;
          case 'crash':
            if (event.with) say('collision', event.with);
            break;
          case 'pedhit':
          case 'pedStartled':
            say('pedestrian', event.id);
            break;
          case 'danfoStop':
            if (bikeDistance(event.x, event.z) < BANTER.conductorRange) say('conductor', event.id);
            break;
          case 'delivery': {
            const { customer } = event.order;
            const npcId = `${CUSTOMER_PREFIX}${customer.id}`;
            customers.set(npcId, customer);
            say(event.pay.late ? 'customerLate' : 'customerGood', npcId);
            break;
          }
          default:
            break;
        }
      }
    },

    /** Call once per drawn frame, with the seconds since the last one. */
    update(dt) {
      sinceCheck += dt;
      if (sinceCheck >= BANTER.checkEverySeconds) {
        sinceCheck = 0;
        // A danfo waiting at its stop keeps calling for passengers while the bike is near.
        for (const v of game.traffic.vehicles) {
          if (v.kind === 'danfo' && v.state === 'dwell' && bikeDistance(v.x, v.z) < BANTER.conductorRange) say('conductor', v.id);
        }
      }
      bubbles.update(banter.live(now()), now(), locate);
    },

    /** A new shift: forget cooldowns and clear the bubbles. */
    reset() {
      banter.reset();
      bubbles.clear();
      lastSeen.clear();
      customers.clear();
      sinceCheck = 0;
    },

    /** @param {boolean} on */
    setEnabled(on) {
      banter.setEnabled(on);
      if (!on) bubbles.clear();
    },
  };
}
