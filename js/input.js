// input.js — Mouse/touch input, drag-and-drop
import { getLayout, getCardPosition } from './renderer.js';
import { TABLEAU_COLS, FOUNDATION_COUNT, DROP_ZONE_EXPAND_X, DROP_ZONE_EXPAND_Y } from './constants.js';

let onAction = null;
let onMove = null;   // called whenever drag position changes, to trigger a redraw
let dragState = null;
let lastTapTime = 0;
let lastTapTarget = null;
let touchActive = false; // prevent ghost clicks after touch

export function initInput(canvas, actionCallback, moveCallback) {
  onAction = actionCallback;
  onMove = moveCallback || null;

  // Mouse events
  canvas.addEventListener('mousedown', e => {
    if (touchActive) return; // ignore ghost click after touch
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

  // Touch events
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
    // Reset touchActive after a delay to allow this touch cycle to complete
    setTimeout(() => { touchActive = false; }, 400);
  }, { passive: false });
}

export function getDragState() { return dragState; }

function handleStart(x, y) {
  const hit = hitTest(x, y);
  if (!hit) return;

  // Double tap detection
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

  // Immediate button actions (no drag)
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
  // Always update position (needed for offset calculation in render)
  dragState.currentX = x;
  dragState.currentY = y;
  // Only trigger a redraw when actively dragging
  if (dragState.dragging && onMove) onMove();
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

  // Buttons — use generous touch targets (minimum 44px)
  const btnW = 60, btnH = 28;
  const btnPad = 8; // extra hit area padding

  // Stats button
  const statsX = 8, statsW = btnW + 10;
  if (inRect(x, y, statsX - btnPad, l.buttonY - btnPad, statsW + btnPad * 2, btnH + btnPad * 2)) {
    return { source: 'button', button: 'stats' };
  }
  // Mode button (next to stats)
  const modeX = statsX + statsW + 6, modeW = btnW + 10;
  if (inRect(x, y, modeX - btnPad, l.buttonY - btnPad, modeW + btnPad * 2, btnH + btnPad * 2)) {
    return { source: 'button', button: 'mode' };
  }
  // Undo button
  const undoX = l.w - btnW * 3 - 22;
  if (inRect(x, y, undoX - btnPad, l.buttonY - btnPad, btnW + btnPad * 2, btnH + btnPad * 2)) {
    return { source: 'button', button: 'undo' };
  }
  // Restart button
  const restartX = l.w - btnW * 2 - 14;
  if (inRect(x, y, restartX - btnPad, l.buttonY - btnPad, btnW + btnPad * 2, btnH + btnPad * 2)) {
    return { source: 'button', button: 'restart' };
  }
  // New game button
  const newX = l.w - btnW - 8;
  if (inRect(x, y, newX - btnPad, l.buttonY - btnPad, btnW + btnPad * 2, btnH + btnPad * 2)) {
    return { source: 'button', button: 'new' };
  }

  // Stock
  if (inRect(x, y, l.stockX, l.stockY, l.cardW, l.cardH)) {
    return { source: 'stock' };
  }

  // Waste — in draw-3 mode, show top 3 fanned out; only top card is grabbable
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

  // Tableau — check from bottom (topmost visually) up
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

function findDropTarget(x, y) {
  const l = getLayout();
  const ex = DROP_ZONE_EXPAND_X;
  const ey = DROP_ZONE_EXPAND_Y;

  // Foundations — expanded hit zone
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    if (inRect(x, y,
      l.foundationX[i] - ex, l.foundationY - ey,
      l.cardW + ex * 2, l.cardH + ey * 2)) {
      return { source: 'foundation', colIndex: i };
    }
  }

  // Tableau — expanded hit zone, generous vertical area
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
    // Expand the drop zone: wider and extends well below the last card
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
