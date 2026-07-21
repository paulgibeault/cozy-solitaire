// storage.js — thin wrappers over the Arcade SDK's state and stats APIs.
// The SDK exposes window.Arcade synchronously after arcade-sdk.js loads in
// index.html, so it's always defined by the time these functions run.

import { VARIANTS, DRAW_MODES, RECYCLE_MODES, SPIDER_MODES } from './constants.js';

const defaultStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  bestStreak: 0,
  bestTime: null,
};

const defaultMode = {
  variant: 'klondike',
  drawMode: 'draw1',
  recycleMode: 'unlimited',
  collapseRuns: true,
  showHints: true,
};

// Per-game-type stats live at arcade.v1.cozy-solitaire.stats.<gameTypeKey>.
// getOrInit deep-merges defaults under the stored value, so newly-added
// fields surface with their defaults on saves from older versions.
export function loadStats(gameTypeKey) {
  return Arcade.stats.getOrInit(gameTypeKey, defaultStats);
}

// Atomic update — the updater receives current stats (with defaults merged)
// and returns the next value. Returns the new value.
export function updateStats(gameTypeKey, updater) {
  return Arcade.stats.update(gameTypeKey, prev => {
    const merged = { ...defaultStats, ...prev };
    return updater(merged);
  });
}

export function saveGameState(state) {
  Arcade.state.set('currentGame', state);
}

export function loadGameState() {
  return Arcade.state.get('currentGame');
}

export function clearGameState() {
  Arcade.state.remove('currentGame');
}

export function loadModeSettings() {
  return Arcade.state.getOrInit('settings', defaultMode);
}

export function saveModeSettings(settings) {
  Arcade.state.set('settings', settings);
}

// ─── Arcade.records — per-variant personal bests (cozy-solitaire#6) ─────────
//
// The launcher's Records sheet renders these generically (label + format), so
// there is zero per-game launcher code. Records live alongside the existing
// Arcade.stats blobs — stats stay the game-formatted view (Statistics screen),
// records are the launcher-formatted best-ever view.
//
// Per-variant categories written at win time (R1 slugs — stable forever):
//   best_time_<variant>    — lower, duration-ms  (from the win's elapsed time)
//   fewest_moves_<variant> — lower, integer      (from the win's move count)
//   best_streak_<variant>  — higher, integer     (longest consecutive-win run)
// for each of klondike / freecell / spider.
//
// Feature-detected everywhere (R5): standalone against a stale SDK cache, or a
// future SDK without records, degrades to a no-op instead of throwing.

function recordsAvailable() {
  return !!(typeof window !== 'undefined' && window.Arcade && window.Arcade.records);
}

function variantLabel(variantId) {
  const v = VARIANTS.find(x => x.id === variantId);
  return v ? v.label : variantId;
}

// The stats bests we seed from are keyed per full game-type config
// (getGameTypeKey() in main.js — e.g. `klondike_draw1_unlimited`,
// `spider_1suit`, `freecell`), NOT per bare variant. Enumerate every possible
// config key for a variant so seeding aggregates across all of a player's
// historical configs into the single per-variant record.
function statsConfigKeys(variantId) {
  if (variantId === 'klondike') {
    const keys = [];
    for (const d of DRAW_MODES) {
      for (const r of RECYCLE_MODES) keys.push(`klondike_${d.id}_${r.id}`);
    }
    return keys;
  }
  if (variantId === 'spider') {
    return SPIDER_MODES.map(m => `spider_${m.id}`);
  }
  return [variantId]; // freecell (and any future flat-keyed variant)
}

// Write the three per-variant records for a completed win. Uses best() (R2):
// idempotent, never regresses, ties don't write, and returns { improved } for
// an optional flourish. Returns a map of category → best() result.
export function writeWinRecords(variantId, { timeMs, moves, streak }) {
  if (!recordsAvailable()) return {};
  const label = variantLabel(variantId);
  const out = {};
  if (Number.isFinite(timeMs)) {
    out.time = Arcade.records.best(`best_time_${variantId}`, {
      value: timeMs, direction: 'lower',
      format: 'duration-ms', label: `Best time — ${label}`,
    });
  }
  if (Number.isFinite(moves)) {
    out.moves = Arcade.records.best(`fewest_moves_${variantId}`, {
      value: moves, direction: 'lower',
      format: 'integer', label: `Fewest moves — ${label}`,
    });
  }
  if (Number.isFinite(streak)) {
    out.streak = Arcade.records.best(`best_streak_${variantId}`, {
      value: streak, direction: 'higher',
      format: 'integer', label: `Best streak — ${label}`,
    });
  }
  return out;
}

// One-shot seed (R3) so long-time players keep their history. best() makes this
// idempotent, so re-running is harmless — the migrate() guard just avoids the
// scan on every boot. Seeds best_time and best_streak from the existing stats
// bests; fewest_moves has no persisted stats field (stats only track
// gamesPlayed/gamesWon/currentStreak/bestStreak/bestTime), so it cannot be
// seeded and simply starts tracking from the next win.
export function seedRecords() {
  if (!recordsAvailable()
      || !window.Arcade.state || typeof window.Arcade.state.migrate !== 'function') {
    return;
  }
  Arcade.state.migrate('records-v1', () => {
    for (const { id: variantId, label } of VARIANTS) {
      let bestTime = null;
      let bestStreak = 0;
      for (const key of statsConfigKeys(variantId)) {
        const s = Arcade.stats.get(key);
        if (!s) continue;
        if (Number.isFinite(s.bestTime) && (bestTime === null || s.bestTime < bestTime)) {
          bestTime = s.bestTime;
        }
        if (Number.isFinite(s.bestStreak) && s.bestStreak > bestStreak) {
          bestStreak = s.bestStreak;
        }
      }
      if (bestTime !== null) {
        Arcade.records.best(`best_time_${variantId}`, {
          value: bestTime, direction: 'lower',
          format: 'duration-ms', label: `Best time — ${label}`,
        });
      }
      if (bestStreak > 0) {
        Arcade.records.best(`best_streak_${variantId}`, {
          value: bestStreak, direction: 'higher',
          format: 'integer', label: `Best streak — ${label}`,
        });
      }
    }
  });
}
