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
  window.addEventListener('mousemove', e => {
    if (touchActive) return;
    handleMove(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', e => {
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
  window.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
  }, { passive: false });
  window.addEventListener('touchend', e => {
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
  if (hit.sourceZoneId === 'stock') {
    onAction({ type: 'tapStock' });
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
  if (!dragState.dragging && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
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
  if (!state || !state.zones) return null;

  // We hit-test zones in reverse order of definition to respect render order
  const checkOrder = Array.from(state.zones.keys()).reverse();

  for (const zoneId of checkOrder) {
      const zone = state.zones.get(zoneId);
      const pos = l.zones.get(zoneId);
      if (!zone || !pos) continue;

      if (zone.isEmpty()) {
          if (inRect(x, y, pos.x, pos.y, l.cardW, l.cardH)) {
              return { sourceZoneId: zoneId };
          }
          continue;
      }

      // Hit test cards in the zone from top to bottom
      for (let i = zone.cards.length - 1; i >= 0; i--) {
          const cardPos = getCardPosition(state, zoneId, i);
          
          let h = l.cardH;
          if (i !== zone.cards.length - 1) {
              // If it's not the top card, the hit height is just the overlap
              if (zone.type === 'fanDown') {
                  h = zone.cards[i].faceUp ? l.overlapDown : l.overlapDown * 0.4;
              }
          }

          if (inRect(x, y, cardPos.x, cardPos.y, l.cardW, h)) {
               return { sourceZoneId: zoneId, cardIndex: i };
          }
      }
  }

  return null;
}

function findDropTarget(x, y) {
  const l = getLayout();
  const state = window.__gameState;
  if (!state || !state.zones) return null;

  const ex = DROP_ZONE_EXPAND_X || 20;
  const ey = DROP_ZONE_EXPAND_Y || 20;

  for (const [zoneId, zone] of state.zones.entries()) {
      if (zoneId === 'stock' || zoneId === 'waste') continue;

      const pos = l.zones.get(zoneId);
      if (!pos) continue;

      if (zone.type === 'fanDown') {
          // Expanded hit zone, generous vertical area
          let bottomY = pos.y + l.cardH;
          if (!zone.isEmpty()) {
              const lastPos = getCardPosition(state, zoneId, zone.cards.length - 1);
              bottomY = lastPos.y + l.cardH;
          }
          if (x >= pos.x - ex && x <= pos.x + l.cardW + ex &&
              y >= pos.y - ey && y <= bottomY + ey) {
             return { targetZoneId: zoneId };
          }
      } else {
          // Standard stack expansion (Foundations)
          if (inRect(x, y, pos.x - ex, pos.y - ey, l.cardW + ex * 2, l.cardH + ey * 2)) {
             return { targetZoneId: zoneId };
          }
      }
  }

  return null;
}

function inRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}
