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

export function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? { ...defaultStats, ...JSON.parse(raw) } : { ...defaultStats };
  } catch { return { ...defaultStats }; }
}

export function saveStats(stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch {}
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
