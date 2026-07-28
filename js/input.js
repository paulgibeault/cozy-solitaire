// input.js — Mouse/touch input, drag-and-drop
import { getLayout, getCardPosition } from './renderer.js';
import { TABLEAU_COLS, FOUNDATION_COUNT, DROP_ZONE_EXPAND_X, DROP_ZONE_EXPAND_Y } from './constants.js';
import { inRect } from './utils.js';

let onAction = null;
let onMove = null;   // called whenever drag position changes, to trigger a redraw
let dragState = null;
let lastTapTime = 0;
let lastTapTarget = null;
let touchActive = false; // prevent ghost clicks after touch

let longPressTimer = null;
let peekZoneId = null;

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
    // Only prevent default if touching the canvas or dragging
    if (e.target === canvas || (dragState && dragState.dragging)) {
      e.preventDefault();
    }
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
  }, { passive: false });

  window.addEventListener('touchend', e => {
    // Only prevent default if touching the canvas
    if (e.target === canvas) {
      e.preventDefault();
    }
    const t = e.changedTouches[0];
    handleEnd(t.clientX, t.clientY);
    // Reset touchActive after a delay to allow this touch cycle to complete
    setTimeout(() => { touchActive = false; }, 400);
  }, { passive: false });
}

export function getDragState() { return dragState; }

function handleStart(x, y) {
  // Check if there is an active peek overlay and hit-test against it first.
  let hit = null;
  const state = window.__gameState;
  const l = getLayout();
  
  let peekHit = false;
  let pc = null;

  if (peekZoneId && l.peekCards && l.peekCards.length > 0) {
      for (let i = l.peekCards.length - 1; i >= 0; i--) {
          const item = l.peekCards[i];
          if (inRect(x, y, item.x, item.y, item.w, item.h)) {
              hit = { sourceZoneId: peekZoneId, cardIndex: item.cardIndex };
              peekHit = true;
              pc = item;
              break;
          }
      }
      
      // If we clicked the dark background but missed a card, abort.
      if (!hit) {
          if (state) state.peekZoneId = null;
          peekZoneId = null;
          if (onMove) onMove();
          return;
      }
  } else {
      hit = hitTest(x, y);
  }

  if (!hit) return;

  // Double tap detection
  const now = Date.now();
  const isDoubleTap = (now - lastTapTime < 400) &&
    lastTapTarget && lastTapTarget.sourceZoneId === hit.sourceZoneId &&
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

  let realStartX = x;
  let realStartY = y;
  let startX = x;
  let startY = y;

  if (peekHit && pc) {
      const pos = getCardPosition(state, hit.sourceZoneId, hit.cardIndex);
      if (pos) {
          const scaleW = l.cardW / pc.w;
          const scaleH = l.cardH / pc.h;
          startX = pos.x + (x - pc.x) * scaleW;
          startY = pos.y + (y - pc.y) * scaleH;
      }
  }

  // Start drag
  dragState = {
    ...hit,
    realStartX,
    realStartY,
    startX,
    startY,
    currentX: x,
    currentY: y,
    dragging: false,
    isPeekHit: peekHit
  };

  if (!peekHit && hit.sourceZoneId && hit.sourceZoneId.startsWith('tableau-')) {
     longPressTimer = setTimeout(() => {
         const state = window.__gameState;
         if (state) {
             state.peekZoneId = hit.sourceZoneId;
             peekZoneId = hit.sourceZoneId;
             dragState = null;
             if (onMove) onMove(); // trigger render
         }
     }, 400); // 400ms long press
  }
}

function handleMove(x, y) {
  if (longPressTimer) {
     const dx = dragState ? (x - dragState.realStartX) : 0;
     const dy = dragState ? (y - dragState.realStartY) : 0;
     if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
         clearTimeout(longPressTimer);
         longPressTimer = null;
     }
  }

  if (!dragState) return;
  const dx = x - dragState.realStartX;
  const dy = y - dragState.realStartY;
  
  if (!dragState.dragging && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
    dragState.dragging = true;
    // Fires once per drag, at the threshold crossing rather than on press, so
    // a tap never sounds like a lift.
    if (!dragState.isPeekHit) onAction({ type: 'dragStart', ...dragState });
  }

  dragState.currentX = x;
  dragState.currentY = y;

  if (dragState.isPeekHit) {
      if (Math.sqrt(dx*dx + dy*dy) > 150) {
          dragState.isPeekHit = false;
          const state = window.__gameState;
          if (state) state.peekZoneId = null;
          peekZoneId = null;
      }
  }

  // Only trigger a redraw when actively dragging
  if (dragState.dragging && onMove) onMove();
}

function handleEnd(x, y) {
  if (longPressTimer) {
     clearTimeout(longPressTimer);
     longPressTimer = null;
  }
  
  if (!dragState) return;

  if (dragState.isPeekHit) {
      if (dragState.dragging) {
          // Allowed wiggle to see under finger. Let go = cancel dragging, keep overlay.
          dragState = null;
          if (onMove) onMove();
          return;
      } else {
          // Direct tap in overlay = dismiss overlay and perform a smart move
          const state = window.__gameState;
          if (state) state.peekZoneId = null;
          peekZoneId = null;
          onAction({ type: 'tap', ...dragState });
          dragState = null;
          if (onMove) onMove();
          return;
      }
  }

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
               // Face down cards shouldn't have a touch target, unless they are in the stock
               if (!zone.cards[i].faceUp && zoneId !== 'stock') {
                   return null; 
               }
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


