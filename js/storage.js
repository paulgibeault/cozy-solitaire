// storage.js — LocalStorage persistence
const STATS_KEY = 'cozy-solitaire-stats';
const STATE_KEY = 'cozy-solitaire-state';
const MODE_KEY = 'cozy-solitaire-mode';

const defaultStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  bestStreak: 0,
  bestTime: null,
};

const defaultMode = {
  drawMode: 'draw1',
  recycleMode: 'unlimited',
};

// Stats are stored as a keyed object: { [gameTypeKey]: { gamesPlayed, ... }, ... }
export function loadStats(gameTypeKey) {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { ...defaultStats };
    const parsed = JSON.parse(raw);
    // Nested keyed format
    if (parsed && typeof parsed === 'object' && gameTypeKey && parsed[gameTypeKey]) {
      return { ...defaultStats, ...parsed[gameTypeKey] };
    }
    return { ...defaultStats };
  } catch { return { ...defaultStats }; }
}

export function saveStats(stats, gameTypeKey) {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    let all = {};
    if (raw) {
      try { all = JSON.parse(raw); } catch {}
    }
    all[gameTypeKey] = stats;
    localStorage.setItem(STATS_KEY, JSON.stringify(all));
  } catch {}
}

export function saveGameState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}

export function loadGameState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearGameState() {
  try { localStorage.removeItem(STATE_KEY); } catch {}
}

export function loadModeSettings() {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return raw ? { ...defaultMode, ...JSON.parse(raw) } : { ...defaultMode };
  } catch { return { ...defaultMode }; }
}

export function saveModeSettings(settings) {
  try { localStorage.setItem(MODE_KEY, JSON.stringify(settings)); } catch {}
}
