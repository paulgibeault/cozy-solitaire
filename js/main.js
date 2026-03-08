// main.js — Entry point, game loop, state machine
import { initRenderer, recalcLayout, getLayout, clear, drawCardBack, drawCardFace,
  drawEmptyPile, drawHighlight, drawText, getCardPosition, drawButton,
  spawnWinParticles, updateAndDrawParticles } from './renderer.js';
import { initInput, getDragState } from './input.js';
import { updateTweens, hasTweens } from './tween.js';
import { createGameState, dealStock, moveCards, findFoundationFor, canPlaceOnTableau,
  canPlaceOnFoundation, isWon, allCardsFaceUp, getAutoCompleteCard, undo, undoTo, canRecycleStock,
  serializeState, deserializeState } from './game.js';
import { loadStats, saveStats, saveGameState, loadGameState, clearGameState,
  loadModeSettings, saveModeSettings } from './storage.js';
import { TABLEAU_COLS, FOUNDATION_COUNT, AUTO_COMPLETE_DELAY, COLORS,
  DRAW_MODES, RECYCLE_MODES } from './constants.js';

const canvas = document.getElementById('game');
let state = null;

// Mode settings — must be initialized before getGameTypeKey() is called
let modeSettings = loadModeSettings();

// Derive a unique key for the current game type (draw mode + recycle mode)
function getGameTypeKey() {
  return `${modeSettings.drawMode}_${modeSettings.recycleMode}`;
}

let stats = loadStats(getGameTypeKey());
let autoCompleting = false;
let autoCompleteTimer = 0;
let showStats = false;
let showModeSelect = false;
let overlayJustOpened = false; // prevents same-click close when an overlay is first shown
let lastTime = 0;
let rafId = null;        // current requestAnimationFrame handle
let dirty = true;        // true = frame needs to be drawn
let lastTimerSec = -1;   // last rendered timer second, for detecting changes

function init() {
  initRenderer(canvas);
  initInput(canvas, handleAction, markDirty);
  window.addEventListener('resize', () => { recalcLayout(); markDirty(); });

  // Bind UI Events
  const dropdown = document.getElementById('logo-dropdown');
  document.getElementById('app-title-container').addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    const caret = document.querySelector('.dropdown-caret');
    caret.style.transform = dropdown.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  window.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !document.getElementById('app-title-container').contains(e.target)) {
      dropdown.classList.add('hidden');
      document.querySelector('.dropdown-caret').style.transform = 'rotate(0deg)';
    }
  });

  document.getElementById('btn-restart').addEventListener('click', () => { dropdown.classList.add('hidden'); document.querySelector('.dropdown-caret').style.transform = 'rotate(0deg)'; restartGame(); markDirty(); });
  
  // Floating Undo Button Logic
  const undoBtn = document.getElementById('btn-undo-floating');
  const undoMenu = document.getElementById('undo-menu');
  const undoList = document.getElementById('undo-list');
  let undoTimer = null;
  let undoLongPressed = false;

  const showUndoMenu = () => {
    undoLongPressed = true;
    undoList.innerHTML = '';
    
    if (state.history.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'dropdown-btn';
      empty.style.color = '#888';
      empty.style.cursor = 'default';
      empty.innerText = 'No history available';
      undoList.appendChild(empty);
    } else {
      // Show newest first (reverse order of history array)
      for (let i = state.history.length - 1; i >= 0; i--) {
        const item = state.history[i];
        const btn = document.createElement('button');
        btn.className = 'dropdown-btn';
        btn.innerHTML = `<span class="icon">↶</span> ${item.actionDesc || 'Previous State'} <span style="font-size: 10px; color: #888; margin-left: auto;">[${item.moves}]</span>`;
        btn.onclick = (e) => {
          e.stopPropagation();
          undoTo(state, i);
          saveGameState(serializeState(state));
          undoMenu.classList.add('hidden');
          markDirty();
        };
        undoList.appendChild(btn);
      }
    }
    undoMenu.classList.remove('hidden');
    overlayJustOpened = true; 
  };

  const handleUndoStart = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    // If the menu is open, this click should just close it without triggering undo
    if (!undoMenu.classList.contains('hidden')) {
      undoMenu.classList.add('hidden');
      if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
      undoLongPressed = true; // prevent undo action
      return;
    }

    undoLongPressed = false;
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(showUndoMenu, 400);
  };

  // Close menu when clicking anywhere else
  window.addEventListener('pointerdown', (e) => {
    if (!undoMenu.classList.contains('hidden')) {
      if (!undoMenu.contains(e.target) && !undoBtn.contains(e.target)) {
        undoMenu.classList.add('hidden');
        markDirty();
      }
    }
  });

  const handleUndoEnd = (e) => {
    if (undoTimer) {
      clearTimeout(undoTimer);
      undoTimer = null;
      if (!undoLongPressed && (e.target === undoBtn || undoBtn.contains(e.target))) {
        if (undo(state)) {
          saveGameState(serializeState(state));
          markDirty();
        }
      }
    }
  };

  undoBtn.addEventListener('pointerdown', handleUndoStart);
  window.addEventListener('pointerup', handleUndoEnd);
  undoBtn.addEventListener('contextmenu', e => e.preventDefault());
  
  document.getElementById('btn-stats').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    document.querySelector('.dropdown-caret').style.transform = 'rotate(0deg)';
    if (showModeSelect) {
      showModeSelect = false;
      document.getElementById('seed-input')?.classList.add('hidden');
      markDirty();
      return;
    }
    const opening = !showStats;
    showStats = opening;
    showModeSelect = false;
    document.getElementById('seed-input')?.classList.add('hidden');
    if (opening) overlayJustOpened = true;
    markDirty();
  });
  
  document.getElementById('btn-mode').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    document.querySelector('.dropdown-caret').style.transform = 'rotate(0deg)';
    if (showStats) {
      showStats = false;
      markDirty();
      return;
    }
    const opening = !showModeSelect;
    showModeSelect = opening;
    if (!opening) {
      document.getElementById('seed-input')?.classList.add('hidden');
    }
    showStats = false;
    if (opening) overlayJustOpened = true;
    markDirty();
  });

  // Pause the loop when the page/tab/app is hidden (screen off, app switched)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      lastTime = 0; // reset dt to avoid a massive jump on resume
      markDirty();
    }
    // When hidden, the loop will naturally stop since scheduleFrame won't be called
  });

  const saved = loadGameState();
  if (saved) {
    state = deserializeState(saved);
  } else {
    newGame(false);
  }

  updateSeedDisplay();
  window.__gameState = state;
  scheduleFrame();
}

function newGame(countPrevious = true, seed = undefined) {
  if (countPrevious && state && !state.won && state.moves > 0) {
    stats.gamesPlayed++;
    // We do not increment gamesWon
    stats.currentStreak = 0;
    saveStats(stats, getGameTypeKey());
  }
  const drawMode = DRAW_MODES.find(m => m.id === modeSettings.drawMode) || DRAW_MODES[0];
  const recycleMode = RECYCLE_MODES.find(m => m.id === modeSettings.recycleMode) || RECYCLE_MODES[0];
  state = createGameState(drawMode.drawCount, recycleMode.passes, seed);
  updateSeedDisplay();
  window.__gameState = state;
  autoCompleting = false;
  showStats = false;
  showModeSelect = false;
  document.getElementById('seed-input')?.classList.add('hidden');
  clearGameState();
}

function restartGame() {
  if (!state || !state.initialTableau || !state.initialStock) return;
  // Restore the exact initial deal without touching stats
  state.tableau = state.initialTableau.map(col => col.map(card => ({ ...card })));
  state.foundations = Array.from({ length: FOUNDATION_COUNT }, () => []);
  state.stock = state.initialStock.map(card => ({ ...card }));
  state.waste = [];
  state.moves = 0;
  state.elapsed = 0;
  state.startTime = Date.now();
  state.won = false;
  state.history = [];
  state.stockPasses = 0;
  autoCompleting = false;
  window.__gameState = state;
  updateSeedDisplay();
  saveGameState(serializeState(state));
}

function updateSeedDisplay() {
  const display = document.getElementById('seed-display');
  const span = document.getElementById('seed-value');
  if (state && state.seed !== undefined) {
    span.innerText = state.seed;
    display.classList.remove('hidden');
  } else {
    display.classList.add('hidden');
  }
}

function handleAction(action) {
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
    saveStats(stats, getGameTypeKey());
    clearGameState();
  }

  // Check auto-complete
  if (!state.won && !autoCompleting && allCardsFaceUp(state)) {
    autoCompleting = true;
    autoCompleteTimer = 0;
  }

  saveGameState(serializeState(state));
  window.__gameState = state;
  markDirty();
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

function scheduleFrame() {
  if (rafId === null) {
    rafId = requestAnimationFrame(loop);
  }
}

function markDirty() {
  dirty = true;
  scheduleFrame();
}

function loop(timestamp) {
  rafId = null;
  const dt = lastTime ? timestamp - lastTime : 16;
  lastTime = timestamp;

  if (!state.won && state.moves > 0 && !showStats && !showModeSelect) {
    state.elapsed += dt;
    // Mark dirty only when the displayed second changes (once per second)
    const currentSec = Math.floor(state.elapsed / 1000);
    if (currentSec !== lastTimerSec) {
      lastTimerSec = currentSec;
      dirty = true;
    }
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
          saveStats(stats, getGameTypeKey());
          clearGameState();
          autoCompleting = false;
        }
        window.__gameState = state;
        dirty = true;
      } else {
        autoCompleting = false;
      }
    }
    scheduleFrame(); // keep loop alive during auto-complete
  }

  const tweensActive = hasTweens();
  updateTweens(dt);
  if (tweensActive) dirty = true;

  // Win particles need continuous updates
  if (state.won) dirty = true;

  // Keep loop alive while a drag is in progress
  const dragActive = !!(getDragState() && getDragState().dragging);
  if (dragActive) dirty = true;

  if (dirty) {
    dirty = false;
    render(dt);
  }

  // Re-schedule only if something ongoing needs continuous frames
  if (autoCompleting || tweensActive || state.won || dragActive) {
    scheduleFrame();
  }
}

function render(dt) {
  const l = getLayout();
  clear();

  // Update HTML header timer and moves
  const secs = Math.floor(state.elapsed / 1000);
  const mins = Math.floor(secs / 60);
  document.getElementById('time-display').innerText = `${mins}:${(secs % 60).toString().padStart(2, '0')}`;
  document.getElementById('moves-display').innerText = state.moves;

  // Stock
  if (state.stock.length > 0) {
    drawCardBack(l.stockX, l.stockY);
    drawText(l.stockX + l.cardW / 2, l.stockY + l.cardH + 12, `${state.stock.length}`, 11, 'center');
  } else {
    const canRecycle = canRecycleStock(state);
    drawEmptyPile(l.stockX, l.stockY, canRecycle ? '↻' : '✕');
    // Show pass count if limited
    if (state.maxPasses !== Infinity) {
      drawText(l.stockX + l.cardW / 2, l.stockY + l.cardH + 12,
        `${state.stockPasses}/${state.maxPasses}`, 10, 'center');
    }
  }

  // Get current drag state for the rest of render
  const drag = getDragState();

  // Waste — fan cards in draw-3 mode
  // FIX: skip the top waste card if it's currently being dragged (prevents ghost)
  const wasteDrag = drag && drag.dragging && drag.source === 'waste';
  if (state.waste.length > 0) {
    if (state.drawCount > 1) {
      // Show up to 3 fanned waste cards
      const fanCount = Math.min(state.drawCount, state.waste.length);
      const fanOffset = 15;
      for (let i = fanCount - 1; i >= 0; i--) {
        const cardIdx = state.waste.length - 1 - i;
        if (cardIdx >= 0) {
          // i === 0 is the top (draggable) card — skip it while dragging
          if (i === 0 && wasteDrag) continue;
          const ox = (fanCount - 1 - i) * fanOffset;
          if (i === 0) {
            drawCardFace(l.wasteX + ox, l.wasteY, state.waste[cardIdx]);
          } else {
            drawCardFace(l.wasteX + ox, l.wasteY, state.waste[cardIdx], 0.9);
          }
        }
      }
    } else {
      if (!wasteDrag) {
        drawCardFace(l.wasteX, l.wasteY, state.waste[state.waste.length - 1]);
      }
    }
  } else {
    drawEmptyPile(l.wasteX, l.wasteY);
  }

  // Foundations
  // FIX: skip the top foundation card if it's being dragged (prevents ghost)
  const suitLabels = ['♠', '♥', '♦', '♣'];
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    const f = state.foundations[i];
    const foundationDrag = drag && drag.dragging && drag.source === 'foundation' && drag.colIndex === i;
    if (f.length > 0) {
      if (!foundationDrag) drawCardFace(l.foundationX[i], l.foundationY, f[f.length - 1]);
    } else {
      drawEmptyPile(l.foundationX[i], l.foundationY, suitLabels[i]);
    }
  }

  // Drop zone highlights during drag
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

  // Win screen
  if (state.won) {
    updateAndDrawParticles(dt);
    drawText(l.w / 2, l.h / 2 - 40, '🎉 You Won! 🎉', 28, 'center');
    drawText(l.w / 2, l.h / 2, `Time: ${Math.floor(state.elapsed / 1000)}s  Moves: ${state.moves}`, 18, 'center');
    drawButton(l.w / 2 - 50, l.h / 2 + 30, 100, 36, 'New Game', 14);
  }

  // Stats overlay
  if (showStats) drawStatsOverlay(l);

  // Mode select overlay
  if (showModeSelect) drawModeOverlay(l);
}

function drawModalBox(ctx, cx, cy, w, h) {
  const r = 12;
  const x = cx - w / 2, y = cy - h / 2;
  // Box fill
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
  ctx.fillStyle = COLORS.modalBox;
  ctx.fill();
  // Border
  ctx.strokeStyle = COLORS.modalBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Inset border line
  const inset = 5;
  ctx.beginPath();
  ctx.moveTo(x + r + inset, y + inset);
  ctx.lineTo(x + w - r - inset, y + inset);
  ctx.quadraticCurveTo(x + w - inset, y + inset, x + w - inset, y + r + inset);
  ctx.lineTo(x + w - inset, y + h - r - inset);
  ctx.quadraticCurveTo(x + w - inset, y + h - inset, x + w - r - inset, y + h - inset);
  ctx.lineTo(x + r + inset, y + h - inset);
  ctx.quadraticCurveTo(x + inset, y + h - inset, x + inset, y + h - r - inset);
  ctx.lineTo(x + inset, y + r + inset);
  ctx.quadraticCurveTo(x + inset, y + inset, x + r + inset, y + inset);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(138,112,80,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawStatsOverlay(l) {
  const ctx = canvas.getContext('2d');
  const cx = l.w / 2;
  const gap = 30;
  const rows = 6;
  const modalW = Math.min(300, l.w - 40);
  // Extra row for the game-type subtitle
  const modalH = 60 + rows * gap + gap * 1.5 + 22;
  const cy = l.h / 2;

  drawModalBox(ctx, cx, cy, modalW, modalH);

  let y = cy - modalH / 2 + 36;
  drawText(cx, y, '♠  Statistics', 22, 'center');

  // Game-type subtitle
  const drawMode    = DRAW_MODES.find(m => m.id === modeSettings.drawMode) || DRAW_MODES[0];
  const recycleMode = RECYCLE_MODES.find(m => m.id === modeSettings.recycleMode) || RECYCLE_MODES[0];
  y += 20;
  ctx.fillStyle = 'rgba(192,168,112,0.75)';
  ctx.font = '11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${drawMode.label}  ·  ${recycleMode.label}`, cx, y);

  // Divider
  y += 14;
  ctx.strokeStyle = COLORS.modalBorder;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - modalW/2 + 20, y); ctx.lineTo(cx + modalW/2 - 20, y); ctx.stroke();
  y += 18;

  const pct = stats.gamesPlayed > 0 ? Math.round(stats.gamesWon / stats.gamesPlayed * 100) : 0;
  const best = stats.bestTime ? `${Math.floor(stats.bestTime / 1000)}s` : '--';

  const rows2 = [
    ['Games Played', stats.gamesPlayed],
    ['Games Won',    stats.gamesWon],
    ['Win Rate',     `${pct}%`],
    ['Current Streak', stats.currentStreak],
    ['Best Streak',  stats.bestStreak],
    ['Best Time',    best],
  ];
  for (const [label, val] of rows2) {
    ctx.fillStyle = 'rgba(192,168,112,0.55)';
    ctx.font = '13px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx - modalW/2 + 24, y);
    ctx.fillStyle = COLORS.modalTitle;
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(val), cx + modalW/2 - 24, y);
    y += gap;
  }
}

function drawModeOverlay(l) {
  const ctx = canvas.getContext('2d');
  const cx = l.w / 2;
  const gap = 28;

  // Calculate modal dimensions
  const drawBtnW = 80, drawBtnH = 34;
  const recBtnW = 90, recBtnH = 34;
  const modalW = Math.min(340, l.w - 40);
  const modalH = 36 + 22 + 16 + gap + drawBtnH + gap + 16 + gap + recBtnH + gap + 18 + gap + 36 + gap + 36;
  const cy = l.h / 2;

  drawModalBox(ctx, cx, cy, modalW, modalH);

  let y = cy - modalH / 2 + 36;

  drawText(cx, y, '▶  New Game Setup', 22, 'center');

  // Divider
  y += 20;
  ctx.strokeStyle = COLORS.modalBorder;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - modalW/2 + 20, y); ctx.lineTo(cx + modalW/2 - 20, y); ctx.stroke();
  y += 20;

  // Draw count
  drawText(cx, y, 'Draw Count', 13, 'center');
  y += gap;
  const drawTotalW = DRAW_MODES.length * drawBtnW + (DRAW_MODES.length - 1) * 8;
  let dx = cx - drawTotalW / 2;
  for (const mode of DRAW_MODES) {
    const isActive = modeSettings.drawMode === mode.id;
    drawModeButton(dx, y, drawBtnW, drawBtnH, mode.label, isActive);
    dx += drawBtnW + 8;
  }
  y += drawBtnH + gap;

  // Deck recycling
  drawText(cx, y, 'Deck Passes', 13, 'center');
  y += gap;
  const recTotalW = RECYCLE_MODES.length * recBtnW + (RECYCLE_MODES.length - 1) * 8;
  let rx = cx - recTotalW / 2;
  for (const mode of RECYCLE_MODES) {
    const isActive = modeSettings.recycleMode === mode.id;
    drawModeButton(rx, y, recBtnW, recBtnH, mode.label, isActive);
    rx += recBtnW + 8;
  }
  y += recBtnH + gap;

  // Optional Seed Input
  drawText(cx, y - 10, 'Seed', 12, 'center');
  const seedBoxW = 160;
  const seedBoxH = 30;
  
  const seedInput = document.getElementById('seed-input');
  if (seedInput) {
    seedInput.style.left = `${cx - seedBoxW / 2}px`;
    seedInput.style.top = `${y}px`;
    if (seedInput.classList.contains('hidden')) {
      seedInput.classList.remove('hidden');
      seedInput.value = window._pendingSeed || '';
    }
  }
  y += gap + seedBoxH;

  // New Game button (centered, full width of modal minus padding)
  const btnW = modalW - 48;
  drawButton(cx - btnW / 2, y, btnW, 36, '▶  New Game', 13);
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
  ctx.strokeStyle = active ? COLORS.modeButtonActiveBorder : 'rgba(138,112,80,0.3)';
  ctx.lineWidth = active ? 1.5 : 1;
  ctx.stroke();
  ctx.fillStyle = active ? COLORS.buttonText : COLORS.modeButtonText;
  ctx.font = `${active ? 'bold' : 'normal'} 13px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);
}

// Handle overlay button clicks — integrated into input system
// The stats close, mode buttons, and win new-game buttons are handled
// through the input hitTest via button sources, routed to handleAction.

// We need to extend the hitTest in input.js to detect overlay buttons.
// Instead, we add a global click handler that detects overlay-specific clicks.
window.addEventListener('click', overlayClickHandler);
window.addEventListener('touchend', (e) => {
  if (showStats || showModeSelect || (state && state.won)) {
    const t = e.changedTouches[0];
    overlayClickHandler({
      clientX: t.clientX,
      clientY: t.clientY,
      stopPropagation: () => {
        // e.stopPropagation();
      }
    });
  }
});

// Returns the bounding rect of the stats modal box
function statsModalRect(l) {
  const gap = 30;
  const rows = 6;
  const modalW = Math.min(300, l.w - 40);
  const modalH = 60 + rows * gap + gap * 1.5 + 22; // +22 for game-type subtitle
  return { x: l.w/2 - modalW/2, y: l.h/2 - modalH/2, w: modalW, h: modalH };
}

// Returns the bounding rect of the mode modal box
function modeModalRect(l) {
  const gap = 28;
  const drawBtnH = 34, recBtnH = 34;
  const modalW = Math.min(340, l.w - 40);
  const modalH = 36 + 22 + 16 + gap + drawBtnH + gap + 16 + gap + recBtnH + gap + 18 + gap + 36 + gap + 36;
  return { x: l.w/2 - modalW/2, y: l.h/2 - modalH/2, w: modalW, h: modalH };
}

function overlayClickHandler(e) {
  // Ignore clicks that land directly on our HTML input
  if (e.target && e.target.id === 'seed-input') return;

  // Skip processing if the overlay was just opened by this same click event
  if (overlayJustOpened) { overlayJustOpened = false; return; }

  const l = getLayout();
  const x = e.clientX, y = e.clientY;

  if (showStats) {
    const mr = statsModalRect(l);
    // Click outside modal closes it
    if (!inRect(x, y, mr.x, mr.y, mr.w, mr.h)) {
      showStats = false;
      markDirty();
      e.stopPropagation();
    }
    return;
  }

  if (showModeSelect) {
    const mr = modeModalRect(l);
    const cx = l.w / 2;
    const gap = 28;
    const drawBtnW = 80, drawBtnH = 34;
    const recBtnW = 90, recBtnH = 34;
    const modalW = mr.w;

    // Click outside modal closes it
    if (!inRect(x, y, mr.x, mr.y, mr.w, mr.h)) {
      showModeSelect = false;
      document.getElementById('seed-input')?.classList.add('hidden');
      markDirty();
      e.stopPropagation();
      return;
    }

    // Reconstruct y positions matching drawModeOverlay
    let my = mr.y + 36 + 20 + 16 + 20; // title + divider area
    // NOTE: When mode changes, reload stats for the new game type
    // This reload happens in the New Game button handler below

    // Draw mode buttons
    my += gap; // "Draw Count" label
    const drawTotalW = DRAW_MODES.length * drawBtnW + (DRAW_MODES.length - 1) * 8;
    let dx = cx - drawTotalW / 2;
    for (const mode of DRAW_MODES) {
      if (inRect(x, y, dx, my, drawBtnW, drawBtnH)) {
        modeSettings.drawMode = mode.id;
        saveModeSettings(modeSettings);
        markDirty();
        e.stopPropagation();
        return;
      }
      dx += drawBtnW + 8;
    }
    my += drawBtnH + gap;

    // Recycle mode buttons
    my += gap; // "Deck Passes" label
    const recTotalW = RECYCLE_MODES.length * recBtnW + (RECYCLE_MODES.length - 1) * 8;
    let rx = cx - recTotalW / 2;
    for (const mode of RECYCLE_MODES) {
      if (inRect(x, y, rx, my, recBtnW, recBtnH)) {
        modeSettings.recycleMode = mode.id;
        saveModeSettings(modeSettings);
        markDirty();
        e.stopPropagation();
        return;
      }
      rx += recBtnW + 8;
    }
    my += recBtnH + gap;

    // Seed Box
    const seedBoxH = 30;
    my += gap + seedBoxH;

    // New Game button
    const btnW = modalW - 48;
    if (inRect(x, y, cx - btnW / 2, my, btnW, 36)) {
      showModeSelect = false;
      document.getElementById('seed-input')?.classList.add('hidden');
      
      const seedInputVal = document.getElementById('seed-input')?.value;
      let explicitSeed = seedInputVal ? parseInt(seedInputVal, 10) : undefined;
      if (explicitSeed !== undefined) {
        if (isNaN(explicitSeed)) explicitSeed = undefined;
        else explicitSeed = Math.max(1, Math.min(999999, explicitSeed));
      }
      
      newGame(true, explicitSeed);
      if (document.getElementById('seed-input')) {
        document.getElementById('seed-input').value = ""; // clear after starting
      }
      window._pendingSeed = ""; // keep consistent
      
      // Reload stats for the potentially new game type
      stats = loadStats(getGameTypeKey());
      markDirty();
      e.stopPropagation();
      return;
    }
    return;
  }

  // Win new game button
  if (state && state.won) {
    const cx = l.w / 2;
    if (inRect(x, y, cx - 50, l.h / 2 + 30, 100, 36)) {
      newGame(false);
      markDirty();
      e.stopPropagation();
    }
  }
}

function inRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

init();
