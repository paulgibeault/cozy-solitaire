// main.js — Entry point, game loop, state machine
import { initRenderer, recalcLayout, getLayout, clear, drawCardBack, drawCardFace,
  drawEmptyPile, drawHighlight, drawButton, drawIconButton, drawHeaderBar, drawText, getCardPosition,
  spawnWinParticles, updateAndDrawParticles } from './renderer.js';
import { initInput, getDragState } from './input.js';
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
let overlayJustOpened = false; // prevents same-click close when an overlay is first shown
let lastTime = 0;

// Mode settings
let modeSettings = loadModeSettings();

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
  requestAnimationFrame(loop);
}

function newGame(countPrevious = true) {
  if (countPrevious && state && !state.won && state.moves > 0) {
    stats.gamesPlayed++;
    // We do not increment gamesWon
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
}

function handleAction(action) {
  // Allow closing overlays regardless of game state
  if (action.type === 'button') {
    if (action.button === 'stats') {
      const opening = !showStats;
      showStats = opening;
      showModeSelect = false;
      if (opening) overlayJustOpened = true;
      return;
    }
    if (action.button === 'mode') {
      const opening = !showModeSelect;
      showModeSelect = opening;
      showStats = false;
      if (opening) overlayJustOpened = true;
      return;
    }
    if (action.button === 'undo') { undo(state); saveGameState(serializeState(state)); return; }
    if (action.button === 'new') { newGame(true); return; }
    if (action.button === 'winNewGame') { newGame(false); return; }
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

  // Header bar — frosted dark panel
  const barH = 38;
  drawHeaderBar(l.w, barH);

  // Draw top bar buttons
  const btnW = 68, btnH = 28, btnFS = 12;
  const btnY = (barH - btnH) / 2;
  drawIconButton(8,           btnY, btnW, btnH, 'Stats', btnFS, 'stats');
  drawIconButton(8 + btnW + 6, btnY, btnW, btnH, 'Mode',  btnFS, 'mode');

  // Timer and moves (centered in header)
  const secs = Math.floor(state.elapsed / 1000);
  const mins = Math.floor(secs / 60);
  const timeStr = `${mins}:${(secs % 60).toString().padStart(2, '0')}`;
  drawText(l.w / 2, barH / 2, `♣  ${timeStr}  ·  ${state.moves} moves`, 12, 'center');

  drawButton(l.w - btnW * 2 - 14, btnY, btnW, btnH, 'Undo', btnFS);
  drawButton(l.w - btnW - 8,      btnY, btnW, btnH, 'New', btnFS);

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

  // Waste — fan cards in draw-3 mode
  if (state.waste.length > 0) {
    if (state.drawCount > 1) {
      // Show up to 3 fanned waste cards
      const fanCount = Math.min(state.drawCount, state.waste.length);
      const fanOffset = 15;
      for (let i = fanCount - 1; i >= 0; i--) {
        const cardIdx = state.waste.length - 1 - i;
        if (cardIdx >= 0) {
          const ox = (fanCount - 1 - i) * fanOffset;
          if (i === 0) {
            drawCardFace(l.wasteX + ox, l.wasteY, state.waste[cardIdx]);
          } else {
            drawCardFace(l.wasteX + ox, l.wasteY, state.waste[cardIdx], 0.9);
          }
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

  // Drop zone highlights during drag
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
  const modalH = 60 + rows * gap + gap * 1.5;
  const cy = l.h / 2;

  drawModalBox(ctx, cx, cy, modalW, modalH);

  let y = cy - modalH / 2 + 36;
  drawText(cx, y, '♠  Statistics', 22, 'center');

  // Divider
  y += 20;
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
  const modalH = 36 + 22 + 16 + gap + drawBtnH + gap + 16 + gap + recBtnH + gap + 18 + gap + 36 + 28;
  const cy = l.h / 2;

  drawModalBox(ctx, cx, cy, modalW, modalH);

  let y = cy - modalH / 2 + 36;

  drawText(cx, y, '♦  Game Mode', 22, 'center');

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

  // Current mode description
  const drawMode = DRAW_MODES.find(m => m.id === modeSettings.drawMode) || DRAW_MODES[0];
  const recycleMode = RECYCLE_MODES.find(m => m.id === modeSettings.recycleMode) || RECYCLE_MODES[0];
  drawText(cx, y, `${drawMode.label}  ·  ${recycleMode.label} passes`, 12, 'center');
  y += gap;

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
canvas.addEventListener('click', overlayClickHandler);
canvas.addEventListener('touchend', (e) => {
  if (showStats || showModeSelect || (state && state.won)) {
    const t = e.changedTouches[0];
    overlayClickHandler({
      clientX: t.clientX,
      clientY: t.clientY,
      stopPropagation: () => {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }
    });
  }
});

// Returns the bounding rect of the stats modal box
function statsModalRect(l) {
  const gap = 30;
  const rows = 6;
  const modalW = Math.min(300, l.w - 40);
  const modalH = 60 + rows * gap + gap * 1.5;
  return { x: l.w/2 - modalW/2, y: l.h/2 - modalH/2, w: modalW, h: modalH };
}

// Returns the bounding rect of the mode modal box
function modeModalRect(l) {
  const gap = 28;
  const drawBtnH = 34, recBtnH = 34;
  const modalW = Math.min(340, l.w - 40);
  const modalH = 36 + 22 + 16 + gap + drawBtnH + gap + 16 + gap + recBtnH + gap + 18 + gap + 36 + 28;
  return { x: l.w/2 - modalW/2, y: l.h/2 - modalH/2, w: modalW, h: modalH };
}

function overlayClickHandler(e) {
  // Skip processing if the overlay was just opened by this same click event
  if (overlayJustOpened) { overlayJustOpened = false; return; }

  const l = getLayout();
  const x = e.clientX, y = e.clientY;

  if (showStats) {
    const mr = statsModalRect(l);
    // Click outside modal closes it
    if (!inRect(x, y, mr.x, mr.y, mr.w, mr.h)) {
      showStats = false;
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
      e.stopPropagation();
      return;
    }

    // Reconstruct y positions matching drawModeOverlay
    let my = mr.y + 36 + 20 + 16 + 20; // title + divider area

    // Draw mode buttons
    my += gap; // "Draw Count" label
    const drawTotalW = DRAW_MODES.length * drawBtnW + (DRAW_MODES.length - 1) * 8;
    let dx = cx - drawTotalW / 2;
    for (const mode of DRAW_MODES) {
      if (inRect(x, y, dx, my, drawBtnW, drawBtnH)) {
        modeSettings.drawMode = mode.id;
        saveModeSettings(modeSettings);
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
        e.stopPropagation();
        return;
      }
      rx += recBtnW + 8;
    }
    my += recBtnH + gap;

    // Description line
    my += gap;

    // New Game button
    const btnW = modalW - 48;
    if (inRect(x, y, cx - btnW / 2, my, btnW, 36)) {
      showModeSelect = false;
      newGame(true);
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
      e.stopPropagation();
    }
  }
}

function inRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

init();
