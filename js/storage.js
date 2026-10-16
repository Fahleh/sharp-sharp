// localStorage holds exactly one thing so far: the personal best. Every access is wrapped,
// because private windows and blocked storage must not break play.

import { STORAGE_KEYS } from './config.js';
import { parseBest } from './validate.js';

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
