// input.js — Mouse/touch input, drag-and-drop
import { getLayout, getCardPosition } from './renderer.js';
import { TABLEAU_COLS, FOUNDATION_COUNT } from './constants.js';

let onAction = null; // callback: (action) => void
let dragState = null;
let lastTapTime = 0;
let lastTapTarget = null;

export function initInput(canvas, actionCallback) {
  onAction = actionCallback;

  canvas.addEventListener('mousedown', e => handleStart(e.clientX, e.clientY, e));
  canvas.addEventListener('mousemove', e => handleMove(e.clientX, e.clientY));
  canvas.addEventListener('mouseup', e => handleEnd(e.clientX, e.clientY));

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    handleStart(t.clientX, t.clientY, e);
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
  }, { passive: false });
}

export function getDragState() { return dragState; }

function handleStart(x, y, e) {
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
    // Find drop target
    const drop = findDropTarget(x, y);
    onAction({ type: 'drop', from: dragState, to: drop });
  } else {
    // Tap
    onAction({ type: 'tap', ...dragState });
  }
  dragState = null;
}

function hitTest(x, y) {
  const l = getLayout();
  const state = window.__gameState; // set by main
  if (!state) return null;

  // Buttons
  const btnW = 60, btnH = 28;
  // Undo button
  const undoX = l.w - btnW * 2 - 16;
  if (x >= undoX && x <= undoX + btnW && y >= l.buttonY && y <= l.buttonY + btnH) {
    return { source: 'button', button: 'undo' };
  }
  // New game button
  const newX = l.w - btnW - 8;
  if (x >= newX && x <= newX + btnW && y >= l.buttonY && y <= l.buttonY + btnH) {
    return { source: 'button', button: 'new' };
  }

  // Stock
  if (inRect(x, y, l.stockX, l.stockY, l.cardW, l.cardH)) {
    return { source: 'stock' };
  }

  // Waste
  if (state.waste.length > 0 && inRect(x, y, l.wasteX, l.wasteY, l.cardW, l.cardH)) {
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

  // Tableau — check from bottom card up (topmost visually)
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
        if (!tcol[i].faceUp) return null; // can't grab face-down
        return { source: 'tableau', colIndex: col, cardIndex: i };
      }
    }
  }

  return null;
}

function findDropTarget(x, y) {
  const l = getLayout();
  // Foundations
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    if (inRect(x, y, l.foundationX[i], l.foundationY, l.cardW, l.cardH)) {
      return { source: 'foundation', colIndex: i };
    }
  }
  // Tableau
  for (let col = 0; col < TABLEAU_COLS; col++) {
    const state = window.__gameState;
    const tcol = state.tableau[col];
    let bottomY;
    if (tcol.length === 0) {
      bottomY = l.tableauY;
    } else {
      const lastPos = getCardPosition(state, 'tableau', col, tcol.length - 1);
      bottomY = lastPos.y + l.cardH;
    }
    if (x >= l.tableauX[col] && x <= l.tableauX[col] + l.cardW &&
        y >= l.tableauY && y <= bottomY + l.cardH) {
      return { source: 'tableau', colIndex: col };
    }
  }
  return null;
}

function inRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}
