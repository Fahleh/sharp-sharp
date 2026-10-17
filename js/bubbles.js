// Speech bubbles: a small pool of DOM elements placed over whoever is talking. Text goes in with
// textContent only. The pool is as big as the most bubbles allowed at once, so nothing is created
// or removed while playing.

import { Vector3 } from 'three';
import { BANTER } from './config.js';

/**
 * @param {{ container: HTMLElement, camera: import('three').PerspectiveCamera }} input
 * @returns {{ update: (bubbles: object[], time: number, locate: (bubble: object) => ({ x: number, y: number, z: number }|null)) => void,
 *   clear: () => void }}
 */
export function createBubbles({ container, camera }) {
  const slots = Array.from({ length: BANTER.maxLive }, () => {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.hidden = true;
    container.append(el);
    return { el, shown: null };
  });
  const point = new Vector3();

  function hide(slot) {
    if (!slot.el.hidden) slot.el.hidden = true;
    slot.shown = null;
  }

  return {
    /**
     * @param {Array<{ id: number, text: string, until: number }>} bubbles
     * @param {number} time game clock, seconds
     * @param {(bubble: object) => ({ x: number, y: number, z: number }|null)} locate where the speaker's head is
     */
    update(bubbles, time, locate) {
      slots.forEach((slot, i) => {
        const bubble = bubbles[i];
        const spot = bubble ? locate(bubble) : null;
        if (!bubble || !spot) {
          hide(slot);
          return;
        }
        point.set(spot.x, spot.y, spot.z).project(camera);
        // Behind the camera, or far off screen sideways: there is nobody to point at.
        if (point.z > 1) {
          hide(slot);
          return;
        }
        if (slot.shown !== bubble.id) {
          slot.el.textContent = bubble.text;
          slot.shown = bubble.id;
        }
        slot.el.hidden = false;
        const width = slot.el.offsetWidth;
        const height = slot.el.offsetHeight;
        const m = BANTER.screenMargin;
        const x = Math.min(window.innerWidth - m - width / 2, Math.max(m + width / 2, (point.x * 0.5 + 0.5) * window.innerWidth));
        const y = Math.min(window.innerHeight - m, Math.max(m + height, (-point.y * 0.5 + 0.5) * window.innerHeight));
        slot.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        slot.el.style.opacity = String(Math.min(1, Math.max(0, (bubble.until - time) / BANTER.fadeSeconds)));
      });
    },
    clear() {
      slots.forEach(hide);
    },
  };
}
