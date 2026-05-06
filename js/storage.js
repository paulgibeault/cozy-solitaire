// storage.js — thin wrapper over the Arcade SDK's state API.
// The SDK exposes window.Arcade synchronously after arcade-sdk.js loads in
// index.html, so it's always defined by the time these functions run.

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

// Stats are stored as a single nested object: { [gameTypeKey]: { gamesPlayed, ... }, ... }
export function loadStats(gameTypeKey) {
  const all = Arcade.state.get('stats');
  if (all && typeof all === 'object' && gameTypeKey && all[gameTypeKey]) {
    return { ...defaultStats, ...all[gameTypeKey] };
  }
  return { ...defaultStats };
}

export function saveStats(stats, gameTypeKey) {
  const all = Arcade.state.get('stats') || {};
  all[gameTypeKey] = stats;
  Arcade.state.set('stats', all);
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
