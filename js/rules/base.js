// base.js — Default no-op implementations for game variant rule properties.
// Each variant should spread from BaseRules to make the required contract explicit
// and ensure missing methods don't silently cause undefined-is-not-a-function errors.
export const BaseRules = {
  config: { layoutCols: 7, layoutRows: 3 },
  helpHTML: '<p>Rules coming soon.</p>',

  createDeck: null,         // null = use the default createDeck + shuffleDeck from cards.js
  dealStock: null,          // null = use the default dealStock in game.js

  createZones(_options) { return new Map(); },
  deal(_zones, _deck, _options) {},

  canPickUp(_zone, _cardIndex, _state) { return false; },
  canDrop(_card, _targetZone, _targetZoneId, _state) { return false; },
  isValidRunLink(_prev, _card) { return false; },
  findFoundationFor(_card, _state) { return null; },

  isWon(_zones) { return false; },
  allCardsFaceUp(_state) { return false; },
  getAutoCompleteCard(_state) { return null; },
  afterMove(_state) {},
};
