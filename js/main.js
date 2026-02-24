// main.js — Entry point, game loop, state machine
import { initRenderer, recalcLayout, getLayout, clear, drawCardBack, drawCardFace,
  drawEmptyPile, drawHighlight, drawButton, drawText, getCardPosition,
  spawnWinParticles, updateAndDrawParticles } from './renderer.js';
import { initInput, getDragState } from './input.js';
import { updateTweens, hasTweens } from './tween.js';
import { createGameState, dealStock, moveCards, findFoundationFor, canPlaceOnTableau,
  canPlaceOnFoundation, isWon, allCardsFaceUp, getAutoCompleteCard, undo,
  serializeState, deserializeState } from './game.js';
import { loadStats, saveStats, saveGameState, loadGameState, clearGameState } from './storage.js';
import { TABLEAU_COLS, FOUNDATION_COUNT, AUTO_COMPLETE_DELAY } from './constants.js';

const canvas = document.getElementById('game');
let state = null;
let stats = loadStats();
let autoCompleting = false;
let autoCompleteTimer = 0;
let showStats = false;
let lastTime = 0;

function init() {
  initRenderer(canvas);
  initInput(canvas, handleAction);
  window.addEventListener('resize', () => { recalcLayout(); });

  // Try to restore saved game
  const saved = loadGameState();
  if (saved) {
    state = deserializeState(saved);
  } else {
    newGame(false);
  }

  window.__gameState = state;
  requestAnimationFrame(loop);
}

function newGame(countPrevious = true) {
  if (countPrevious && state && !state.won) {
    stats.currentStreak = 0;
    saveStats(stats);
  }
  state = createGameState();
  window.__gameState = state;
  autoCompleting = false;
  showStats = false;
  clearGameState();
}

function handleAction(action) {
  if (state.won && action.type !== 'button') return;
  if (autoCompleting && action.type !== 'button') return;

  switch (action.type) {
    case 'tapStock':
      dealStock(state);
      break;

    case 'tap': {
      // Tap to auto-move to foundation
      const card = getCardFromHit(action);
      if (!card) break;
      const fi = findFoundationFor(card, state.foundations);
      if (fi >= 0) {
        moveFromHit(action, 'foundation', fi);
      } else if (action.source === 'waste') {
        // Try tableau
        for (let i = 0; i < TABLEAU_COLS; i++) {
          if (canPlaceOnTableau(card, state.tableau[i])) {
            moveFromHit(action, 'tableau', i);
            break;
          }
        }
      }
      break;
    }

    case 'doubleTap': {
      const card = getCardFromHit(action);
      if (!card) break;
      const fi = findFoundationFor(card, state.foundations);
      if (fi >= 0) moveFromHit(action, 'foundation', fi);
      break;
    }

    case 'drop': {
      if (!action.to) break;
      const { from, to } = action;
      moveFromHit(from, to.source, to.colIndex);
      break;
    }

    case 'button':
      if (action.button === 'undo') undo(state);
      if (action.button === 'new') newGame(true);
      if (action.button === 'stats') showStats = !showStats;
      break;
  }

  // Check win
  if (!state.won && isWon(state)) {
    state.won = true;
    spawnWinParticles();
    stats.gamesPlayed++;
    stats.gamesWon++;
    stats.currentStreak++;
    if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
    const time = state.elapsed;
    if (stats.bestTime === null || time < stats.bestTime) stats.bestTime = time;
    saveStats(stats);
    clearGameState();
  }

  // Check auto-complete
  if (!state.won && !autoCompleting && allCardsFaceUp(state)) {
    autoCompleting = true;
    autoCompleteTimer = 0;
  }

  saveGameState(serializeState(state));
  window.__gameState = state;
}

function getCardFromHit(hit) {
  if (hit.source === 'waste' && state.waste.length > 0) return state.waste[state.waste.length - 1];
  if (hit.source === 'tableau') return state.tableau[hit.colIndex][hit.cardIndex];
  if (hit.source === 'foundation') return state.foundations[hit.colIndex][state.foundations[hit.colIndex].length - 1];
  return null;
}

function moveFromHit(from, toType, toIndex) {
  if (from.source === 'waste') {
    moveCards(state, 'waste', 0, state.waste.length - 1, toType, toIndex);
  } else if (from.source === 'tableau') {
    moveCards(state, 'tableau', from.colIndex, from.cardIndex, toType, toIndex);
  } else if (from.source === 'foundation') {
    moveCards(state, 'foundation', from.colIndex, state.foundations[from.colIndex].length - 1, toType, toIndex);
  }
}

function loop(timestamp) {
  const dt = lastTime ? timestamp - lastTime : 16;
  lastTime = timestamp;

  // Update timer
  if (!state.won && state.moves > 0) {
    state.elapsed += dt;
  }

  // Auto-complete
  if (autoCompleting && !state.won) {
    autoCompleteTimer += dt;
    if (autoCompleteTimer >= AUTO_COMPLETE_DELAY) {
      autoCompleteTimer = 0;
      const ac = getAutoCompleteCard(state);
      if (ac) {
        if (ac.source === 'waste') {
          moveCards(state, 'waste', 0, state.waste.length - 1, 'foundation', ac.foundationIndex);
        } else {
          moveCards(state, 'tableau', ac.colIndex, state.tableau[ac.colIndex].length - 1, 'foundation', ac.foundationIndex);
        }
        if (isWon(state)) {
          state.won = true;
          spawnWinParticles();
          stats.gamesPlayed++;
          stats.gamesWon++;
          stats.currentStreak++;
          if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
          const time = state.elapsed;
          if (stats.bestTime === null || time < stats.bestTime) stats.bestTime = time;
          saveStats(stats);
          clearGameState();
          autoCompleting = false;
        }
        window.__gameState = state;
      } else {
        autoCompleting = false;
      }
    }
  }

  updateTweens(dt);
  render(dt);
  requestAnimationFrame(loop);
}

function render(dt) {
  const l = getLayout();
  clear();

  // Draw buttons (top bar)
  const btnW = 60, btnH = 28, btnFS = 12;
  drawButton(8, l.buttonY, btnW + 10, btnH, '📊 Stats', btnFS);

  // Timer and moves
  const secs = Math.floor(state.elapsed / 1000);
  const mins = Math.floor(secs / 60);
  const timeStr = `${mins}:${(secs % 60).toString().padStart(2, '0')}`;
  drawText(l.w / 2, l.buttonY + btnH / 2, `⏱ ${timeStr}  |  Moves: ${state.moves}`, 13, 'center');

  drawButton(l.w - btnW * 2 - 16, l.buttonY, btnW, btnH, 'Undo', btnFS);
  drawButton(l.w - btnW - 8, l.buttonY, btnW, btnH, 'New', btnFS);

  // Stock
  if (state.stock.length > 0) {
    drawCardBack(l.stockX, l.stockY);
    // Card count
    drawText(l.stockX + l.cardW / 2, l.stockY + l.cardH + 12, `${state.stock.length}`, 11, 'center');
  } else {
    drawEmptyPile(l.stockX, l.stockY, '↻');
  }

  // Waste
  if (state.waste.length > 0) {
    drawCardFace(l.wasteX, l.wasteY, state.waste[state.waste.length - 1]);
  } else {
    drawEmptyPile(l.wasteX, l.wasteY);
  }

  // Foundations
  const suitLabels = ['♠', '♥', '♦', '♣'];
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    const f = state.foundations[i];
    if (f.length > 0) {
      drawCardFace(l.foundationX[i], l.foundationY, f[f.length - 1]);
    } else {
      drawEmptyPile(l.foundationX[i], l.foundationY, suitLabels[i]);
    }
  }

  // Drop zone highlights during drag
  const drag = getDragState();
  if (drag && drag.dragging) {
    // Highlight valid drops
    const card = getCardFromHit(drag);
    if (card) {
      for (let i = 0; i < FOUNDATION_COUNT; i++) {
        if (canPlaceOnFoundation(card, state.foundations[i])) {
          drawHighlight(l.foundationX[i], l.foundationY);
        }
      }
      for (let i = 0; i < TABLEAU_COLS; i++) {
        if (canPlaceOnTableau(card, state.tableau[i])) {
          const col = state.tableau[i];
          if (col.length === 0) {
            drawHighlight(l.tableauX[i], l.tableauY);
          } else {
            const pos = getCardPosition(state, 'tableau', i, col.length - 1);
            drawHighlight(l.tableauX[i], pos.y);
          }
        }
      }
    }
  }

  // Tableau
  for (let col = 0; col < TABLEAU_COLS; col++) {
    const tcol = state.tableau[col];
    if (tcol.length === 0) {
      drawEmptyPile(l.tableauX[col], l.tableauY, 'K');
      continue;
    }
    for (let i = 0; i < tcol.length; i++) {
      // Skip if being dragged
      if (drag && drag.dragging && drag.source === 'tableau' && drag.colIndex === col && i >= drag.cardIndex) continue;

      const pos = getCardPosition(state, 'tableau', col, i);
      const card = tcol[i];
      if (card.faceUp) {
        drawCardFace(pos.x, pos.y, card);
      } else {
        drawCardBack(pos.x, pos.y);
      }
    }
  }

  // Draw dragged cards on top
  if (drag && drag.dragging) {
    const offsetX = drag.currentX - drag.startX;
    const offsetY = drag.currentY - drag.startY;

    if (drag.source === 'tableau') {
      const tcol = state.tableau[drag.colIndex];
      for (let i = drag.cardIndex; i < tcol.length; i++) {
        const pos = getCardPosition(state, 'tableau', drag.colIndex, i);
        drawCardFace(pos.x + offsetX, pos.y + offsetY, tcol[i]);
      }
    } else if (drag.source === 'waste' && state.waste.length > 0) {
      drawCardFace(l.wasteX + offsetX, l.wasteY + offsetY, state.waste[state.waste.length - 1]);
    } else if (drag.source === 'foundation') {
      const f = state.foundations[drag.colIndex];
      if (f.length > 0) {
        drawCardFace(l.foundationX[drag.colIndex] + offsetX, l.foundationY + offsetY, f[f.length - 1]);
      }
    }
  }

  // Win particles
  if (state.won) {
    updateAndDrawParticles(dt);
    drawText(l.w / 2, l.h / 2 - 40, '🎉 You Won! 🎉', 28, 'center');
    drawText(l.w / 2, l.h / 2, `Time: ${Math.floor(state.elapsed / 1000)}s  Moves: ${state.moves}`, 18, 'center');
    drawButton(l.w / 2 - 50, l.h / 2 + 30, 100, 36, 'New Game', 14);
  }

  // Stats overlay
  if (showStats) {
    drawStatsOverlay(l);
  }
}

function drawStatsOverlay(l) {
  // Semi-transparent background
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, l.w, l.h);

  const cx = l.w / 2;
  let y = l.h * 0.2;
  const gap = 30;
  drawText(cx, y, '📊 Statistics', 24, 'center'); y += gap * 1.5;
  drawText(cx, y, `Games Played: ${stats.gamesPlayed}`, 18, 'center'); y += gap;
  drawText(cx, y, `Games Won: ${stats.gamesWon}`, 18, 'center'); y += gap;
  const pct = stats.gamesPlayed > 0 ? Math.round(stats.gamesWon / stats.gamesPlayed * 100) : 0;
  drawText(cx, y, `Win Rate: ${pct}%`, 18, 'center'); y += gap;
  drawText(cx, y, `Current Streak: ${stats.currentStreak}`, 18, 'center'); y += gap;
  drawText(cx, y, `Best Streak: ${stats.bestStreak}`, 18, 'center'); y += gap;
  const best = stats.bestTime ? `${Math.floor(stats.bestTime / 1000)}s` : '--';
  drawText(cx, y, `Best Time: ${best}`, 18, 'center'); y += gap * 1.5;
  drawButton(cx - 40, y, 80, 32, 'Close', 14);
}

// Handle stats button and win new game button clicks via the action system
const origHandleAction = handleAction;
// Patch: the stats button click
document.getElementById('game').addEventListener('click', (e) => {
  const l = getLayout();
  const x = e.clientX, y = e.clientY;
  // Stats button
  if (x >= 8 && x <= 78 && y >= l.buttonY && y <= l.buttonY + 28) {
    showStats = !showStats;
  }
  // Stats close
  if (showStats) {
    const cx = l.w / 2;
    const closeY = l.h * 0.2 + 30 * 7.5;
    if (x >= cx - 40 && x <= cx + 40 && y >= closeY && y <= closeY + 32) {
      showStats = false;
    }
  }
  // Win new game button
  if (state.won) {
    const cx = l.w / 2;
    if (x >= cx - 50 && x <= cx + 50 && y >= l.h / 2 + 30 && y <= l.h / 2 + 66) {
      newGame(false);
    }
  }
});

init();
