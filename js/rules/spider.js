import { Zone } from '../zone.js';

export const SpiderRules = {
  config: { layoutCols: 10, layoutRows: 3 },
  helpHTML: `
    <p><strong>Goal</strong>: Build descending sequences of cards in the same suit from King to Ace.</p>
    <p><strong>Tableau</strong>: Build columns down regardless of suit.</p>
    <p><strong>Movement</strong>: You can only move sequences if they match in suit. Completed sequences will automatically move to the foundation.</p>
  `,
  createZones(options = {}) {
    return new Map();
  },
  deal(zones, deck, options = {}) {},
  canDrop(card, targetZone, targetZoneId) { return false; },
  canPickUp(zone, cardIndex) { return false; },
  isWon(zones) { return false; },
  allCardsFaceUp(zones) { return true; },
  getAutoCompleteCard(zones) { return null; }
};
