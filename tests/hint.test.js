// hint.test.js — what the Hint button points at, and where a tap sends a card.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCard } from '../js/cards.js';
import { createGameState } from '../js/game.js';
import { findHint, bestMoveFor, movesFor, stockAvailable } from '../js/hint.js';

const up = (suit, v) => { const c = createCard(suit, v); c.faceUp = true; return c; };
const down = (suit, v) => createCard(suit, v);

function emptied(variant, options = {}) {
  const s = createGameState(variant, options, 7);
  for (const z of s.zones.values()) z.cards = [];
  return s;
}

describe('findHint — klondike', () => {
  it('sends an Ace to the foundation before anything else', () => {
    const s = emptied('klondike');
    s.zones.get('waste').cards = [up('♥','A')];
    s.zones.get('tableau-0').cards = [down('♣','9'), up('♠','7')];
    s.zones.get('tableau-1').cards = [up('♥','8')];
    const h = findHint(s);
    assert.deepEqual(h.from, { zoneId: 'waste', cardIndex: 0 });
    assert.match(h.to, /^foundation-/);
  });

  it('prefers the move that uncovers a face-down card', () => {
    const s = emptied('klondike');
    s.zones.get('waste').cards = [up('♦','6')];          // could go on 7♠, uncovers nothing
    s.zones.get('tableau-0').cards = [down('♣','9'), up('♠','7')];
    s.zones.get('tableau-1').cards = [up('♥','8')];       // 7♠ onto 8♥ uncovers 9♣
    const h = findHint(s);
    assert.deepEqual(h.from, { zoneId: 'tableau-0', cardIndex: 1 });
    assert.equal(h.to, 'tableau-1');
  });

  it('does not hint a King shuffling between empty columns', () => {
    const s = emptied('klondike');
    s.zones.get('tableau-0').cards = [up('♠','K')];
    // Every other column is empty; the only legal moves are pointless.
    assert.equal(findHint(s), null);
  });

  it('falls back to the stock when nothing on the board moves', () => {
    const s = emptied('klondike');
    s.zones.get('tableau-0').cards = [up('♠','K')];
    s.zones.get('stock').cards = [down('♥','2')];
    assert.deepEqual(findHint(s), { stock: true });
  });

  it('does not suggest the stock past the pass limit', () => {
    const s = emptied('klondike', { passes: 1 });
    s.zones.get('tableau-0').cards = [up('♠','K')];
    s.zones.get('waste').cards = [up('♥','9')];
    s.stockPasses = 1;
    assert.equal(stockAvailable(s), false);
    assert.equal(findHint(s), null);
  });
});

describe('foundation slots', () => {
  it('sends an Ace to the pile labelled with its suit', () => {
    const s = emptied('klondike');
    s.zones.get('waste').cards = [up('♦','A')];
    assert.equal(findHint(s).to, 'foundation-2');
    assert.equal(bestMoveFor(s, 'waste', 0).to, 'foundation-2');
  });

  it('settles for any empty pile when its own is taken', () => {
    const s = emptied('freecell');
    s.zones.get('foundation-2').cards = [up('♠','A')]; // spade sitting in the diamond slot
    s.zones.get('freecell-0').cards = [up('♦','A')];
    assert.match(bestMoveFor(s, 'freecell-0', 0).to, /^foundation-[013]$/);
  });
});

describe('findHint — spider', () => {
  it('will not deal while a column is empty', () => {
    const s = emptied('spider', { suits: ['♠'] });
    s.zones.get('stock').cards = [down('♠','2')];
    s.zones.get('tableau-0').cards = [up('♠','K')];
    assert.equal(stockAvailable(s), false);
  });

  it('rates landing on its own suit above a lateral move', () => {
    const s = emptied('spider', { suits: ['♠', '♥'] });
    s.zones.get('tableau-0').cards = [up('♥','9'), up('♠','8')]; // 8♠ sits on a foreign suit
    s.zones.get('tableau-1').cards = [up('♠','9')];
    s.zones.get('tableau-2').cards = [up('♥','9')];
    for (let i = 3; i < 10; i++) s.zones.get(`tableau-${i}`).cards = [up('♠','K')];
    const h = findHint(s);
    assert.deepEqual(h.from, { zoneId: 'tableau-0', cardIndex: 1 });
    assert.equal(h.to, 'tableau-1');
  });
});

describe('bestMoveFor — tap-to-move', () => {
  it('ranks the foundation above a tableau spot', () => {
    const s = emptied('klondike');
    s.zones.get('foundation-1').cards = [up('♥','A')];
    s.zones.get('tableau-0').cards = [up('♥','2')];
    s.zones.get('tableau-1').cards = [up('♠','3')];
    assert.equal(bestMoveFor(s, 'tableau-0', 0).to, 'foundation-1');
  });

  it('takes a pointless-but-legal move only when asked to', () => {
    const s = emptied('klondike');
    s.zones.get('tableau-0').cards = [up('♠','K')];
    assert.equal(bestMoveFor(s, 'tableau-0', 0), null);
    const forced = bestMoveFor(s, 'tableau-0', 0, { includePointless: true });
    assert.ok(forced && /^tableau-/.test(forced.to));
  });

  it('never lists the stock or waste as a destination', () => {
    const s = emptied('klondike');
    s.zones.get('tableau-0').cards = [up('♠','K')];
    for (const m of movesFor(s, 'tableau-0', 0, { includePointless: true })) {
      assert.notEqual(m.to, 'stock');
      assert.notEqual(m.to, 'waste');
    }
  });

  it('offers a free cell as the last resort for a single card', () => {
    const s = emptied('freecell');
    s.zones.get('tableau-0').cards = [up('♦','K'), up('♠','5')];
    for (let i = 1; i < 8; i++) s.zones.get(`tableau-${i}`).cards = [up('♥','K')];
    const m = bestMoveFor(s, 'tableau-0', 1, { includePointless: true });
    assert.match(m.to, /^freecell-/);
  });
});
