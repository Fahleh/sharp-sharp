// localStorage holds exactly three things: the personal best, the banter setting and the mute
// setting. Every access is wrapped, because private windows and blocked storage must not break play.

import { STORAGE_KEYS } from './config.js';
import { parseBanter, parseBest, parseMuted } from './validate.js';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the setting just does not persist.
  }
}

/** @returns {number} best earnings on this device, in naira */
export function loadBest() {
  return parseBest(read(STORAGE_KEYS.best));
}

/** @param {number} earnings whole naira */
export function saveBest(earnings) {
  write(STORAGE_KEYS.best, String(earnings));
}

/** @returns {boolean} whether the road banter is on; it is on unless the player switched it off */
export function loadBanter() {
  return parseBanter(read(STORAGE_KEYS.banter));
}

/** @param {boolean} on */
export function saveBanter(on) {
  write(STORAGE_KEYS.banter, on ? '1' : '0');
}

/** @returns {boolean} the saved mute setting */
export function loadMuted() {
  return parseMuted(read(STORAGE_KEYS.muted));
}

/** @param {boolean} muted */
export function saveMuted(muted) {
  write(STORAGE_KEYS.muted, muted ? '1' : '0');
}
