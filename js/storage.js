// storage.js — LocalStorage persistence
const STATS_KEY = 'cozy-solitaire-stats';
const STATE_KEY = 'cozy-solitaire-state';

const defaultStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  bestStreak: 0,
  bestTime: null,
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
