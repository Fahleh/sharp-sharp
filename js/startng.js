// start.ng integration through the hidden connect page. `askStartNg` is the helper from the
// platform docs, with its origin and source checks unchanged. Every reply is untrusted and goes
// through validate.js before the game uses it.

import { START_NG } from './config.js';
import { buildScorePayload, normalizeLeaderboard, normalizePlayer, normalizeScoreReply } from './validate.js';

const ORIGIN = START_NG.origin;
let frame;

function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${ORIGIN}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return frame;
}

// Sends a message and resolves to start.ng's reply, or null if it didn't answer.
async function askStartNg(message, replyType, timeoutMs = 5000) {
  const el = await connectFrame();
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => { clearTimeout(timer); removeEventListener('message', onMessage); resolve(reply); };
    const timer = setTimeout(() => done(null), timeoutMs);
    function onMessage(e) {
      if (e.origin !== ORIGIN || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, ORIGIN);
  });
}

/** Never throws and never waits longer than the timeout plus a short grace. */
async function ask(message, replyType, timeoutMs) {
  let timer;
  const giveUp = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs + START_NG.frameGraceMs);
  });
  try {
    return await Promise.race([askStartNg(message, replyType, timeoutMs), giveUp]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<object|null>} the validated player, or null when start.ng did not answer */
export async function whoami() {
  return normalizePlayer(await ask({ type: 'startng:whoami' }, 'startng:user', START_NG.whoamiTimeoutMs));
}

/**
 * @param {{ earnings: number, deliveries: number }} shift
 * @returns {Promise<{ ok: boolean, improved?: boolean, rank?: number|null, reason?: string }>}
 */
export async function saveScore(shift) {
  const payload = buildScorePayload(shift);
  if (!payload.ok) return payload;
  const reply = await ask({ type: 'startng:score', stats: payload.stats }, 'startng:scoreSaved', START_NG.scoreTimeoutMs);
  return normalizeScoreReply(reply);
}

/** @returns {Promise<{ ok: boolean, entries?: object[] }>} */
export async function fetchLeaderboard() {
  const reply = await ask(
    { type: 'startng:leaderboard', limit: START_NG.leaderboardLimit },
    'startng:leaderboardData',
    START_NG.leaderboardTimeoutMs,
  );
  return normalizeLeaderboard(reply);
}

/** Sends the player to start.ng to sign in, with a link back to this game. */
export function signIn() {
  location.href = `${ORIGIN}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

/** @returns {boolean} true when start.ng opened the game with `?guest` */
export function isGuestMode() {
  return new URLSearchParams(location.search).has(START_NG.guestQuery);
}

/** After sign-in start.ng returns a session in the address; the connect page does not need it. */
export function clearSessionFromAddress() {
  if (new URLSearchParams(location.hash.slice(1)).has(START_NG.sessionHashKey)) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}
