// The DOM side of the game: screens, HUD and touch controls. It shows what it is told and
// calls back when the player acts; it decides no rules. Text from the game goes in through
// textContent only.

import { GAME_NAME, HUD, SHIFT, START_NG } from './config.js';

const byId = (id) => document.getElementById(id);
const naira = (value) => `₦${Math.round(value).toLocaleString('en-NG')}`;
const stars = (rating) => `★ ${rating.toFixed(1)}`;
const minutes = (seconds) => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/**
 * @param {{ onStart: () => void, onPause: () => void, onResume: () => void, onRecover: () => void,
 *   onAgain: () => void, onSignIn: () => void, onBanter: (on: boolean) => void, onSound: (on: boolean) => void }} handlers
 */
export function createUi({
  onStart, onPause, onResume, onRecover, onAgain, onSignIn, onBanter, onSound,
}) {
  const el = {
    name: byId('game-name'),
    titleBest: byId('title-best'),
    start: byId('start'),
    pause: byId('pause'),
    resume: byId('resume'),
    again: byId('again'),
    recover: byId('btn-recover'),
    speed: byId('speed-value'),
    fallback: byId('fallback'),
    left: byId('btn-left'),
    right: byId('btn-right'),
    brake: byId('btn-brake'),
    horn: byId('btn-horn'),
    earnings: byId('earnings'),
    rating: byId('rating'),
    clock: byId('clock'),
    health: byId('health'),
    healthFill: byId('health-fill'),
    order: byId('order'),
    orderType: byId('order-type'),
    orderStep: byId('order-step'),
    orderDist: byId('order-dist'),
    orderName: byId('order-name'),
    orderHint: byId('order-hint'),
    orderPay: byId('order-pay'),
    orderTip: byId('order-tip'),
    orderBarFill: byId('order-bar-fill'),
    toast: byId('toast'),
    bubbles: byId('bubbles'),
    announcer: byId('announcer'),
    flash: byId('hit-flash'),
    arrow: byId('target-arrow'),
    arrowZone: byId('arrow-zone'),
    overTitle: byId('over-title'),
    overNote: byId('over-note'),
    overEarnings: byId('over-earnings'),
    overDeliveries: byId('over-deliveries'),
    overRating: byId('over-rating'),
    overBest: byId('over-best'),
    overStatus: byId('over-status'),
    profile: byId('profile'),
    face: byId('profile-face'),
    profileName: byId('profile-name'),
    profileAccount: byId('profile-account'),
    signIn: byId('sign-in'),
    board: byId('board'),
    boardNote: byId('board-note'),
  };
  el.name.textContent = GAME_NAME;
  document.title = GAME_NAME;

  el.start.addEventListener('click', onStart);
  el.resume.addEventListener('click', onResume);
  el.again.addEventListener('click', onAgain);
  el.signIn.addEventListener('click', onSignIn);
  const banterSwitches = [...document.querySelectorAll('[data-setting="banter"]')];
  for (const button of banterSwitches) {
    button.addEventListener('click', () => onBanter(button.getAttribute('aria-checked') !== 'true'));
  }
  const soundSwitches = [...document.querySelectorAll('[data-setting="sound"]')];
  for (const button of soundSwitches) {
    button.addEventListener('click', () => onSound(button.getAttribute('aria-checked') !== 'true'));
  }
  // Hand focus back to the page after a click so Space does not re-press these buttons.
  el.pause.addEventListener('click', () => { el.pause.blur(); onPause(); });
  el.recover.addEventListener('click', () => { el.recover.blur(); onRecover(); });

  const focusFor = { ready: el.start, paused: el.resume };
  let lastSpeed = -1;
  let toastTimer = 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  return {
    buttons: { left: el.left, right: el.right, brake: el.brake, horn: el.horn },
    bubbleLayer: el.bubbles,

    /** @param {'loading'|'ready'|'playing'|'paused'|'gameover'} state */
    setState(state) {
      document.body.dataset.state = state;
      focusFor[state]?.focus({ preventScroll: true });
    },
    /** @param {boolean} touch */
    setTouch(touch) {
      const value = touch ? 'true' : 'false';
      if (document.body.dataset.touch !== value) document.body.dataset.touch = value;
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
      if (el.recover.hidden === visible) el.recover.hidden = !visible;
    },
    showFallback() {
      el.fallback.hidden = false;
      document.body.dataset.state = 'loading';
    },
    /** @param {number} best personal best in naira, 0 for none */
    setBest(best) {
      el.titleBest.hidden = best <= 0;
      el.titleBest.textContent = `Your best: ${naira(best)}`;
    },

    // ---- HUD
    setEarnings(value) {
      el.earnings.textContent = Math.round(value).toLocaleString('en-NG');
    },
    setRating(value) {
      el.rating.textContent = stars(value);
      el.rating.setAttribute('aria-label', `Rating ${value.toFixed(1)} out of 5`);
    },
    setClock(seconds) {
      el.clock.textContent = minutes(seconds);
    },
    setHealth(health) {
      const fraction = Math.max(0, Math.min(1, health / SHIFT.startHealth));
      el.healthFill.style.transform = `scaleX(${fraction})`;
      el.health.setAttribute('aria-valuenow', String(Math.round(health)));
    },
    /**
     * @param {{ type: string, vendor: object, customer: object, base: number, stage: string, meters: number }|null} order
     */
    setOrder(order) {
      el.order.hidden = order === null;
      if (!order) return;
      el.order.dataset.stage = order.stage;
      el.order.dataset.urgency = 'ok';
      el.orderType.textContent = order.type;
      if (order.stage === 'pickup') {
        el.orderStep.textContent = 'Pick up';
        el.orderName.textContent = order.vendor.name;
        el.orderHint.textContent = `Near ${order.vendor.landmark}. Clock starts at pickup`;
        el.orderBarFill.style.transform = 'scaleX(1)';
      } else {
        el.orderStep.textContent = 'Deliver';
        el.orderName.textContent = order.customer.hint;
        el.orderHint.textContent = `From ${order.vendor.name}`;
      }
      el.orderPay.textContent = naira(order.base);
      el.orderTip.textContent = '';
    },
    /** @param {number|null} metres */
    setOrderDistance(metres) {
      el.orderDist.textContent = metres === null ? '' : `${Math.max(0, Math.round(metres / 10) * 10)} m`;
    },
    /**
     * @param {{ fraction: number, tip: number, late: boolean }} clock fraction of the budget left
     */
    setOrderClock({ fraction, tip, late }) {
      el.orderBarFill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
      el.order.dataset.urgency = late ? 'late' : fraction < HUD.warnFraction ? 'warn' : 'ok';
      el.orderTip.textContent = late ? 'Late: no tip' : `Tip ${naira(tip)}`;
    },

    /** @param {boolean} on shows the banter switch state everywhere it appears */
    setBanter(on) {
      for (const button of banterSwitches) {
        button.setAttribute('aria-checked', String(on));
        button.textContent = on ? 'Banter: on' : 'Banter: off';
      }
    },

    /** @param {boolean} on shows the sound switch state everywhere it appears */
    setSound(on) {
      for (const button of soundSwitches) {
        button.setAttribute('aria-checked', String(on));
        button.textContent = on ? 'Sound: on' : 'Sound: off';
      }
    },

    // ---- messages
    /** @param {string} text @param {'good'|'bad'|'plain'} [tone] */
    toast(text, tone = 'plain') {
      el.toast.textContent = text;
      el.toast.dataset.tone = tone;
      el.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove('show'), HUD.toastSeconds * 1000);
    },
    /** @param {string} text read out by screen readers */
    announce(text) {
      el.announcer.textContent = text;
    },
    hit() {
      if (reduce.matches) return;
      el.flash.classList.remove('flash');
      // Reading a layout property restarts the animation.
      void el.flash.offsetWidth;
      el.flash.classList.add('flash');
    },

    /**
     * Point at the target when it is off screen, along the edge of the arrow zone.
     * @param {{ x: number, y: number, visible: boolean, kind: 'pickup'|'drop' }|null} aim
     *   screen position in pixels, and whether the target is in front of the camera and on screen
     */
    setArrow(aim) {
      if (!aim || aim.visible) {
        el.arrow.hidden = true;
        return;
      }
      const zone = el.arrowZone.getBoundingClientRect();
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = aim.x - cx;
      const dy = aim.y - cy;
      // Walk from the screen centre toward the target until the zone's edge.
      const reachX = dx === 0 ? Infinity : (dx > 0 ? zone.right - cx : zone.left - cx) / dx;
      const reachY = dy === 0 ? Infinity : (dy > 0 ? zone.bottom - cy : zone.top - cy) / dy;
      const t = Math.min(reachX, reachY, 1e6);
      const x = cx + dx * t - zone.left;
      const y = cy + dy * t - zone.top;
      el.arrow.hidden = false;
      el.arrow.dataset.kind = aim.kind;
      el.arrow.style.transform = `translate(${x}px, ${y}px) rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
    },

    // ---- game over
    /**
     * @param {{ earnings: number, deliveries: number, rating: number, best: number, reason: 'time'|'wrecked',
     *   newBest: boolean }} summary
     */
    showSummary({ earnings, deliveries, rating, best, reason, newBest }) {
      el.overTitle.textContent = reason === 'wrecked' ? 'Bike don spoil' : 'Shift over';
      el.overNote.textContent = reason === 'wrecked' ? 'The bike is wrecked. Shift ends here.' : 'Five minutes done. Well ridden.';
      el.overEarnings.textContent = naira(earnings);
      el.overDeliveries.textContent = String(deliveries);
      el.overRating.textContent = stars(rating);
      el.overBest.textContent = naira(best);
      el.overStatus.textContent = newBest ? 'New best!' : '';
      clearTimeout(toastTimer);
      el.toast.classList.remove('show');
    },
    /** @param {boolean} ready the Ride again button is only live after a short beat */
    setAgainReady(ready) {
      el.again.disabled = !ready;
      if (ready) el.again.focus({ preventScroll: true });
    },
    /**
     * The chip: face, name and account, with a sign-in button for guests.
     * @param {{ name: string, account: string|null, face: string|null, signedIn: boolean }} player already validated
     */
    setProfile(player) {
      el.profileName.textContent = player.name;
      el.profileAccount.textContent = player.account ? `@${player.account}` : 'Not signed in';
      // The face is a PNG data URL by now; checked again because it goes into an image source.
      const face = player.face && player.face.startsWith(START_NG.facePrefix) ? player.face : null;
      el.face.hidden = face === null;
      if (face) el.face.src = face;
      else el.face.removeAttribute('src');
      el.signIn.hidden = player.signedIn;
      el.profile.hidden = false;
    },
    /**
     * @param {{ ok: boolean, entries?: Array<{ rank: number, playerId: number|null, name: string,
     *   earnings: number, deliveries: number }> }|null} board null clears it (a fetch is on its way)
     * @param {number|null} playerId the signed-in player, to highlight their row
     */
    setLeaderboard(board, playerId) {
      el.board.replaceChildren();
      el.boardNote.textContent = '';
      if (!board) {
        el.boardNote.textContent = 'Loading the leaderboard…';
        return;
      }
      if (!board.ok) {
        el.boardNote.textContent = 'Leaderboard unavailable';
        return;
      }
      if (board.entries.length === 0) {
        el.boardNote.textContent = 'No scores yet. Be the first!';
        return;
      }
      for (const entry of board.entries) {
        const row = document.createElement('li');
        const cell = (className, text) => {
          const span = document.createElement('span');
          span.className = className;
          span.textContent = text;
          return span;
        };
        row.append(cell('rank', `#${entry.rank}`), cell('who', entry.name), cell('earn', naira(entry.earnings)), cell('count', `${entry.deliveries} del`));
        if (playerId !== null && entry.playerId === playerId) {
          row.classList.add('mine');
          row.setAttribute('aria-current', 'true');
        }
        el.board.append(row);
      }
    },
    /** @returns {boolean} whether Ride again can be used yet */
    againReady() {
      return !el.again.disabled;
    },
    /** @param {string} text */
    setOverStatus(text) {
      el.overStatus.textContent = text;
    },
  };
}
