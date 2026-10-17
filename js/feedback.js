// Turns game events into sound and rider body-language. It reads events and decides no rules.

import { BIKE, RIDER } from './config.js';

/**
 * @param {{ audio: ReturnType<typeof import('./audio.js').createAudio>,
 *   rider: ReturnType<typeof import('./rider.js').createRider> }} parts
 * @returns {{ handle: (events: object[]) => void,
 *   update: (frame: { speed: number, throttle: number, playing: boolean }) => void }}
 */
export function createFeedback({ audio, rider }) {
  return {
    /** @param {object[]} events from `game.step` or `game.start` */
    handle(events) {
      for (const event of events) {
        switch (event.type) {
          case 'pickup':
            audio.chime('pickup');
            rider.react('hop');
            break;
          case 'delivery':
            audio.chime('delivery');
            rider.react('pump');
            break;
          case 'crash':
            audio.crash(event.damage / BIKE.damageMax);
            if (event.damage >= RIDER.react.hardCrashDamage) rider.react('stumble');
            break;
          case 'pedhit':
            audio.bump();
            break;
          case 'nearmiss':
            audio.nearMiss();
            break;
          case 'honk':
            audio.horn();
            break;
          case 'gameover':
            audio.chime('over');
            break;
          default:
            break;
        }
      }
    },

    /** Call once per drawn frame. */
    update({ speed, throttle, playing }) {
      audio.engine({ speedRatio: Math.min(1, Math.max(0, speed / BIKE.topSpeed)), throttle, playing });
    },
  };
}
