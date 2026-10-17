// Everything that crosses the trust boundary: start.ng replies, character styles, scores and
// stored values. Pure: no three.js, no DOM. Nothing here throws on bad input.

import { GUEST_STYLE, SCORE_LIMITS, STAT_KEYS, START_NG, STYLE_OPTIONS } from './config.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value) => Number.isSafeInteger(value) && value > 0;
const isWhole = (value) => Number.isInteger(value) && value >= SCORE_LIMITS.min && value <= SCORE_LIMITS.max;

/**
 * Always returns a complete, valid style: anything missing or unknown falls
 * back to the guest default for that field.
 * @param {unknown} input a `style` object from start.ng (untrusted)
 * @returns {Record<string, string>}
 */
export function normalizeStyle(input) {
  const source = isObject(input) ? input : {};
  // Own properties only: an inherited value never counts as the player's choice.
  const read = (key) => (Object.hasOwn(source, key) ? source[key] : undefined);
  const pick = (key) => (STYLE_OPTIONS[key].includes(read(key)) ? read(key) : GUEST_STYLE[key]);
  const color = (key) => (typeof read(key) === 'string' && HEX_COLOR.test(read(key)) ? read(key).toLowerCase() : GUEST_STYLE[key]);
  return {
    body: pick('body'),
    primaryColor: color('primaryColor'),
    secondaryColor: color('secondaryColor'),
    skinColor: color('skinColor'),
    hairColor: color('hairColor'),
    hair: pick('hair'),
    hat: pick('hat'),
    accessory: pick('accessory'),
  };
}

/**
 * @param {unknown} face value of `face` from start.ng (untrusted)
 * @returns {string|null} the data URL if it is a PNG data URL, otherwise null
 */
export function sanitizeFace(face) {
  return typeof face === 'string' && face.startsWith(START_NG.facePrefix) ? face : null;
}

/**
 * Printable, trimmed, length-capped text, or `fallback`.
 * @param {unknown} value
 * @param {string|null} fallback
 * @returns {string|null}
 */
export function cleanText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  // Control and format characters (zero-width, bidi marks) only make names hard to read.
  const text = value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, START_NG.nameMaxLength) : fallback;
}

/**
 * Turn a `startng:user` reply into the player the game shows.
 * @param {unknown} reply untrusted reply from the connect page
 * @returns {{ id: number|null, name: string, account: string|null, style: Record<string, string>,
 *   face: string|null, signedIn: boolean }|null} null when the reply has neither user nor guest
 */
export function normalizePlayer(reply) {
  if (!isObject(reply)) return null;
  const user = isObject(reply.user) && isId(reply.user.id) ? reply.user : null;
  const guest = isObject(reply.guest) ? reply.guest : null;
  const source = user ?? guest;
  if (!source) return null;
  return {
    id: user ? user.id : null,
    name: cleanText(source.name, user ? 'Player' : 'Guest'),
    account: user ? cleanText(user.account, null) : null,
    style: normalizeStyle(source.style),
    face: sanitizeFace(source.face),
    signedIn: user !== null,
  };
}

/**
 * Stable key for "did the player change?", so the character is only rebuilt when needed.
 * @param {object|null} player result of `normalizePlayer`
 * @returns {string}
 */
export function playerKey(player) {
  return player ? JSON.stringify([player.id, player.name, player.account, player.style, player.face]) : '';
}

/**
 * Build the `startng:score` stats. Only whole numbers in range are allowed.
 * @param {{ earnings: number, deliveries: number }} shift
 * @returns {{ ok: true, stats: { earnings: number, deliveries: number } } | { ok: false, reason: string }}
 */
export function buildScorePayload({ earnings, deliveries }) {
  if (!isWhole(earnings)) return { ok: false, reason: 'invalid_earnings' };
  if (!isWhole(deliveries)) return { ok: false, reason: 'invalid_deliveries' };
  return { ok: true, stats: { [STAT_KEYS.earnings]: earnings, [STAT_KEYS.deliveries]: deliveries } };
}

/**
 * A shift with no delivery is not worth a leaderboard row.
 * @param {{ signedIn: boolean, deliveries: number }} shift
 * @returns {boolean}
 */
export function shouldSaveScore({ signedIn, deliveries }) {
  return signedIn && deliveries > 0;
}

/**
 * @param {unknown} reply untrusted `startng:scoreSaved` reply (null if none came)
 * @returns {{ ok: true, improved: boolean, rank: number|null } | { ok: false, reason: string }}
 */
export function normalizeScoreReply(reply) {
  if (!isObject(reply)) return { ok: false, reason: 'no_reply' };
  if (reply.ok !== true) return { ok: false, reason: 'rejected' };
  const result = isObject(reply.result) ? reply.result : {};
  return {
    ok: true,
    improved: result.improved === true,
    rank: isId(result.rank) ? result.rank : null,
  };
}

/**
 * @param {unknown} reply untrusted `startng:leaderboardData` reply (null if none came)
 * @returns {{ ok: true, entries: Array<{ rank: number, playerId: number|null, name: string,
 *   earnings: number, deliveries: number }> } | { ok: false, reason: string }}
 */
export function normalizeLeaderboard(reply) {
  if (!isObject(reply) || reply.ok !== true || !Array.isArray(reply.entries)) {
    return { ok: false, reason: 'no_reply' };
  }
  const count = (value) => (Number.isFinite(value) ? Math.min(SCORE_LIMITS.max, Math.max(0, Math.floor(value))) : 0);
  const entries = reply.entries
    .filter((entry) => isObject(entry) && isId(entry.rank))
    .slice(0, START_NG.leaderboardLimit)
    .map((entry) => {
      const stats = isObject(entry.stats) ? entry.stats : {};
      return {
        rank: entry.rank,
        playerId: isId(entry.player_id) ? entry.player_id : null,
        name: cleanText(entry.name, 'Player'),
        earnings: count(stats[STAT_KEYS.earnings]),
        deliveries: count(stats[STAT_KEYS.deliveries]),
      };
    });
  return { ok: true, entries };
}

/**
 * @param {unknown} raw string read from localStorage
 * @returns {number} best earnings, 0 when absent or damaged
 */
export function parseBest(raw) {
  const value = typeof raw === 'string' && /^\d{1,10}$/.test(raw) ? Number(raw) : 0;
  return isWhole(value) ? value : 0;
}

/**
 * @param {unknown} raw string read from localStorage
 * @returns {boolean} banter is on unless it was explicitly switched off
 */
export function parseBanter(raw) {
  return raw !== '0';
}

/**
 * @param {unknown} raw string read from localStorage
 * @returns {boolean} true only for the exact stored "1"
 */
export function parseMuted(raw) {
  return raw === '1';
}
