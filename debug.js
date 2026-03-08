import { createGameState } from './js/game.js';
try {
  const state = createGameState('freecell', {});
  console.log('Freecell ok', state.zones.size);
} catch (e) {
  console.error('Freecell Error:', e);
}
try {
  const state = createGameState('spider', {});
  console.log('Spider ok', state.zones.size);
} catch (e) {
  console.error('Spider Error:', e);
}
