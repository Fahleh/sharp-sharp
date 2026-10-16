// The DOM side of the game: screens, HUD and touch controls. It shows what it is told and
// calls back when the player acts; it decides no rules. Text from the game goes in through
// textContent only.

import { GAME_NAME } from './config.js';

const byId = (id) => document.getElementById(id);

/**
 * @param {{ onStart: () => void, onPause: () => void, onResume: () => void, onRecover: () => void }} handlers
 */
export function createUi({ onStart, onPause, onResume, onRecover }) {
  const el = {
    name: byId('game-name'),
    start: byId('start'),
    pause: byId('pause'),
    resume: byId('resume'),
    recover: byId('btn-recover'),
    speed: byId('speed-value'),
    fallback: byId('fallback'),
    left: byId('btn-left'),
    right: byId('btn-right'),
    brake: byId('btn-brake'),
  };
  el.name.textContent = GAME_NAME;
  document.title = GAME_NAME;

  el.start.addEventListener('click', onStart);
  el.resume.addEventListener('click', onResume);
  el.pause.addEventListener('click', () => {
    // Hand focus back to the page so Space does not re-press this button.
    el.pause.blur();
    onPause();
  });
  el.recover.addEventListener('click', () => {
    el.recover.blur();
    onRecover();
  });

  const focusFor = { ready: el.start, paused: el.resume };

  let lastSpeed = -1;
  return {
    buttons: { left: el.left, right: el.right, brake: el.brake },
    /** @param {'loading'|'ready'|'playing'|'paused'|'gameover'} state */
    setState(state) {
      document.body.dataset.state = state;
      focusFor[state]?.focus({ preventScroll: true });
    },
    /** @param {boolean} touch */
    setTouch(touch) {
      document.body.dataset.touch = touch ? 'true' : 'false';
    },
    /** @param {number} metersPerSecond */
    setSpeed(metersPerSecond) {
      const kmh = Math.round(metersPerSecond * 3.6);
      if (kmh !== lastSpeed) {
        lastSpeed = kmh;
        el.speed.textContent = String(kmh);
      }
    },
    /** @param {boolean} visible */
    setRecover(visible) {
      el.recover.hidden = !visible;
    },
    showFallback() {
      el.fallback.hidden = false;
      document.body.dataset.state = 'loading';
    },
  };
}
