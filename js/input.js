// Keyboard and touch input, read as one `{ throttle, brake, steer, horn }` each simulation step.
// Every listener is tied to one AbortSignal so teardown removes them all.

const KEYS = Object.freeze({
  throttle: ['ArrowUp', 'KeyW'],
  brake: ['Space', 'ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  horn: ['KeyH'],
});
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const RECOVER_KEY = 'KeyR';
const CONFIRM_KEYS = new Set(['Space', 'Enter', 'NumpadEnter']);
const NATIVE_CONTROLS = 'button, a, input, select, textarea';
const GAME_KEYS = new Set([...KEYS.throttle, ...KEYS.brake, ...KEYS.left, ...KEYS.right, ...KEYS.horn]);

/**
 * @param {{ signal: AbortSignal, buttons: { left: HTMLElement, right: HTMLElement, brake: HTMLElement, horn: HTMLElement },
 *   onPause: () => void, onRecover: () => void, onConfirm: () => void, isPlaying: () => boolean }} options
 * @returns {{ read: () => { throttle: number, brake: number, steer: number, horn: boolean }, release: () => void,
 *   touchMode: () => boolean }}
 */
export function createInput({ signal, buttons, onPause, onRecover, onConfirm, isPlaying }) {
  const down = new Set();
  const held = new Set();
  // A tap shorter than one simulation step still sounds the horn.
  let hornTapped = false;
  const coarse = window.matchMedia('(pointer: coarse)');
  let touchSeen = false;
  const touchMode = () => touchSeen || coarse.matches;

  const anyDown = (codes) => codes.some((code) => down.has(code));

  window.addEventListener('keydown', (event) => {
    const { code } = event;
    const inControl = event.target instanceof Element && event.target.closest(NATIVE_CONTROLS);
    if (GAME_KEYS.has(code) && isPlaying() && !inControl) event.preventDefault();
    if (event.repeat) return;
    if (PAUSE_KEYS.has(code)) {
      onPause();
      return;
    }
    if (code === RECOVER_KEY) onRecover();
    // A focused button keeps its own Space and Enter behaviour.
    if (CONFIRM_KEYS.has(code) && !inControl && !isPlaying()) {
      event.preventDefault();
      onConfirm();
    }
    if (GAME_KEYS.has(code)) down.add(code);
    if (KEYS.horn.includes(code)) hornTapped = true;
  }, { signal });
  window.addEventListener('keyup', (event) => down.delete(event.code), { signal });
  // A key released while the window had no focus would otherwise stay held.
  window.addEventListener('blur', () => down.clear(), { signal });

  for (const [name, el] of Object.entries(buttons)) {
    el.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') touchSeen = true;
      held.add(name);
      if (name === 'horn') hornTapped = true;
      try {
        // Keeps the press alive when a thumb slides off the button.
        el.setPointerCapture(event.pointerId);
      } catch {
        // The pointer already ended; its release event will clear the hold.
      }
      event.preventDefault();
    }, { signal });
    const release = () => held.delete(name);
    el.addEventListener('pointerup', release, { signal });
    el.addEventListener('pointercancel', release, { signal });
    el.addEventListener('lostpointercapture', release, { signal });
    el.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
  }
  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') touchSeen = true;
  }, { signal, capture: true });

  return {
    read() {
      const brake = anyDown(KEYS.brake) || held.has('brake') ? 1 : 0;
      const steer = (anyDown(KEYS.right) || held.has('right') ? 1 : 0) - (anyDown(KEYS.left) || held.has('left') ? 1 : 0);
      // On a touch screen the throttle is always on; the brake is what slows the bike.
      const throttle = brake === 0 && (anyDown(KEYS.throttle) || touchMode()) ? 1 : 0;
      const horn = hornTapped || anyDown(KEYS.horn) || held.has('horn');
      hornTapped = false;
      return { throttle, brake, steer, horn };
    },
    /** Forget everything held, for pauses and tab changes. */
    release() {
      down.clear();
      held.clear();
      hornTapped = false;
    },
    touchMode,
  };
}
