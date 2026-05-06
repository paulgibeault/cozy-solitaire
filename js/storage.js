// storage.js — thin wrappers over the Arcade SDK's state and stats APIs.
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
