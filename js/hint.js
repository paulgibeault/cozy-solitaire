// hint.js — finds a move worth suggesting, and the best landing spot for a
// tapped card. Pure: reads the state, never mutates it.
//
// Both the Hint button and tap-to-move ride the same candidate list so a tap
// never does something the hint would not have suggested first. Legality is
// canMoveRun's; this file only ranks. Scores are coarse on purpose — the
// point is "foundation beats uncovering beats shuffling", not a solver.
import { GameRules, canMoveRun, canRecycleStock } from './game.js';

// A legal move that changes nothing worth changing: a King walking between
// two empty columns, or a run that already sits on a proper link moving to an
// identical one. Never hinted; only taken when the player taps for it.
const POINTLESS = 0;
// Below this a move is legal but not worth pointing at (spider lateral moves).
const HINT_FLOOR = 10;

function scoreMove(rules, fromZone, cardIndex, toZoneId, toZone) {
  const card = fromZone.cards[cardIndex];
  const fromId = fromZone.id;
  const fromTableau = fromId.startsWith('tableau-');
  const below = fromTableau && cardIndex > 0 ? fromZone.cards[cardIndex - 1] : null;
  const exposes = !!(below && !below.faceUp);
  const seated = !!(below && below.faceUp && rules.isValidRunLink(below, card));

  if (toZoneId.startsWith('foundation-')) {
    // An Ace prefers the empty pile drawn with its own suit.
    const own = toZone.isEmpty() && toZone.config && toZone.config.label === card.suit;
    return 100 + card.order + (own ? 5 : 0);
  }
  if (toZoneId.startsWith('freecell-')) return 5;

  if (toZone.isEmpty()) {
    if (fromTableau && cardIndex === 0) return POINTLESS;
    if (exposes) return 70;
    if (!fromTableau) return 45;
    return seated ? POINTLESS : 20;
  }
  if (!fromTableau) return fromId.startsWith('freecell-') ? 55 : 50;
  if (exposes) return 80;
  if (cardIndex === 0) return 60;
  if (seated) return POINTLESS;
  // Spider: the run sits on a foreign suit; landing on its own suit builds
  // toward a sweep, landing on another foreign suit is just a lateral move.
  const top = toZone.getTopCard();
  return top && top.suit === card.suit ? 40 : HINT_FLOOR;
}

// Every card a player could pick up: each face-up tableau card, and the top
// of the waste and of each free cell. Foundations are never a source.
function sources(state) {
  const out = [];
  for (const zone of state.zones.values()) {
    const id = zone.id;
    if (id.startsWith('tableau-')) {
      for (let i = 0; i < zone.cards.length; i++) {
        if (zone.cards[i].faceUp) out.push({ zoneId: id, cardIndex: i });
      }
    } else if (id === 'waste' || id.startsWith('freecell-')) {
      if (!zone.isEmpty()) out.push({ zoneId: id, cardIndex: zone.cards.length - 1 });
    }
  }
  return out;
}

/**
 * Legal moves for the run starting at zoneId[cardIndex], best first.
 * @returns {Array<{from:{zoneId:string,cardIndex:number}, to:string, score:number}>}
 */
export function movesFor(state, zoneId, cardIndex, { includePointless = false } = {}) {
  const rules = GameRules[state.variant] || GameRules.klondike;
  const fromZone = state.zones.get(zoneId);
  if (!fromZone || !fromZone.cards[cardIndex]) return [];
  const out = [];
  for (const toZone of state.zones.values()) {
    const toId = toZone.id;
    if (toId === zoneId || toId === 'stock' || toId === 'waste') continue;
    if (!canMoveRun(state, zoneId, cardIndex, toId)) continue;
    const score = scoreMove(rules, fromZone, cardIndex, toId, toZone);
    if (score <= POINTLESS && !includePointless) continue;
    out.push({ from: { zoneId, cardIndex }, to: toId, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** The single best landing spot for a tapped card, or null. */
export function bestMoveFor(state, zoneId, cardIndex, opts) {
  return movesFor(state, zoneId, cardIndex, opts)[0] || null;
}

/** Whether tapping the stock would do anything right now. */
export function stockAvailable(state) {
  const stock = state.zones.get('stock');
  if (!stock) return false;
  if (state.variant === 'spider') {
    if (stock.isEmpty()) return false;
    for (const zone of state.zones.values()) {
      if (zone.id.startsWith('tableau-') && zone.isEmpty()) return false;
    }
    return true;
  }
  return canRecycleStock(state);
}

/**
 * The move to point at. A card move `{from, to, score}` when one is worth
 * making, `{stock: true}` when the only thing to do is deal, null when the
 * player is stuck (undo or a new game are what's left).
 */
export function findHint(state) {
  let best = null;
  for (const { zoneId, cardIndex } of sources(state)) {
    const m = movesFor(state, zoneId, cardIndex)[0];
    if (m && m.score > HINT_FLOOR && (!best || m.score > best.score)) best = m;
  }
  if (best) return best;
  if (stockAvailable(state)) return { stock: true };
  return null;
}
