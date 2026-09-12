// flights.js — cosmetic card flights.
//
// The game state is always authoritative and always already moved; a flight
// is only the picture of a card travelling from where it was drawn last
// frame to where it now lives. main.js hides a landed card while its flight
// runs, draws the flight on top, and keeps the frame loop alive until the
// last one settles — so an idle board still costs nothing (§6d), and a
// flight can never desynchronize the rules from the felt: cancel every
// flight and the board is simply correct.
//
// Nothing here checks reduced motion or power saver; the caller decides
// whether to ask for a flight at all (main.js's animate()).
import { getCardPosition } from './renderer.js';

const flights = [];
const hidden = new Map(); // zoneId -> Set of card ids not to draw in place

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function hide(zoneId, cardId) {
  let set = hidden.get(zoneId);
  if (!set) { set = new Set(); hidden.set(zoneId, set); }
  set.add(cardId);
}
function unhide(zoneId, cardId) {
  const set = hidden.get(zoneId);
  if (!set) return;
  set.delete(cardId);
  if (set.size === 0) hidden.delete(zoneId);
}
function dropFlight(i) {
  const f = flights[i];
  unhide(f.zoneId, f.cardId);
  flights.splice(i, 1);
}

/**
 * Fly `count` cards that now sit at zoneId[firstIndex..] from `fromPositions`
 * (one {x, y} per card, in order) to their current slots.
 *
 * opts.duration  ms; derived from distance when omitted
 * opts.delay     ms before the first card starts
 * opts.stagger   ms between consecutive cards
 * opts.hideUntilStart  a waiting card is invisible rather than parked at
 *                      `from` — for dealing, where "from" is the stock
 */
export function flyCards(state, zoneId, firstIndex, count, fromPositions, opts = {}) {
  const zone = state.zones.get(zoneId);
  if (!zone) return;
  const now = performance.now();
  for (let k = 0; k < count; k++) {
    const idx = firstIndex + k;
    const card = zone.cards[idx];
    const from = fromPositions[k];
    if (!card || !from) continue;
    // A card already in the air (auto-complete lifting a card the deal is
    // still delivering) restarts from wherever it is drawn now.
    for (let i = flights.length - 1; i >= 0; i--) {
      if (flights[i].cardId === card.id) dropFlight(i);
    }
    const to = getCardPosition(state, zoneId, idx);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const duration = opts.duration || Math.max(140, Math.min(300, 100 + dist * 0.35));
    hide(zoneId, card.id);
    flights.push({
      zoneId, cardId: card.id, card,
      fromX: from.x, fromY: from.y, toX: to.x, toY: to.y,
      start: now + (opts.delay || 0) + k * (opts.stagger || 0),
      duration,
      hideUntilStart: !!opts.hideUntilStart,
    });
  }
}

export function hasFlights() { return flights.length > 0; }

/** True while this card must not be drawn in its slot. */
export function isInFlight(zoneId, cardId) {
  const set = hidden.get(zoneId);
  return !!(set && set.has(cardId));
}

/** Retires finished flights. Returns true while any remain. */
export function updateFlights(now = performance.now()) {
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    if (now >= f.start + f.duration) dropFlight(i);
  }
  return flights.length > 0;
}

/** Draws every in-flight card at its interpolated position, oldest first. */
export function drawFlights(drawCard, now = performance.now()) {
  for (const f of flights) {
    if (now < f.start) {
      if (!f.hideUntilStart) drawCard(f.fromX, f.fromY, f.card);
      continue;
    }
    const e = easeOutCubic(Math.min(1, (now - f.start) / f.duration));
    drawCard(f.fromX + (f.toX - f.fromX) * e, f.fromY + (f.toY - f.fromY) * e, f.card);
  }
}

/** Every card lands instantly. Undo, restart and a new deal call this. */
export function clearFlights() {
  flights.length = 0;
  hidden.clear();
}
