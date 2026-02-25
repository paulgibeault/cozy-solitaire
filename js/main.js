// main.js — Entry point, game loop, state machine
import { initRenderer, recalcLayout, getLayout, clear, drawCardBack, drawCardFace,
  drawEmptyPile, drawHighlight, drawButton, drawText, getCardPosition,
  spawnWinParticles, updateAndDrawParticles } from './renderer.js';
import { initInput, getDragState, setOverlayState } from './input.js';
import { updateTweens, hasTweens } from './tween.js';
import { createGameState, dealStock, moveCards, findFoundationFor, canPlaceOnTableau,
  canPlaceOnFoundation, isWon, allCardsFaceUp, getAutoCompleteCard, undo, canRecycleStock,
  serializeState, deserializeState } from './game.js';
import { loadStats, saveStats, saveGameState, loadGameState, clearGameState,
  loadModeSettings, saveModeSettings } from './storage.js';
import { TABLEAU_COLS, FOUNDATION_COUNT, AUTO_COMPLETE_DELAY, COLORS,
  DRAW_MODES, RECYCLE_MODES } from './constants.js';

const canvas = document.getElementById('game');
let state = null;
let stats = loadStats();
let autoCompleting = false;
let autoCompleteTimer = 0;
let showStats = false;
let showModeSelect = false;
let lastTime = 0;

let modeSettings = loadModeSettings();

function syncOverlayState() {
  setOverlayState({
    showStats,
    showModeSelect,
    won: state ? state.won : false,
  });
}

function init() {
  initRenderer(canvas);
  initInput(canvas, handleAction);
  window.addEventListener('resize', () => { recalcLayout(); });

  const saved = loadGameState();
  if (saved) {
    state = deserializeState(saved);
  } else {
    newGame(false);
  }

  window.__gameState = state;
  syncOverlayState();
  requestAnimationFrame(loop);
}

function newGame(countPrevious = true) {
  if (countPrevious && state && !state.won) {
    stats.currentStreak = 0;
    saveStats(stats);
  }
  const drawMode = DRAW_MODES.find(m => m.id === modeSettings.drawMode) || DRAW_MODES[0];
  const recycleMode = RECYCLE_MODES.find(m => m.id === modeSettings.recycleMode) || RECYCLE_MODES[0];
  state = createGameState(drawMode.drawCount, recycleMode.passes);
  window.__gameState = state;
  autoCompleting = false;
  showStats = false;
  showModeSelect = false;
  clearGameState();
  syncOverlayState();
}

function handleAction(action) {
  if (action.type === 'button') {
    switch (action.button) {
      case 'stats':
        showStats = !showStats;
        showModeSelect = false;
        syncOverlayState();
        return;
      case 'mode':
        showModeSelect = !showModeSelect;
        showStats = false;
        syncOverlayState();
        return;
      case 'closeStats':
        showStats = false;
        syncOverlayState();
        return;
      case 'closeMode':
        showModeSelect = false;
        syncOverlayState();
        return;
      case 'undo':
        undo(state);
        saveGameState(serializeState(state));
        return;
      case 'new':
        newGame(true);
        return;
      case 'winNewGame':
        newGame(false);
        return;
      case 'applyMode':
        showModeSelect = false;
        newGame(true);
        syncOverlayState();
        return;
      default:
        // Mode selection buttons
        if (action.button.startsWith('draw:')) {
          modeSettings.drawMode = action.button.split(':')[1];
          saveModeSettings(modeSettings);
          return;
        }
        if (action.button.startsWith('recycle:')) {
          modeSettings.recycleMode = action.button.split(':')[1];
          saveModeSettings(modeSettings);
          return;
        }
    }
  }

  // Overlays block game interaction
  if (showStats || showModeSelect) return;
  if (state.won) return;
  if (autoCompleting) return;

  switch (action.type) {
    case 'tapStock':
      dealStock(state);
      break;

    case 'tap': {
      const card = getCardFromHit(action);
      if (!card) break;
      const fi = findFoundationFor(card, state.foundations);
      if (fi >= 0) {
        moveFromHit(action, 'foundation', fi);
      } else if (action.source === 'waste') {
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
    syncOverlayState();
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

  if (!state.won && state.moves > 0 && !showStats && !showModeSelect) {
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
          syncOverlayState();
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

  // Top bar buttons
  const btnW = 60, btnH = 28, btnFS = 12;
  drawButton(8, l.buttonY, btnW + 10, btnH, '📊 Stats', btnFS);
  drawButton(8 + btnW + 10 + 6, l.buttonY, btnW + 10, btnH, '🎮 Mode', btnFS);

  const secs = Math.floor(state.elapsed / 1000);
  const mins = Math.floor(secs / 60);
  const timeStr = `${mins}:${(secs % 60).toString().padStart(2, '0')}`;
  drawText(l.w / 2, l.buttonY + btnH / 2, `⏱ ${timeStr}  |  Moves: ${state.moves}`, 11, 'center');

  drawButton(l.w - btnW * 2 - 16, l.buttonY, btnW, btnH, 'Undo', btnFS);
  drawButton(l.w - btnW - 8, l.buttonY, btnW, btnH, 'New', btnFS);

  // Stock
  if (state.stock.length > 0) {
    drawCardBack(l.stockX, l.stockY);
    drawText(l.stockX + l.cardW / 2, l.stockY + l.cardH + 12, `${state.stock.length}`, 11, 'center');
  } else {
    const canRecycle = canRecycleStock(state);
    drawEmptyPile(l.stockX, l.stockY, canRecycle ? '↻' : '✕');
    if (state.maxPasses !== Infinity) {
      drawText(l.stockX + l.cardW / 2, l.stockY + l.cardH + 12,
        `${state.stockPasses}/${state.maxPasses}`, 10, 'center');
    }
  }

  // Waste
  if (state.waste.length > 0) {
    if (state.drawCount > 1) {
      const fanCount = Math.min(state.drawCount, state.waste.length);
      const fanOffset = 15;
      for (let i = fanCount - 1; i >= 0; i--) {
        const cardIdx = state.waste.length - 1 - i;
        if (cardIdx >= 0) {
          const ox = (fanCount - 1 - i) * fanOffset;
          drawCardFace(l.wasteX + ox, l.wasteY, state.waste[cardIdx], i === 0 ? 1 : 0.9);
        }
      }
    } else {
      drawCardFace(l.wasteX, l.wasteY, state.waste[state.waste.length - 1]);
    }
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

  // Drop zone highlights
  const drag = getDragState();
  if (drag && drag.dragging) {
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

  // Dragged cards
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

  // Win screen
  if (state.won) {
    updateAndDrawParticles(dt);
    drawText(l.w / 2, l.h / 2 - 40, '🎉 You Won! 🎉', 28, 'center');
    drawText(l.w / 2, l.h / 2, `Time: ${Math.floor(state.elapsed / 1000)}s  Moves: ${state.moves}`, 18, 'center');
    drawButton(l.w / 2 - 50, l.h / 2 + 30, 100, 36, 'New Game', 14);
  }

  // Overlays
  if (showStats) drawStatsOverlay(l);
  if (showModeSelect) drawModeOverlay(l);
}

function drawStatsOverlay(l) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.modeBg;
  ctx.fillRect(0, 0, l.w, l.h);

  const cx = l.w / 2;
  let y = l.h * 0.15;
  const gap = 32;
  drawText(cx, y, '📊 Statistics', 24, 'center'); y += gap * 1.5;
  drawText(cx, y, `Games Played: ${stats.gamesPlayed}`, 18, 'center'); y += gap;
  drawText(cx, y, `Games Won: ${stats.gamesWon}`, 18, 'center'); y += gap;
  const pct = stats.gamesPlayed > 0 ? Math.round(stats.gamesWon / stats.gamesPlayed * 100) : 0;
  drawText(cx, y, `Win Rate: ${pct}%`, 18, 'center'); y += gap;
  drawText(cx, y, `Current Streak: ${stats.currentStreak}`, 18, 'center'); y += gap;
  drawText(cx, y, `Best Streak: ${stats.bestStreak}`, 18, 'center'); y += gap;
  const best = stats.bestTime ? `${Math.floor(stats.bestTime / 1000)}s` : '--';
  drawText(cx, y, `Best Time: ${best}`, 18, 'center'); y += gap * 1.5;
  drawButton(cx - 50, y, 100, 36, 'Close', 14);
}

function drawModeOverlay(l) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.modeBg;
  ctx.fillRect(0, 0, l.w, l.h);

  const cx = l.w / 2;
  let y = l.h * 0.12;
  const gap = 28;

  drawText(cx, y, '🎮 Game Mode', 24, 'center'); y += gap * 1.5;

  drawText(cx, y, 'Draw Count', 16, 'center'); y += gap;
  const drawBtnW = 80, drawBtnH = 34;
  const drawTotalW = DRAW_MODES.length * drawBtnW + (DRAW_MODES.length - 1) * 8;
  let dx = cx - drawTotalW / 2;
  for (const mode of DRAW_MODES) {
    const isActive = modeSettings.drawMode === mode.id;
    drawModeButton(dx, y, drawBtnW, drawBtnH, mode.label, isActive);
    dx += drawBtnW + 8;
  }
  y += drawBtnH + gap;

  drawText(cx, y, 'Deck Passes', 16, 'center'); y += gap;
  const recBtnW = 90, recBtnH = 34;
  const recTotalW = RECYCLE_MODES.length * recBtnW + (RECYCLE_MODES.length - 1) * 8;
  let rx = cx - recTotalW / 2;
  for (const mode of RECYCLE_MODES) {
    const isActive = modeSettings.recycleMode === mode.id;
    drawModeButton(rx, y, recBtnW, recBtnH, mode.label, isActive);
    rx += recBtnW + 8;
  }
  y += recBtnH + gap;

  const drawMode = DRAW_MODES.find(m => m.id === modeSettings.drawMode) || DRAW_MODES[0];
  const recycleMode = RECYCLE_MODES.find(m => m.id === modeSettings.recycleMode) || RECYCLE_MODES[0];
  drawText(cx, y, `${drawMode.label} · ${recycleMode.label} passes`, 14, 'center');
  y += gap * 1.2;
  drawText(cx, y, '⚠️ Starting new game applies changes', 12, 'center');
  y += gap;

  const btnW = 100, btnGap = 12;
  drawButton(cx - btnW - btnGap / 2, y, btnW, 36, '▶ New Game', 13);
  drawButton(cx + btnGap / 2, y, btnW, 36, 'Close', 13);
}

function drawModeButton(x, y, w, h, text, active) {
  const ctx = canvas.getContext('2d');
  const r = 6;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = active ? COLORS.modeButtonActive : COLORS.modeButton;
  ctx.fill();
  if (active) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.modeButtonText;
  ctx.font = `bold 13px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);
}

init();
