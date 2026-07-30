// cards.js — Card/deck creation, shuffling
import { SUITS, VALUES, VALUE_ORDER } from './constants.js';
import { makeRng } from './arcade-rng.js';

export function createCard(suit, value) {
  return {
    suit,
    value,
    order: VALUE_ORDER[value],
    color: (suit === '♥' || suit === '♦') ? 'red' : 'black',
    faceUp: false,
    id: `${value}${suit}`,
  };
}

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push(createCard(suit, value));
    }
  }
  return deck;
}

// Deterministic shuffling rides the fleet's shared rng companion (vendored
// byte-identical copy of the launcher's /arcade-rng.js — see its header).
// Streams are bit-identical to the old inline mulberry32 for the integer
// seeds this game uses, so existing deal seeds reproduce exactly; the `>>> 0`
// preserves the numeric-seed contract (makeRng hashes non-numbers instead).
export function shuffleDeck(deck, seed) {
  const d = [...deck];
  const rng = seed !== undefined ? makeRng(seed >>> 0) : Math.random;
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
