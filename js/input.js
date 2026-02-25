// input.js — Mouse/touch input, drag-and-drop
import { getLayout, getCardPosition } from './renderer.js';
import { TABLEAU_COLS, FOUNDATION_COUNT, DROP_ZONE_EXPAND_X, DROP_ZONE_EXPAND_Y,
  DRAW_MODES, RECYCLE_MODES } from './constants.js';

let onAction = null;
let dragState = null;
let lastTapTime = 0;
let lastTapTarget = null;
let touchActive = false;

// Overlay state — set by main.js so input knows what's visible
let overlayState = { showStats: false, showModeSelect: false, won: false };

export function setOverlayState(s) { overlayState = s; }

export function initInput(canvas, actionCallback) {
  onAction = actionCallback;

  canvas.addEventListener('mousedown', e => {
    if (touchActive) return;
    handleStart(e.clientX, e.clientY);
  });
  canvas.addEventListener('mousemove', e => {
    if (touchActive) return;
    handleMove(e.clientX, e.clientY);
  });
  canvas.addEventListener('mouseup', e => {
    if (touchActive) return;
    handleEnd(e.clientX, e.clientY);
  });

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    touchActive = true;
    const t = e.touches[0];
    handleStart(t.clientX, t.clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    handleEnd(t.clientX, t.clientY);
    setTimeout(() => { touchActive = false; }, 400);
  }, { passive: false });
}

export function getDragState() { return dragState; }

function handleStart(x, y) {
  const hit = hitTest(x, y);
  if (!hit) return;

  // Double tap detection (only for game elements, not buttons/overlays)
  if (hit.source !== 'button') {
    const now = Date.now();
    const isDoubleTap = (now - lastTapTime < 400) &&
      lastTapTarget && lastTapTarget.source === hit.source &&
      lastTapTarget.colIndex === hit.colIndex &&
      lastTapTarget.cardIndex === hit.cardIndex;
    lastTapTime = now;
    lastTapTarget = hit;

    if (isDoubleTap) {
      onAction({ type: 'doubleTap', ...hit });
      dragState = null;
      return;
    }
  }

  // Immediate actions (no drag)
  if (hit.source === 'stock') {
    onAction({ type: 'tapStock' });
    return;
  }
  if (hit.source === 'button') {
    onAction({ type: 'button', button: hit.button });
    return;
  }

  // Start drag
  dragState = {
    ...hit,
    startX: x,
    startY: y,
    currentX: x,
    currentY: y,
    dragging: false,
  };
}

function handleMove(x, y) {
  if (!dragState) return;
  const dx = x - dragState.startX;
  const dy = y - dragState.startY;
  if (!dragState.dragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
    dragState.dragging = true;
  }
  dragState.currentX = x;
  dragState.currentY = y;
}

function handleEnd(x, y) {
  if (!dragState) return;
  if (dragState.dragging) {
    const drop = findDropTarget(x, y);
    onAction({ type: 'drop', from: dragState, to: drop });
  } else {
    onAction({ type: 'tap', ...dragState });
  }
  dragState = null;
}

function hitTest(x, y) {
  const l = getLayout();
  const state = window.__gameState;
  if (!state) return null;

  // ── OVERLAY: Stats ──
  if (overlayState.showStats) {
    return hitTestStatsOverlay(x, y, l);
  }

  // ── OVERLAY: Mode Select ──
  if (overlayState.showModeSelect) {
    return hitTestModeOverlay(x, y, l);
  }

  // ── OVERLAY: Win screen ──
  if (overlayState.won) {
    const cx = l.w / 2;
    if (inRect(x, y, cx - 50, l.h / 2 + 30, 100, 36)) {
      return { source: 'button', button: 'winNewGame' };
    }
    return null; // Block all other input during win
  }

  // ── TOP BAR BUTTONS ──
  const btnW = 60, btnH = 28, btnPad = 10;

  // Stats button
  const statsX = 8, statsW = btnW + 10;
  if (inRect(x, y, statsX - btnPad, l.buttonY - btnPad, statsW + btnPad * 2, btnH + btnPad * 2)) {
    return { source: 'button', button: 'stats' };
  }
  // Mode button
  const modeX = statsX + statsW + 6, modeW = btnW + 10;
  if (inRect(x, y, modeX - btnPad, l.buttonY - btnPad, modeW + btnPad * 2, btnH + btnPad * 2)) {
    return { source: 'button', button: 'mode' };
  }
  // Undo
  const undoX = l.w - btnW * 2 - 16;
  if (inRect(x, y, undoX - btnPad, l.buttonY - btnPad, btnW + btnPad * 2, btnH + btnPad * 2)) {
    return { source: 'button', button: 'undo' };
  }
  // New
  const newX = l.w - btnW - 8;
  if (inRect(x, y, newX - btnPad, l.buttonY - btnPad, btnW + btnPad * 2, btnH + btnPad * 2)) {
    return { source: 'button', button: 'new' };
  }

  // ── GAME ELEMENTS ──

  // Stock
  if (inRect(x, y, l.stockX, l.stockY, l.cardW, l.cardH)) {
    return { source: 'stock' };
  }

  // Waste
  if (state.waste.length > 0 && inRect(x, y, l.wasteX, l.wasteY, l.cardW + (state.drawCount > 1 ? 30 : 0), l.cardH)) {
    return { source: 'waste', colIndex: 0, cardIndex: state.waste.length - 1 };
  }

  // Foundations
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    if (inRect(x, y, l.foundationX[i], l.foundationY, l.cardW, l.cardH)) {
      if (state.foundations[i].length > 0) {
        return { source: 'foundation', colIndex: i, cardIndex: state.foundations[i].length - 1 };
      }
      return { source: 'foundationEmpty', colIndex: i };
    }
  }

  // Tableau
  for (let col = 0; col < TABLEAU_COLS; col++) {
    const tcol = state.tableau[col];
    if (tcol.length === 0) {
      if (inRect(x, y, l.tableauX[col], l.tableauY, l.cardW, l.cardH)) {
        return { source: 'tableauEmpty', colIndex: col };
      }
      continue;
    }
    for (let i = tcol.length - 1; i >= 0; i--) {
      const pos = getCardPosition(state, 'tableau', col, i);
      const h = (i === tcol.length - 1) ? l.cardH : (tcol[i].faceUp ? l.overlapUp : l.overlapDown);
      if (inRect(x, y, pos.x, pos.y, l.cardW, h)) {
        if (!tcol[i].faceUp) return null;
        return { source: 'tableau', colIndex: col, cardIndex: i };
      }
    }
  }

  return null;
}

// ── Overlay hit tests ──

function hitTestStatsOverlay(x, y, l) {
  const cx = l.w / 2;
  const gap = 32;
  const closeY = l.h * 0.15 + gap * 8.5;
  if (inRect(x, y, cx - 50, closeY, 100, 36)) {
    return { source: 'button', button: 'closeStats' };
  }
  // Tapping anywhere else on the overlay does nothing (blocks game input)
  return null;
}

function hitTestModeOverlay(x, y, l) {
  const cx = l.w / 2;
  const gap = 28;
  let my = l.h * 0.12 + gap * 1.5;

  // Draw mode buttons
  my += gap;
  const drawBtnW = 80, drawBtnH = 34;
  const drawTotalW = DRAW_MODES.length * drawBtnW + (DRAW_MODES.length - 1) * 8;
  let dx = cx - drawTotalW / 2;
  for (const mode of DRAW_MODES) {
    if (inRect(x, y, dx, my, drawBtnW, drawBtnH)) {
      return { source: 'button', button: `draw:${mode.id}` };
    }
    dx += drawBtnW + 8;
  }
  my += drawBtnH + gap;

  // Recycle mode buttons
  my += gap;
  const recBtnW = 90, recBtnH = 34;
  const recTotalW = RECYCLE_MODES.length * recBtnW + (RECYCLE_MODES.length - 1) * 8;
  let rx = cx - recTotalW / 2;
  for (const mode of RECYCLE_MODES) {
    if (inRect(x, y, rx, my, recBtnW, recBtnH)) {
      return { source: 'button', button: `recycle:${mode.id}` };
    }
    rx += recBtnW + 8;
  }
  my += recBtnH + gap;

  // Description + warning
  my += gap * 1.2;
  my += gap;

  // New Game / Close buttons
  const btnW = 100, btnGap = 12;
  if (inRect(x, y, cx - btnW - btnGap / 2, my, btnW, 36)) {
    return { source: 'button', button: 'applyMode' };
  }
  if (inRect(x, y, cx + btnGap / 2, my, btnW, 36)) {
    return { source: 'button', button: 'closeMode' };
  }

  return null;
}

function findDropTarget(x, y) {
  const l = getLayout();
  const ex = DROP_ZONE_EXPAND_X;
  const ey = DROP_ZONE_EXPAND_Y;

  // Foundations
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    if (inRect(x, y,
      l.foundationX[i] - ex, l.foundationY - ey,
      l.cardW + ex * 2, l.cardH + ey * 2)) {
      return { source: 'foundation', colIndex: i };
    }
  }

  // Tableau
  for (let col = 0; col < TABLEAU_COLS; col++) {
    const state = window.__gameState;
    const tcol = state.tableau[col];
    let bottomY;
    if (tcol.length === 0) {
      bottomY = l.tableauY + l.cardH;
    } else {
      const lastPos = getCardPosition(state, 'tableau', col, tcol.length - 1);
      bottomY = lastPos.y + l.cardH;
    }
    if (x >= l.tableauX[col] - ex && x <= l.tableauX[col] + l.cardW + ex &&
        y >= l.tableauY - ey && y <= bottomY + l.cardH + ey) {
      return { source: 'tableau', colIndex: col };
    }
  }
  return null;
}

function inRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}
