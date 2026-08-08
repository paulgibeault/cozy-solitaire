// utils.js — Shared utility functions

/**
 * The launcher's power-saver preference (GAME_INTEGRATION §5/§6d).
 *
 * Read defensively: `Arcade.settings.powerSaver` only exists from SDK 3.13.0,
 * and on anything older the call throws — inside an onSettingsChange handler
 * that would be a throw on every launcher settings write, not just at startup.
 * A pre-3.13 SDK (or a standalone page with no SDK at all) degrades to "not
 * saving", which is the old behaviour exactly.
 * @returns {boolean}
 */
export function isPowerSaving() {
  if (typeof Arcade === 'undefined' || !Arcade.settings) return false;
  return Arcade.settings.powerSaver ? Arcade.settings.powerSaver() : false;
}

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
