// cards.js — Card/deck creation, shuffling
import { SUITS, VALUES, VALUE_ORDER } from './constants.js';

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

// Simple Mulberry32 PRNG for deterministic shuffling
function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export function shuffleDeck(deck, seed) {
  const d = [...deck];
  const rng = seed !== undefined ? mulberry32(seed) : Math.random;
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
