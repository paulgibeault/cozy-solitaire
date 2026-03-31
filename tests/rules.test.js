// rules.test.js — Tests for FreeCellRules and SpiderRules game logic
// Run with: node --test tests/rules.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCard } from '../js/cards.js';
// Import via game.js to resolve the circular spider.js ↔ game.js dependency
import { GameRules } from '../js/game.js';
import { Zone } from '../js/zone.js';

const FreeCellRules = GameRules.freecell;
const SpiderRules = GameRules.spider;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function card(suit, value, faceUp = true) {
  const c = createCard(suit, value);
  c.faceUp = faceUp;
  return c;
}

/** Build a minimal FreeCell state with the given zone layout */
function fcState(overrides = {}) {
  const zones = FreeCellRules.createZones();
  return { zones, ...overrides };
}

/** Build a minimal Spider state with the given zone layout */
function spiderState(overrides = {}) {
  const zones = SpiderRules.createZones();
  return { zones, moves: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// FreeCellRules — Zone Creation
// ---------------------------------------------------------------------------

describe('FreeCellRules — createZones', () => {
  it('creates 4 freecell zones', () => {
    const zones = FreeCellRules.createZones();
    for (let i = 0; i < 4; i++) {
      assert.ok(zones.has(`freecell-${i}`), `missing freecell-${i}`);
    }
  });

  it('creates 4 foundation zones', () => {
    const zones = FreeCellRules.createZones();
    for (let i = 0; i < 4; i++) {
      assert.ok(zones.has(`foundation-${i}`), `missing foundation-${i}`);
    }
  });

  it('creates 8 tableau zones', () => {
    const zones = FreeCellRules.createZones();
    for (let i = 0; i < 8; i++) {
      assert.ok(zones.has(`tableau-${i}`), `missing tableau-${i}`);
    }
  });

  it('all zones start empty', () => {
    const zones = FreeCellRules.createZones();
    for (const [, zone] of zones) {
      assert.equal(zone.cards.length, 0);
    }
  });
});

// ---------------------------------------------------------------------------
// FreeCellRules — Tableau placement
// ---------------------------------------------------------------------------

describe('FreeCellRules — canPlaceOnTableau', () => {
  it('any card can be placed on an empty column', () => {
    assert.equal(FreeCellRules.canPlaceOnTableau(card('♠', '5'), []), true);
    assert.equal(FreeCellRules.canPlaceOnTableau(card('♥', 'K'), []), true);
    assert.equal(FreeCellRules.canPlaceOnTableau(card('♦', 'A'), []), true);
  });

  it('red card can go on black card one rank higher', () => {
    const black7 = card('♠', '7');
    assert.equal(FreeCellRules.canPlaceOnTableau(card('♥', '6'), [black7]), true);
    assert.equal(FreeCellRules.canPlaceOnTableau(card('♦', '6'), [black7]), true);
  });

  it('black card can go on red card one rank higher', () => {
    const red8 = card('♥', '8');
    assert.equal(FreeCellRules.canPlaceOnTableau(card('♠', '7'), [red8]), true);
    assert.equal(FreeCellRules.canPlaceOnTableau(card('♣', '7'), [red8]), true);
  });

  it('same color cannot stack', () => {
    const black7 = card('♠', '7');
    assert.equal(FreeCellRules.canPlaceOnTableau(card('♣', '6'), [black7]), false);
  });

  it('same rank cannot stack (must be one lower)', () => {
    const black7 = card('♠', '7');
    assert.equal(FreeCellRules.canPlaceOnTableau(card('♥', '7'), [black7]), false);
  });

  it('higher rank cannot stack', () => {
    const black7 = card('♠', '7');
    assert.equal(FreeCellRules.canPlaceOnTableau(card('♥', '8'), [black7]), false);
  });

  it('face-down top card blocks placement', () => {
    const faceDown = card('♠', '7', false);
    assert.equal(FreeCellRules.canPlaceOnTableau(card('♥', '6'), [faceDown]), false);
  });
});

// ---------------------------------------------------------------------------
// FreeCellRules — Foundation placement
// ---------------------------------------------------------------------------

describe('FreeCellRules — canPlaceOnFoundation', () => {
  it('Ace can be placed on empty foundation', () => {
    assert.equal(FreeCellRules.canPlaceOnFoundation(card('♠', 'A'), []), true);
  });

  it('non-Ace cannot be placed on empty foundation', () => {
    assert.equal(FreeCellRules.canPlaceOnFoundation(card('♠', '2'), []), false);
    assert.equal(FreeCellRules.canPlaceOnFoundation(card('♥', 'K'), []), false);
  });

  it('same suit, next rank can stack on foundation', () => {
    const aceOfSpades = card('♠', 'A');
    assert.equal(FreeCellRules.canPlaceOnFoundation(card('♠', '2'), [aceOfSpades]), true);
  });

  it('wrong suit cannot stack on foundation', () => {
    const aceOfSpades = card('♠', 'A');
    assert.equal(FreeCellRules.canPlaceOnFoundation(card('♥', '2'), [aceOfSpades]), false);
  });

  it('same suit, skipping rank cannot stack', () => {
    const aceOfSpades = card('♠', 'A');
    assert.equal(FreeCellRules.canPlaceOnFoundation(card('♠', '3'), [aceOfSpades]), false);
  });

  it('same suit, lower rank cannot stack', () => {
    const twoOfHearts = card('♥', '2');
    const aceOfHearts = card('♥', 'A');
    assert.equal(FreeCellRules.canPlaceOnFoundation(card('♥', 'A'), [twoOfHearts]), false);
    assert.equal(FreeCellRules.canPlaceOnFoundation(aceOfHearts, [twoOfHearts]), false);
  });
});

// ---------------------------------------------------------------------------
// FreeCellRules — canDrop routing
// ---------------------------------------------------------------------------

describe('FreeCellRules — canDrop', () => {
  it('routes to canPlaceOnTableau for tableau zones', () => {
    const state = fcState();
    const black7 = card('♠', '7');
    const targetZone = state.zones.get('tableau-0');
    targetZone.addCard(black7);
    assert.equal(
      FreeCellRules.canDrop(card('♥', '6'), targetZone, 'tableau-0', state),
      true
    );
  });

  it('routes to canPlaceOnFoundation for foundation zones', () => {
    const state = fcState();
    const fzone = state.zones.get('foundation-0');
    assert.equal(
      FreeCellRules.canDrop(card('♠', 'A'), fzone, 'foundation-0', state),
      true
    );
  });

  it('any card can go to empty freecell', () => {
    const state = fcState();
    const fzone = state.zones.get('freecell-0');
    assert.equal(FreeCellRules.canDrop(card('♣', 'Q'), fzone, 'freecell-0', state), true);
  });

  it('occupied freecell cannot accept another card', () => {
    const state = fcState();
    const fzone = state.zones.get('freecell-0');
    fzone.addCard(card('♥', '3'));
    assert.equal(FreeCellRules.canDrop(card('♣', 'Q'), fzone, 'freecell-0', state), false);
  });

  it('returns false for unknown zone types', () => {
    const state = fcState();
    const zone = new Zone('unknown', 'stack', {});
    assert.equal(FreeCellRules.canDrop(card('♥', '5'), zone, 'unknown', state), false);
  });
});

// ---------------------------------------------------------------------------
// FreeCellRules — deal
// ---------------------------------------------------------------------------

describe('FreeCellRules — deal', () => {
  it('distributes 52 cards across 8 tableau columns', () => {
    const zones = FreeCellRules.createZones();
    const deck = [];
    for (const s of ['♠', '♥', '♦', '♣']) {
      for (const v of ['A','2','3','4','5','6','7','8','9','10','J','Q','K']) {
        deck.push(createCard(s, v));
      }
    }
    FreeCellRules.deal(zones, deck);
    let total = 0;
    for (let i = 0; i < 8; i++) total += zones.get(`tableau-${i}`).cards.length;
    assert.equal(total, 52);
  });

  it('all dealt cards are face up', () => {
    const zones = FreeCellRules.createZones();
    const deck = [];
    for (const s of ['♠', '♥', '♦', '♣']) {
      for (const v of ['A','2','3','4','5','6','7','8','9','10','J','Q','K']) {
        deck.push(createCard(s, v));
      }
    }
    FreeCellRules.deal(zones, deck);
    for (let i = 0; i < 8; i++) {
      for (const c of zones.get(`tableau-${i}`).cards) {
        assert.equal(c.faceUp, true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// FreeCellRules — isWon
// ---------------------------------------------------------------------------

describe('FreeCellRules — isWon', () => {
  it('returns false when foundations are empty', () => {
    const zones = FreeCellRules.createZones();
    assert.equal(FreeCellRules.isWon(zones), false);
  });

  it('returns false when foundations have fewer than 13 cards', () => {
    const zones = FreeCellRules.createZones();
    for (let i = 0; i < 4; i++) {
      for (let v = 1; v <= 12; v++) {
        zones.get(`foundation-${i}`).addCard(createCard('♠', String(v)));
      }
    }
    assert.equal(FreeCellRules.isWon(zones), false);
  });

  it('returns true when all 4 foundations have exactly 13 cards', () => {
    const zones = FreeCellRules.createZones();
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    for (let i = 0; i < 4; i++) {
      for (const v of values) {
        zones.get(`foundation-${i}`).addCard(createCard(suits[i], v));
      }
    }
    assert.equal(FreeCellRules.isWon(zones), true);
  });
});

// ---------------------------------------------------------------------------
// FreeCellRules — allCardsFaceUp
// ---------------------------------------------------------------------------

describe('FreeCellRules — allCardsFaceUp', () => {
  it('returns true (FreeCell starts with all cards face up)', () => {
    const state = fcState();
    assert.equal(FreeCellRules.allCardsFaceUp(state), true);
  });
});

// ---------------------------------------------------------------------------
// SpiderRules — Zone Creation
// ---------------------------------------------------------------------------

describe('SpiderRules — createZones', () => {
  it('creates 8 foundation zones', () => {
    const zones = SpiderRules.createZones();
    for (let i = 0; i < 8; i++) {
      assert.ok(zones.has(`foundation-${i}`), `missing foundation-${i}`);
    }
  });

  it('creates 10 tableau zones', () => {
    const zones = SpiderRules.createZones();
    for (let i = 0; i < 10; i++) {
      assert.ok(zones.has(`tableau-${i}`), `missing tableau-${i}`);
    }
  });

  it('creates a stock zone', () => {
    const zones = SpiderRules.createZones();
    assert.ok(zones.has('stock'));
  });
});

// ---------------------------------------------------------------------------
// SpiderRules — canDrop
// ---------------------------------------------------------------------------

describe('SpiderRules — canDrop', () => {
  it('any card can go on empty tableau column', () => {
    const state = spiderState();
    const zone = state.zones.get('tableau-0');
    assert.equal(SpiderRules.canDrop(card('♥', '7'), zone, 'tableau-0', state), true);
  });

  it('card one rank lower can be placed regardless of suit', () => {
    const state = spiderState();
    const zone = state.zones.get('tableau-0');
    zone.addCard(card('♠', '8'));
    // Same suit
    assert.equal(SpiderRules.canDrop(card('♠', '7'), zone, 'tableau-0', state), true);
    // Different suit
    zone.cards = [card('♥', '8')];
    assert.equal(SpiderRules.canDrop(card('♠', '7'), zone, 'tableau-0', state), true);
  });

  it('same rank cannot be placed on occupied column', () => {
    const state = spiderState();
    const zone = state.zones.get('tableau-0');
    zone.addCard(card('♠', '7'));
    assert.equal(SpiderRules.canDrop(card('♥', '7'), zone, 'tableau-0', state), false);
  });

  it('higher rank cannot be placed on occupied column', () => {
    const state = spiderState();
    const zone = state.zones.get('tableau-0');
    zone.addCard(card('♠', '7'));
    assert.equal(SpiderRules.canDrop(card('♥', '8'), zone, 'tableau-0', state), false);
  });

  it('cannot drop on foundation zones', () => {
    const state = spiderState();
    const zone = state.zones.get('foundation-0');
    assert.equal(SpiderRules.canDrop(card('♠', 'K'), zone, 'foundation-0', state), false);
  });
});

// ---------------------------------------------------------------------------
// SpiderRules — isValidRunLink
// ---------------------------------------------------------------------------

describe('SpiderRules — isValidRunLink', () => {
  it('same suit, descending by 1 is valid', () => {
    assert.equal(SpiderRules.isValidRunLink(card('♠', '8'), card('♠', '7')), true);
    assert.equal(SpiderRules.isValidRunLink(card('♥', 'K'), card('♥', 'Q')), true);
  });

  it('different suit is not a valid run link (even if descending)', () => {
    assert.equal(SpiderRules.isValidRunLink(card('♠', '8'), card('♥', '7')), false);
  });

  it('same suit, same rank is not valid', () => {
    assert.equal(SpiderRules.isValidRunLink(card('♠', '8'), card('♠', '8')), false);
  });

  it('face-down card breaks the run', () => {
    assert.equal(SpiderRules.isValidRunLink(card('♠', '8', false), card('♠', '7')), false);
    assert.equal(SpiderRules.isValidRunLink(card('♠', '8'), card('♠', '7', false)), false);
  });
});

// ---------------------------------------------------------------------------
// SpiderRules — canPickUp
// ---------------------------------------------------------------------------

describe('SpiderRules — canPickUp', () => {
  it('can pick up a single face-up card', () => {
    const state = spiderState();
    const zone = state.zones.get('tableau-0');
    zone.addCard(card('♠', '5'));
    assert.equal(SpiderRules.canPickUp(zone, 0, state), true);
  });

  it('cannot pick up a face-down card', () => {
    const state = spiderState();
    const zone = state.zones.get('tableau-0');
    zone.addCard(card('♠', '5', false));
    assert.equal(SpiderRules.canPickUp(zone, 0, state), false);
  });

  it('can pick up a valid same-suit sequence', () => {
    const state = spiderState();
    const zone = state.zones.get('tableau-0');
    zone.addCard(card('♠', '8'));
    zone.addCard(card('♠', '7'));
    zone.addCard(card('♠', '6'));
    assert.equal(SpiderRules.canPickUp(zone, 0, state), true);
  });

  it('cannot pick up a mixed-suit sequence from the bottom', () => {
    const state = spiderState();
    const zone = state.zones.get('tableau-0');
    zone.addCard(card('♠', '8'));
    zone.addCard(card('♥', '7')); // different suit breaks the run
    zone.addCard(card('♥', '6'));
    assert.equal(SpiderRules.canPickUp(zone, 0, state), false);
  });

  it('can pick up valid sub-sequence starting mid-column', () => {
    const state = spiderState();
    const zone = state.zones.get('tableau-0');
    zone.addCard(card('♥', '9')); // index 0 — broken run from here
    zone.addCard(card('♠', '8')); // index 1 — start of valid run
    zone.addCard(card('♠', '7')); // index 2
    // Picking up from index 1 should work (valid same-suit run from there)
    assert.equal(SpiderRules.canPickUp(zone, 1, state), true);
  });
});

// ---------------------------------------------------------------------------
// SpiderRules — createDeck
// ---------------------------------------------------------------------------

describe('SpiderRules — createDeck', () => {
  it('1-suit spider creates 104 cards (8 sets of 13)', () => {
    const deck = SpiderRules.createDeck(42, { suits: ['♠'] });
    assert.equal(deck.length, 104);
  });

  it('2-suit spider creates 104 cards', () => {
    const deck = SpiderRules.createDeck(42, { suits: ['♠', '♥'] });
    assert.equal(deck.length, 104);
  });

  it('4-suit spider creates 104 cards', () => {
    const deck = SpiderRules.createDeck(42, { suits: ['♠', '♥', '♦', '♣'] });
    assert.equal(deck.length, 104);
  });

  it('1-suit deck contains only spades', () => {
    const deck = SpiderRules.createDeck(42, { suits: ['♠'] });
    assert.ok(deck.every(c => c.suit === '♠'));
  });

  it('all cards have unique ids', () => {
    const deck = SpiderRules.createDeck(42, { suits: ['♠'] });
    const ids = new Set(deck.map(c => c.id));
    assert.equal(ids.size, deck.length);
  });
});

// ---------------------------------------------------------------------------
// SpiderRules — isWon
// ---------------------------------------------------------------------------

describe('SpiderRules — isWon', () => {
  it('returns false when foundations are empty', () => {
    const zones = SpiderRules.createZones();
    assert.equal(SpiderRules.isWon(zones), false);
  });

  it('returns true when all 8 foundations have 13 cards each', () => {
    const zones = SpiderRules.createZones();
    const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    for (let i = 0; i < 8; i++) {
      for (const v of values) {
        zones.get(`foundation-${i}`).addCard(createCard('♠', v));
      }
    }
    assert.equal(SpiderRules.isWon(zones), true);
  });

  it('returns false when one foundation is short', () => {
    const zones = SpiderRules.createZones();
    const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    for (let i = 0; i < 8; i++) {
      const fill = i < 7 ? values : values.slice(0, 12); // last foundation only gets 12
      for (const v of fill) {
        zones.get(`foundation-${i}`).addCard(createCard('♠', v));
      }
    }
    assert.equal(SpiderRules.isWon(zones), false);
  });
});

// ---------------------------------------------------------------------------
// SpiderRules — deal
// ---------------------------------------------------------------------------

describe('SpiderRules — deal', () => {
  it('distributes 54 cards to tableau, remainder to stock', () => {
    const zones = SpiderRules.createZones();
    const deck = SpiderRules.createDeck(1, { suits: ['♠'] });
    SpiderRules.deal(zones, deck);

    let tableauTotal = 0;
    for (let i = 0; i < 10; i++) tableauTotal += zones.get(`tableau-${i}`).cards.length;
    assert.equal(tableauTotal, 54);
    assert.equal(zones.get('stock').cards.length, 50); // 104 - 54
  });

  it('columns 0-3 get 6 cards, columns 4-9 get 5 cards', () => {
    const zones = SpiderRules.createZones();
    const deck = SpiderRules.createDeck(1, { suits: ['♠'] });
    SpiderRules.deal(zones, deck);

    for (let i = 0; i < 4; i++) {
      assert.equal(zones.get(`tableau-${i}`).cards.length, 6, `tableau-${i} should have 6`);
    }
    for (let i = 4; i < 10; i++) {
      assert.equal(zones.get(`tableau-${i}`).cards.length, 5, `tableau-${i} should have 5`);
    }
  });

  it('only the top card of each column is face up', () => {
    const zones = SpiderRules.createZones();
    const deck = SpiderRules.createDeck(1, { suits: ['♠'] });
    SpiderRules.deal(zones, deck);

    for (let i = 0; i < 10; i++) {
      const cards = zones.get(`tableau-${i}`).cards;
      for (let j = 0; j < cards.length - 1; j++) {
        assert.equal(cards[j].faceUp, false, `tableau-${i}[${j}] should be face down`);
      }
      assert.equal(cards[cards.length - 1].faceUp, true, `tableau-${i} top should be face up`);
    }
  });
});

// ---------------------------------------------------------------------------
// BaseRules — no-op contract
// ---------------------------------------------------------------------------

describe('BaseRules — default implementations', () => {
  it('FreeCellRules inherits allCardsFaceUp = true from its own impl', () => {
    const state = fcState();
    assert.equal(FreeCellRules.allCardsFaceUp(state), true);
  });

  it('SpiderRules.allCardsFaceUp returns false', () => {
    const state = spiderState();
    assert.equal(SpiderRules.allCardsFaceUp(state), false);
  });

  it('SpiderRules.findFoundationFor always returns null', () => {
    assert.equal(SpiderRules.findFoundationFor(card('♠', 'A'), spiderState()), null);
  });

  it('SpiderRules.getAutoCompleteCard always returns null', () => {
    assert.equal(SpiderRules.getAutoCompleteCard(spiderState()), null);
  });
});
