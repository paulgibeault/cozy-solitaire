// utils.js — Shared utility functions

/**
 * Returns true if point (px, py) lies within the rectangle
 * starting at (rx, ry) with dimensions (rw × rh).
 */
export function inRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/**
 * Parses a seed string from user input.
 * Returns an integer in [1, 999999] or undefined if the value is absent/invalid.
 * @param {string|undefined} val
 * @returns {number|undefined}
 */
export function parseSeed(val) {
  if (val === undefined || val === null || val === '') return undefined;
  const n = parseInt(val, 10);
  if (isNaN(n)) return undefined;
  return Math.max(1, Math.min(999999, n));
}
