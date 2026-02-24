// game.js — Game logic (rules, moves, win detection)
import { createDeck, shuffleDeck } from './cards.js';
import { TABLEAU_COLS, FOUNDATION_COUNT, VALUE_ORDER } from './constants.js';

export function createGameState() {
  const deck = shuffleDeck(createDeck());
  const tableau = Array.from({ length: TABLEAU_COLS }, () => []);
  const foundations = Array.from({ length: FOUNDATION_COUNT }, () => []);
  const stock = [];
  const waste = [];

  // Deal to tableau
  let idx = 0;
  for (let col = 0; col < TABLEAU_COLS; col++) {
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[idx++] };
      card.faceUp = (row === col);
      tableau[col].push(card);
    }
  }
  // Rest goes to stock
  for (; idx < deck.length; idx++) {
    stock.push({ ...deck[idx], faceUp: false });
  }

  return {
    tableau,
    foundations,
    stock,
    waste,
    moves: 0,
    startTime: Date.now(),
    elapsed: 0,
    won: false,
    history: [], // undo stack
  };
}

export function canPlaceOnTableau(card, column) {
  if (column.length === 0) return card.value === 'K';
  const top = column[column.length - 1];
  if (!top.faceUp) return false;
  return top.order === card.order + 1 && top.color !== card.color;
}

export function canPlaceOnFoundation(card, foundation) {
  if (foundation.length === 0) return card.value === 'A';
  const top = foundation[foundation.length - 1];
  return top.suit === card.suit && card.order === top.order + 1;
}

// Find which foundation a card can go to, or -1
export function findFoundationFor(card, foundations) {
  for (let i = 0; i < foundations.length; i++) {
    if (canPlaceOnFoundation(card, foundations[i])) return i;
  }
  // Also check empty foundations for aces
  if (card.value === 'A') {
    for (let i = 0; i < foundations.length; i++) {
      if (foundations[i].length === 0) return i;
    }
  }
  return -1;
}

export function isWon(state) {
  return state.foundations.every(f => f.length === 13);
}

export function allCardsFaceUp(state) {
  for (const col of state.tableau) {
    for (const card of col) {
      if (!card.faceUp) return false;
    }
  }
  return state.stock.length === 0 && state.waste.length === 0;
}

// Auto-complete: can we safely send the lowest available cards to foundations?
export function getAutoCompleteCard(state) {
  // Find the minimum order on all foundations
  const minFound = Math.min(...state.foundations.map(f => f.length === 0 ? 0 : f[f.length - 1].order));

  // Check waste top
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    const fi = findFoundationFor(card, state.foundations);
    if (fi >= 0 && card.order <= minFound + 2) {
      return { source: 'waste', card, foundationIndex: fi };
    }
  }
  // Check tableau tops
  for (let i = 0; i < state.tableau.length; i++) {
    const col = state.tableau[i];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    if (!card.faceUp) continue;
    const fi = findFoundationFor(card, state.foundations);
    if (fi >= 0 && card.order <= minFound + 2) {
      return { source: 'tableau', colIndex: i, card, foundationIndex: fi };
    }
  }
  return null;
}

// Save a snapshot for undo
export function saveUndo(state) {
  state.history.push({
    tableau: state.tableau.map(c => c.map(card => ({ ...card }))),
    foundations: state.foundations.map(f => f.map(card => ({ ...card }))),
    stock: state.stock.map(card => ({ ...card })),
    waste: state.waste.map(card => ({ ...card })),
    moves: state.moves,
  });
  // Limit history
  if (state.history.length > 200) state.history.shift();
}

export function undo(state) {
  if (state.history.length === 0) return false;
  const prev = state.history.pop();
  state.tableau = prev.tableau;
  state.foundations = prev.foundations;
  state.stock = prev.stock;
  state.waste = prev.waste;
  state.moves = prev.moves;
  return true;
}

// Deal from stock to waste
export function dealStock(state) {
  saveUndo(state);
  if (state.stock.length === 0) {
    // Recycle waste to stock
    if (state.waste.length === 0) { state.history.pop(); return null; }
    state.stock = state.waste.reverse().map(c => ({ ...c, faceUp: false }));
    state.waste = [];
    state.moves++;
    return 'recycle';
  }
  const card = state.stock.pop();
  card.faceUp = true;
  state.waste.push(card);
  state.moves++;
  return card;
}

// Move card(s) from one place to another
export function moveCards(state, fromType, fromIndex, cardIndex, toType, toIndex) {
  let cards;
  if (fromType === 'tableau') {
    const col = state.tableau[fromIndex];
    cards = col.slice(cardIndex);
    if (cards.length === 0 || !cards[0].faceUp) return false;
  } else if (fromType === 'waste') {
    if (state.waste.length === 0) return false;
    cards = [state.waste[state.waste.length - 1]];
  } else if (fromType === 'foundation') {
    const f = state.foundations[fromIndex];
    if (f.length === 0) return false;
    cards = [f[f.length - 1]];
  } else return false;

  const card = cards[0];

  if (toType === 'tableau') {
    if (!canPlaceOnTableau(card, state.tableau[toIndex])) return false;
    if (cards.length > 1 && toType === 'foundation') return false;
  } else if (toType === 'foundation') {
    if (cards.length > 1) return false;
    if (!canPlaceOnFoundation(card, state.foundations[toIndex])) return false;
  } else return false;

  saveUndo(state);

  // Remove from source
  if (fromType === 'tableau') {
    state.tableau[fromIndex].splice(cardIndex);
    // Flip new top card
    const col = state.tableau[fromIndex];
    if (col.length > 0 && !col[col.length - 1].faceUp) {
      col[col.length - 1].faceUp = true;
    }
  } else if (fromType === 'waste') {
    state.waste.pop();
  } else if (fromType === 'foundation') {
    state.foundations[fromIndex].pop();
  }

  // Add to destination
  if (toType === 'tableau') {
    state.tableau[toIndex].push(...cards);
  } else if (toType === 'foundation') {
    state.foundations[toIndex].push(card);
  }

  state.moves++;
  return true;
}

// Serialize state for localStorage (strip history to save space)
export function serializeState(state) {
  return {
    tableau: state.tableau,
    foundations: state.foundations,
    stock: state.stock,
    waste: state.waste,
    moves: state.moves,
    elapsed: state.elapsed,
    startTime: state.startTime,
  };
}

export function deserializeState(data) {
  return {
    ...data,
    won: false,
    history: [],
  };
}
