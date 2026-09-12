// moves.test.js — the move gate shared by the mover, the drag highlights and
// the hint finder (canMoveRun), and the bug it exists for.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCard } from '../js/cards.js';
import { createGameState, moveCards, canMoveRun } from '../js/game.js';

const up = (suit, v) => { const c = createCard(suit, v); c.faceUp = true; return c; };

function emptied(variant, options = {}) {
  const s = createGameState(variant, options, 7);
  for (const z of s.zones.values()) z.cards = [];
  return s;
}

describe('canMoveRun — foundations and free cells take one card', () => {
  it('rejects a run whose base fits the foundation (klondike)', () => {
    const s = emptied('klondike');
    s.zones.get('foundation-0').cards = [up('♠','A'), up('♠','2'), up('♠','3'), up('♠','4')];
    s.zones.get('tableau-0').cards = [up('♠','5'), up('♥','4'), up('♣','3')];
    assert.equal(canMoveRun(s, 'tableau-0', 0, 'foundation-0'), false);
    assert.equal(moveCards(s, 'tableau-0', 0, 'foundation-0'), false);
    assert.equal(s.zones.get('foundation-0').cards.length, 4, 'nothing moved');
    assert.equal(s.zones.get('tableau-0').cards.length, 3);
  });

  it('still accepts the single top card', () => {
    const s = emptied('klondike');
    s.zones.get('foundation-0').cards = [up('♠','A'), up('♠','2'), up('♠','3'), up('♠','4')];
    s.zones.get('tableau-0').cards = [up('♥','6'), up('♠','5')];
    assert.equal(canMoveRun(s, 'tableau-0', 1, 'foundation-0'), true);
    assert.equal(moveCards(s, 'tableau-0', 1, 'foundation-0'), true);
    assert.equal(s.zones.get('foundation-0').cards.length, 5);
  });

  it('rejects a run into a free cell (freecell)', () => {
    const s = emptied('freecell');
    s.zones.get('tableau-0').cards = [up('♠','5'), up('♥','4')];
    assert.equal(canMoveRun(s, 'tableau-0', 0, 'freecell-0'), false);
    assert.equal(canMoveRun(s, 'tableau-0', 1, 'freecell-0'), true);
  });

  it('never moves a run onto its own column', () => {
    const s = emptied('klondike');
    s.zones.get('tableau-0').cards = [up('♠','K')];
    assert.equal(canMoveRun(s, 'tableau-0', 0, 'tableau-0'), false);
  });

  it('rejects an index off the end of the pile', () => {
    const s = emptied('klondike');
    s.zones.get('tableau-0').cards = [up('♠','K')];
    assert.equal(canMoveRun(s, 'tableau-0', 3, 'tableau-1'), false);
    assert.equal(canMoveRun(s, 'tableau-0', -1, 'tableau-1'), false);
  });
});
