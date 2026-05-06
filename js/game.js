// game.js — Game logic (rules, moves, win detection)
import { createDeck, shuffleDeck } from './cards.js';
import { TABLEAU_COLS, FOUNDATION_COUNT, VALUE_ORDER } from './constants.js';
import { KlondikeRules } from './rules/klondike.js';
import { FreeCellRules } from './rules/freecell.js';
import { SpiderRules } from './rules/spider.js';

export const GameRules = {
  klondike: KlondikeRules,
  freecell: FreeCellRules,
  spider: SpiderRules,
};

export function createGameState(variant = 'klondike', options = {}, seed = undefined) {
  if (seed === undefined) {
    seed = Math.floor(Math.random() * 2147483647); // 31-bit integer seed
  }
  
  const rules = GameRules[variant] || KlondikeRules;
  let deck;
  if (rules.createDeck) {
    deck = rules.createDeck(seed, options);
  } else {
    deck = shuffleDeck(createDeck(), seed);
  }
  
  const zones = rules.createZones(options);
  rules.deal(zones, deck, options);

  // Snapshot the initial deal for the Restart feature
  const initialZones = new Map();
  for (const [id, zone] of zones.entries()) {
    initialZones.set(id, zone.clone());
  }

  return {
    zones,
    moves: 0,
    startTime: Date.now(),
    won: false,
    history: [],
    drawCount: options.drawCount || 1,
    maxPasses: options.passes !== undefined ? options.passes : Infinity,
    stockPasses: 0, // how many times we've recycled
    initialZones,
    seed,
    variant,
    options,
    config: rules.config || { layoutCols: 7, layoutRows: 3 },
  };
}

export function isWon(state) {
  const rules = GameRules[state.variant] || KlondikeRules;
  return rules.isWon(state.zones);
}

export function allCardsFaceUp(state) {
  const rules = GameRules[state.variant] || KlondikeRules;
  return rules.allCardsFaceUp(state);
}

export function getAutoCompleteCard(state) {
  const rules = GameRules[state.variant] || KlondikeRules;
  return rules.getAutoCompleteCard(state);
}

export function saveUndo(state, actionDesc = 'Previous State') {
  const clonedZones = new Map();
  for (const [id, zone] of state.zones.entries()) {
    clonedZones.set(id, zone.clone());
  }

  state.history.push({
    zones: clonedZones,
    moves: state.moves,
    stockPasses: state.stockPasses,
    actionDesc: actionDesc,
  });
  if (state.history.length > 200) state.history.shift();
}

export function undo(state) {
  if (state.history.length === 0) return false;
  const prev = state.history.pop();
  state.zones = prev.zones;
  state.moves = prev.moves;
  state.stockPasses = prev.stockPasses;
  return true;
}

export function undoTo(state, targetHistoryIndex) {
  if (targetHistoryIndex < 0 || targetHistoryIndex >= state.history.length) return false;
  const target = state.history[targetHistoryIndex];
  state.zones = target.zones;
  state.moves = target.moves;
  state.stockPasses = target.stockPasses;
  
  // Truncate history to the target point
  state.history = state.history.slice(0, targetHistoryIndex);
  return true;
}

// Deal from stock to waste (supports draw 1 or draw 3)
export function dealStock(state) {
  const rules = GameRules[state.variant] || KlondikeRules;
  if (rules.dealStock) {
    return rules.dealStock(state);
  }

  const stockZone = state.zones.get('stock');
  const wasteZone = state.zones.get('waste');

  const isRecycle = stockZone.isEmpty();
  saveUndo(state, isRecycle ? 'Recycled Waste' : 'Dealt Stock');
  
  if (isRecycle) {
    // Recycle waste to stock
    if (wasteZone.isEmpty()) { state.history.pop(); return null; }
    // Check pass limit
    if (state.maxPasses !== Infinity && state.stockPasses >= state.maxPasses) {
      state.history.pop();
      return null; // No more passes allowed
    }
    
    // Move all from waste back to stock
    const cards = wasteZone.removeCards(0);
    cards.reverse().forEach(c => {
        c.faceUp = false;
        stockZone.addCard(c);
    });
    
    state.stockPasses++;
    state.moves++;
    return 'recycle';
  }
  // Draw N cards
  const count = Math.min(state.drawCount, stockZone.cards.length);
  for (let i = 0; i < count; i++) {
    const card = stockZone.removeTopCard();
    card.faceUp = true;
    wasteZone.addCard(card);
  }
  state.moves++;
  return 'dealt';
}

// Check if stock can be recycled
export function canRecycleStock(state) {
  if (!state.zones.get('stock').isEmpty()) return true; // Can still draw
  const waste = state.zones.get('waste');
  if (!waste || waste.isEmpty()) return false;
  if (state.maxPasses === Infinity) return true;
  return state.stockPasses < state.maxPasses;
}

export function moveCards(state, fromZoneId, cardIndex, toZoneId) {
  const fromZone = state.zones.get(fromZoneId);
  const toZone = state.zones.get(toZoneId);

  if (!fromZone || !toZone) return false;
  
  const rules = GameRules[state.variant] || KlondikeRules;

  // Rule verification: Can we pick this up?
  if (!rules.canPickUp(fromZone, cardIndex, state)) return false;

  const cardToDrop = fromZone.cards[cardIndex];

  // Rule verification: Can we drop this?
  if (!rules.canDrop(cardToDrop, toZone, toZoneId, state)) return false;

  const numCards = fromZone.cards.length - cardIndex;
  const countStr = numCards > 1 ? ` (${numCards} cards)` : '';
  saveUndo(state, `Moved ${cardToDrop.value}${cardToDrop.suit}${countStr}`);

  // Extract
  const movingCards = fromZone.removeCards(cardIndex);
  
  // Flip newly exposed top card of origin pile if it exists and is face down (Tableau behavior)
  const newTopCard = fromZone.getTopCard();
  if (newTopCard && !newTopCard.faceUp) {
      newTopCard.faceUp = true;
  }

  // Insert
  toZone.addCards(movingCards);

  state.moves++;

  if (rules.afterMove) {
    rules.afterMove(state);
  }

  return true;
}

export function serializeState(state) {
  const serializedZones = [];
  for (const [id, zone] of state.zones.entries()) {
    serializedZones.push({
        id: zone.id,
        type: zone.type,
        config: zone.config,
        cards: zone.cards
    });
  }

  const initialSerialized = [];
  for (const [id, zone] of state.initialZones.entries()) {
      initialSerialized.push({
          id: zone.id,
          type: zone.type,
          config: zone.config,
          cards: zone.cards
      });
  }

  return {
    encodedZones: serializedZones,
    moves: state.moves,
    startTime: state.startTime,
    drawCount: state.drawCount,
    maxPasses: state.maxPasses === Infinity ? 'Infinity' : state.maxPasses,
    stockPasses: state.stockPasses,
    encodedInitialZones: initialSerialized,
    seed: state.seed,
    variant: state.variant,
    options: state.options,
    config: state.config,
    won: state.won,
  };
}

import { Zone } from './zone.js';

export function deserializeState(data) {
  const zones = new Map();
  if (data.encodedZones) {
    for (const z of data.encodedZones) {
        const zone = new Zone(z.id, z.type, z.config);
        zone.cards = z.cards;
        zones.set(zone.id, zone);
    }
  }

  const initialZones = new Map();
  if (data.encodedInitialZones) {
      for (const z of data.encodedInitialZones) {
          const zone = new Zone(z.id, z.type, z.config);
          zone.cards = z.cards;
          initialZones.set(zone.id, zone);
      }
  }

  const variant = data.variant;
  let inferredVariant = variant || 'klondike';
  
  // Try to infer variant for older saves without it
  if (!variant && data.encodedZones) {
    const tableauCount = data.encodedZones.filter(z => z.id.startsWith('tableau')).length;
    if (tableauCount === 10) inferredVariant = 'spider';
    else if (tableauCount === 8) inferredVariant = 'freecell';
  }
  
  const rules = GameRules[inferredVariant] || KlondikeRules;
  const config = data.config || rules.config || { layoutCols: 7, layoutRows: 3 };

  return {
    zones,
    drawCount: data.drawCount || 1,
    maxPasses: (data.maxPasses == null || data.maxPasses === 'Infinity') ? Infinity : data.maxPasses,
    stockPasses: data.stockPasses || 0,
    won: data.won || false,
    history: [],
    initialZones,
    seed: data.seed,
    moves: data.moves || 0,
    startTime: data.startTime || Date.now(),
    variant: inferredVariant,
    options: data.options || {},
    config: config
  };
}
