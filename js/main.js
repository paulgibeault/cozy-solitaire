// main.js — Entry point, game loop, state machine
import { initRenderer, recalcLayout, getLayout, clear, drawCardBack, drawCardFace,
  drawEmptyPile, drawHighlight, drawText, getCardPosition, drawButton, getCtx,
  spawnWinParticles, updateAndDrawParticles, drawSquashedLabel, drawPeekOverlay,
  setCollapseRuns } from './renderer.js';
import { initInput, getDragState } from './input.js';
import { updateTweens, hasTweens } from './tween.js';
import { createGameState, dealStock, moveCards, isWon, allCardsFaceUp, getAutoCompleteCard, undo, undoTo, canRecycleStock,
  serializeState, deserializeState, GameRules } from './game.js';
import { loadStats, saveStats, saveGameState, loadGameState, clearGameState,
  loadModeSettings, saveModeSettings } from './storage.js';
import { TABLEAU_COLS, FOUNDATION_COUNT, AUTO_COMPLETE_DELAY, COLORS,
  DRAW_MODES, RECYCLE_MODES, SPIDER_MODES, VARIANTS } from './constants.js';
import { UI } from './ui.js';
import { inRect, parseSeed } from './utils.js';

// In sandboxed-iframe context (launcher), wait for postMessage-backed
// localStorage to hydrate before any save data is read.
if (typeof window !== 'undefined' && window.__storageReady) {
  await window.__storageReady;
}

const canvas = document.getElementById('game');
let state = null;

// Mode settings — must be initialized before getGameTypeKey() is called
let modeSettings = loadModeSettings();

// Derive a unique key for the current game type (draw mode + recycle mode, variant)
function getGameTypeKey() {
  const v = modeSettings.variant || 'klondike';
  if (v === 'klondike') {
    return `${v}_${modeSettings.drawMode}_${modeSettings.recycleMode}`;
  } else if (v === 'spider') {
    return `${v}_${modeSettings.spiderSuits || '1suit'}`;
  }
  return v; // future variants will append their own specific modifiers here
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

  UI.init({
    onRestart: () => { restartGame(); markDirty(); },
    onToggleMode: () => {
      if (showStats) showStats = false;
      const opening = !showModeSelect;
      showModeSelect = opening;
      if (!opening) UI.hideSeedInput();
      if (opening) overlayJustOpened = true;
      markDirty();
    },
    onToggleStats: () => {
      if (showModeSelect) {
        showModeSelect = false;
        UI.hideSeedInput();
      }
      const opening = !showStats;
      showStats = opening;
      if (opening) overlayJustOpened = true;
      markDirty();
    },
    onToggleCollapse: () => {
      modeSettings.collapseRuns = !modeSettings.collapseRuns;
      saveModeSettings(modeSettings);
      setCollapseRuns(modeSettings.collapseRuns);
      UI.updateToggles(modeSettings.collapseRuns, modeSettings.showHints);
      recalcLayout();
      markDirty();
    },
    onToggleHints: () => {
      modeSettings.showHints = !modeSettings.showHints;
      saveModeSettings(modeSettings);
      UI.updateToggles(modeSettings.collapseRuns, modeSettings.showHints);
      markDirty();
    },
    onShowHelp: () => {
      import('./game.js').then(({ GameRules }) => {
         const variant = modeSettings.variant || 'klondike';
         const rules = GameRules[variant];
         if (rules && rules.helpHTML) {
            UI.showHelpModal(rules.helpHTML);
         } else {
            UI.showHelpModal('<p>Rules coming soon.</p>');
         }
      });
    },
    getHistory: () => state?.history || [],
    onUndoTo: (index) => {
      undoTo(state, index);
      saveGameState(serializeState(state));
      markDirty();
    },
    onUndo: () => {
      if (undo(state)) {
        saveGameState(serializeState(state));
        markDirty();
      }
    },
    onOverlayOpened: () => { overlayJustOpened = true; },
    onOverlayClosed: () => { markDirty(); }
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
  setCollapseRuns(modeSettings.collapseRuns); // sync renderer cache on startup
  UI.updateToggles(modeSettings.collapseRuns, modeSettings.showHints);
  window.__gameState = state;
  recalcLayout();
  scheduleFrame();
}

function newGame(countPrevious = true, seed = undefined) {
  if (countPrevious && state && !state.won && state.moves > 0) {
    stats.gamesPlayed++;
    // We do not increment gamesWon
    stats.currentStreak = 0;
    saveStats(stats, getGameTypeKey());
  }
  const variant = modeSettings.variant || 'klondike';
  let options = {};
  
  if (variant === 'klondike') {
    const drawMode = DRAW_MODES.find(m => m.id === modeSettings.drawMode) || DRAW_MODES[0];
    const recycleMode = RECYCLE_MODES.find(m => m.id === modeSettings.recycleMode) || RECYCLE_MODES[0];
    options = {
       drawCount: drawMode.drawCount,
       passes: recycleMode.passes
    };
  } else if (variant === 'spider') {
    const spiderMode = SPIDER_MODES.find(m => m.id === (modeSettings.spiderSuits || '1suit')) || SPIDER_MODES[0];
    options = {
       suits: spiderMode.suits
    };
  }
  
  // Re-load stats for the new game type key (handles variant changes)
  stats = loadStats(getGameTypeKey());
  
  state = createGameState(variant, options, seed);
  updateSeedDisplay();
  window.__gameState = state;
  recalcLayout();
  autoCompleting = false;
  showStats = false;
  showModeSelect = false;
  UI.hideSeedInput();
  clearGameState();
}

function restartGame() {
  if (!state || !state.initialZones) return;
  // Restore the exact initial deal without touching stats
  state.zones = new Map();
  for (const [id, zone] of state.initialZones.entries()) {
      state.zones.set(id, zone.clone());
  }

  state.moves = 0;
  state.elapsed = 0;
  state.startTime = Date.now();
  state.won = false;
  state.history = [];
  state.stockPasses = 0;
  autoCompleting = false;
  window.__gameState = state;
  recalcLayout();
  updateSeedDisplay();
  saveGameState(serializeState(state));
}

function updateSeedDisplay() {
  if (state && state.seed !== undefined) {
    UI.updateSeed(state.seed);
  } else {
    UI.updateSeed(undefined);
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
      const rules = GameRules[state.variant] || GameRules['klondike'];
      const fi = rules.findFoundationFor(card, state);
      if (fi) {
        moveFromHit(action, fi);
      } else if (action.sourceZoneId && action.sourceZoneId === 'waste') {
        const cols = state.config ? state.config.layoutCols : 7;
        for (let i = 0; i < cols; i++) {
          const tZone = state.zones.get(`tableau-${i}`);
          if (tZone && rules.canDrop(card, tZone, tZone.id, state)) {
            moveFromHit(action, tZone.id);
            break;
          }
        }
      }
      break;
    }

    case 'doubleTap': {
      const card = getCardFromHit(action);
      if (!card) break;
      const rules = GameRules[state.variant] || GameRules['klondike'];
      const fi = rules.findFoundationFor(card, state);
      if (fi) moveFromHit(action, fi);
      break;
    }

    case 'drop': {
      if (!action.to) break;
      const { from, to } = action;
      moveFromHit(from, to.targetZoneId);
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
  const zoneId = hit.sourceZoneId;
  const zone = state.zones.get(zoneId);
  if (!zone || zone.isEmpty()) return null;
  return zone.cards[hit.cardIndex !== undefined ? hit.cardIndex : zone.cards.length - 1];
}

function moveFromHit(from, toZoneId) {
  moveCards(state, from.sourceZoneId, from.cardIndex !== undefined ? from.cardIndex : 0, toZoneId);
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
        if (ac.sourceZoneId) {
          moveCards(state, ac.sourceZoneId, ac.cardIndex !== undefined ? ac.cardIndex : 0, ac.targetZoneId);
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
  UI.updateHeader(state.elapsed, state.moves);

  // Get current drag state for the rest of render
  const drag = getDragState();

  // Render Zones dynamically
  for (const [zoneId, zone] of state.zones.entries()) {
    const pos = l.zones.get(zoneId);
    if (!pos) continue;

    if (zone.isEmpty() && zoneId.startsWith('foundation')) {
        const suits = ['♠', '♥', '♦', '♣'];
        const p = parseInt(zoneId.split('-')[1]);
        drawEmptyPile(pos.x, pos.y, suits[p]);
    } else if (zone.isEmpty() && zoneId.startsWith('tableau')) {
        drawEmptyPile(pos.x, pos.y, 'K');
    } else if (zone.isEmpty() && zoneId === 'stock') {
        const canRecycle = canRecycleStock(state);
        drawEmptyPile(pos.x, pos.y, canRecycle ? '↻' : '✕');
        if (state.maxPasses !== Infinity) {
          drawText(pos.x + l.cardW / 2, pos.y + l.cardH + 12, `${state.stockPasses}/${state.maxPasses}`, 10, 'center');
        }
    } else if (zone.isEmpty() && zoneId === 'waste') {
        drawEmptyPile(pos.x, pos.y);
    } else if (zoneId === 'stock' && !zone.isEmpty()) {
       drawCardBack(pos.x, pos.y);
       drawText(pos.x + l.cardW / 2, pos.y + l.cardH + 12, `${zone.cards.length}`, 11, 'center');
    } else {
        // Draw Cards in the zone
        for (let i = 0; i < zone.cards.length; i++) {
            // Skip the card (and subsequent cards) if it's currently being dragged
            if (drag && drag.dragging && drag.sourceZoneId === zoneId && i >= drag.cardIndex) {
               // Only skip dragging subsequent cards if it's a fanDown (tableau)
               if (zone.type === 'fanDown' || i === drag.cardIndex) continue;
            }

            const cPos = getCardPosition(state, zoneId, i);
            const card = zone.cards[i];

             // Special Waste Fanning rule (Draw 3)
            if (zone.type === 'fanRightLimited') {
                 const cardsToShow = state.drawCount || 1;
                 const startIdx = Math.max(0, zone.cards.length - cardsToShow);
                 if (i < startIdx) continue;
            }

            if (card.faceUp) {
                drawCardFace(cPos.x, cPos.y, card);
                // Optional dimming for un-draggable fanned waste cards
                if (zone.type === 'fanRightLimited' && i < zone.cards.length - 1) {
                    drawCardFace(cPos.x, cPos.y, card, 0.9);
                }
                
                if (cPos.squashFactor < 1) {
                    drawSquashedLabel(cPos.x, cPos.y, card, state, zoneId, i);
                }
            } else {
                drawCardBack(cPos.x, cPos.y);
            }
        }
    }
  }

  // Drop zone highlights during drag
  if (drag && drag.dragging && modeSettings.showHints) {
    const card = getCardFromHit(drag);
    if (card) {
       const rules = GameRules[state.variant] || GameRules['klondike'];
       for (const [zoneId, zone] of state.zones.entries()) {
           if (rules.canDrop(card, zone, zoneId, state)) {
               const pos = l.zones.get(zoneId);
               if (zone.isEmpty() || zone.type !== 'fanDown') {
                  drawHighlight(pos.x, pos.y);
               } else {
                  const lastC = getCardPosition(state, zoneId, zone.cards.length - 1);
                  drawHighlight(lastC.x, lastC.y);
               }
           }
       }
    }
  }

  // Draw dragged cards on top
  if (drag && drag.dragging && !drag.isPeekHit) {
    const offsetX = drag.currentX - drag.startX;
    const offsetY = drag.currentY - drag.startY;
    
    const zone = state.zones.get(drag.sourceZoneId);
    if (zone) {
       for (let i = drag.cardIndex; i < zone.cards.length; i++) {
           const pos = getCardPosition(state, drag.sourceZoneId, i);
           drawCardFace(pos.x + offsetX, pos.y + offsetY, zone.cards[i]);
           if (pos.squashFactor < 1) {
               drawSquashedLabel(pos.x + offsetX, pos.y + offsetY, zone.cards[i], state, drag.sourceZoneId, i);
           }
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

  // Peek Overlay
  if (state.peekZoneId) {
    drawPeekOverlay(state.peekZoneId, state, drag);
  }

  // Stats overlay
  if (showStats) drawStatsOverlay(l);

  // Mode select overlay
  if (showModeSelect) drawModeOverlay(l);
}

function drawModalBox(cx, cy, w, h) {
  const ctx = getCtx();
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
  const ctx = getCtx();
  const cx = l.w / 2;
  const gap = 30;
  const rows = 6;
  const modalW = Math.min(300, l.w - 40);
  // Extra row for the game-type subtitle
  const modalH = 60 + rows * gap + gap * 1.5 + 22;
  const cy = l.h / 2;

  drawModalBox(cx, cy, modalW, modalH);

  let y = cy - modalH / 2 + 36;
  drawText(cx, y, '♠  Statistics', 22, 'center');

  // Game-type subtitle — varies based on variant
  const variant = modeSettings.variant || 'klondike';
  let subtitleText = '';
  if (variant === 'klondike') {
    const drawMode    = DRAW_MODES.find(m => m.id === modeSettings.drawMode) || DRAW_MODES[0];
    const recycleMode = RECYCLE_MODES.find(m => m.id === modeSettings.recycleMode) || RECYCLE_MODES[0];
    subtitleText = `Klondike  ·  ${drawMode.label}  ·  ${recycleMode.label}`;
  } else if (variant === 'spider') {
    const spiderMode = SPIDER_MODES.find(m => m.id === (modeSettings.spiderSuits || '1suit')) || SPIDER_MODES[0];
    subtitleText = `Spider  ·  ${spiderMode.label}`;
  } else if (variant === 'freecell') {
    subtitleText = 'FreeCell';
  } else {
    subtitleText = variant.charAt(0).toUpperCase() + variant.slice(1);
  }
  y += 20;
  ctx.fillStyle = 'rgba(192,168,112,0.75)';
  ctx.font = '11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(subtitleText, cx, y);

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
  const ctx = getCtx();
  const mr = modeModalRect(l);
  const cx = l.w / 2;
  const cy = l.h / 2;
  drawModalBox(cx, cy, mr.w, mr.h);

  // Draw title + divider
  let y = cy - mr.h / 2 + 36;
  drawText(cx, y, '▶  New Game Setup', 22, 'center');
  y += 20;
  ctx.strokeStyle = COLORS.modalBorder;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - mr.w/2 + 20, y); ctx.lineTo(cx + mr.w/2 - 20, y); ctx.stroke();
  y += 20;

  const btns = getModeButtonLayout(l, mr.y + 36 + 20 + 20);
  for (const btn of btns) {
    if (btn.type === 'label') {
      drawText(cx, btn.y + btn.h / 2, btn.text, 13, 'center');
    } else if (btn.type === 'button') {
      drawModeButton(btn.x, btn.y, btn.w, btn.h, btn.text, btn.active);
    } else if (btn.type === 'newgame') {
      drawButton(btn.x, btn.y, btn.w, btn.h, '▶  New Game', 13);
    } else if (btn.type === 'seed') {
      drawText(cx, btn.y - 10, 'Seed', 12, 'center');
      const seedInput = document.getElementById('seed-input');
      if (seedInput) {
        seedInput.style.left = `${btn.x}px`;
        seedInput.style.top = `${btn.y}px`;
        if (seedInput.classList.contains('hidden')) {
          seedInput.classList.remove('hidden');
          seedInput.value = window._pendingSeed || '';
        }
      }
    }
  }
}

/**
 * Computes all mode overlay button rects in a single pass.
 * Used by both drawModeOverlay (rendering) and overlayClickHandler (hit testing)
 * so that their coordinates are guaranteed to stay in sync.
 *
 * @param {object} l - layout object from getLayout()
 * @param {number} startY - top Y coordinate to begin layout from
 * @returns {Array} array of {type, x, y, w, h, text, active, settingKey, settingValue}
 */
function getModeButtonLayout(l, startY) {
  const cx = l.w / 2;
  const gap = 28;
  const btnH = 34;
  const activeVariant = modeSettings.variant || 'klondike';
  const mr = modeModalRect(l);
  let y = startY;
  const items = [];

  // Variant section
  const varLabelH = gap;
  items.push({ type: 'label', text: 'Game Variant', x: cx, y, w: 0, h: varLabelH });
  y += varLabelH;
  const valBtnW = 90;
  const valTotalW = VARIANTS.length * valBtnW + (VARIANTS.length - 1) * 8;
  let vx = cx - valTotalW / 2;
  for (const variant of VARIANTS) {
    items.push({ type: 'button', text: variant.label, x: vx, y, w: valBtnW, h: btnH,
      active: activeVariant === variant.id,
      settingKey: 'variant', settingValue: variant.id });
    vx += valBtnW + 8;
  }
  y += btnH + gap;

  if (activeVariant === 'klondike') {
    // Draw count
    items.push({ type: 'label', text: 'Draw Count', x: cx, y, w: 0, h: gap });
    y += gap;
    const drawBtnW = 80;
    const drawTotalW = DRAW_MODES.length * drawBtnW + (DRAW_MODES.length - 1) * 8;
    let dx = cx - drawTotalW / 2;
    for (const mode of DRAW_MODES) {
      items.push({ type: 'button', text: mode.label, x: dx, y, w: drawBtnW, h: btnH,
        active: modeSettings.drawMode === mode.id,
        settingKey: 'drawMode', settingValue: mode.id });
      dx += drawBtnW + 8;
    }
    y += btnH + gap;

    // Deck passes
    items.push({ type: 'label', text: 'Deck Passes', x: cx, y, w: 0, h: gap });
    y += gap;
    const recBtnW = 90;
    const recTotalW = RECYCLE_MODES.length * recBtnW + (RECYCLE_MODES.length - 1) * 8;
    let rx = cx - recTotalW / 2;
    for (const mode of RECYCLE_MODES) {
      items.push({ type: 'button', text: mode.label, x: rx, y, w: recBtnW, h: btnH,
        active: modeSettings.recycleMode === mode.id,
        settingKey: 'recycleMode', settingValue: mode.id });
      rx += recBtnW + 8;
    }
    y += btnH + gap;
  } else if (activeVariant === 'spider') {
    items.push({ type: 'label', text: 'Spider Suits', x: cx, y, w: 0, h: gap });
    y += gap;
    const suitBtnW = 120;
    const suitTotalW = SPIDER_MODES.length * suitBtnW + (SPIDER_MODES.length - 1) * 8;
    let sx = cx - suitTotalW / 2;
    for (const mode of SPIDER_MODES) {
      items.push({ type: 'button', text: mode.label, x: sx, y, w: suitBtnW, h: btnH,
        active: (modeSettings.spiderSuits || '1suit') === mode.id,
        settingKey: 'spiderSuits', settingValue: mode.id });
      sx += suitBtnW + 8;
    }
    y += btnH + gap;
  }

  // Seed input placeholder
  const seedBoxW = 160, seedBoxH = 30;
  items.push({ type: 'seed', x: cx - seedBoxW / 2, y, w: seedBoxW, h: seedBoxH });
  y += gap + seedBoxH;

  // New Game button
  const newBtnW = mr.w - 48;
  items.push({ type: 'newgame', x: cx - newBtnW / 2, y, w: newBtnW, h: 36 });

  return items;
}

function drawModeButton(x, y, w, h, text, active) {
  const ctx = getCtx();
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
        e.stopPropagation();
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

function modeModalRect(l) {
  const gap = 28;
  const btnH = 34;
  const isKlondike = (modeSettings.variant || 'klondike') === 'klondike';
  const isSpider = (modeSettings.variant || 'klondike') === 'spider';
  const modalW = Math.min(390, l.w - 20);
  
  // Title section uses 76 pixels (36 + 20 + 20)
  // Variant section uses 90 pixels (gap(28) + btn(34) + gap(28))
  // Seed section uses 58 pixels (gap(28) + 30)
  // New Game Btn needs 56 (36 + 20 padding)
  let modalH = 76 + 90 + 58 + 56; // 280
  
  if (isKlondike) {
     // Draw count section: 90
     // Passes section: 90
     modalH += 180;
  } else if (isSpider) {
     // Spider suits section: 90
     modalH += 90;
  }
  
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

    if (!inRect(x, y, mr.x, mr.y, mr.w, mr.h)) {
      showModeSelect = false;
      UI.hideSeedInput();
      markDirty();
      e.stopPropagation();
      return;
    }

    // Use the shared button layout — guaranteed to match what was drawn
    const btns = getModeButtonLayout(l, mr.y + 36 + 20 + 20);
    for (const btn of btns) {
      if (btn.type !== 'button' && btn.type !== 'newgame') continue;
      if (!inRect(x, y, btn.x, btn.y, btn.w, btn.h)) continue;

      if (btn.type === 'newgame') {
        showModeSelect = false;
        UI.hideSeedInput();
        const explicitSeed = parseSeed(UI.getSeedInputValue());
        newGame(true, explicitSeed);
        UI.clearSeedInput();
        window._pendingSeed = '';
        stats = loadStats(getGameTypeKey());
        markDirty();
        e.stopPropagation();
        return;
      }

      // Setting button — update the relevant setting key
      modeSettings[btn.settingKey] = btn.settingValue;
      saveModeSettings(modeSettings);
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



init();
