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

export function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
