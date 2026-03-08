import { Zone } from '../zone.js';

export const FreeCellRules = {
  config: { layoutCols: 8, layoutRows: 3 },
  helpHTML: `
    <p><strong>Goal</strong>: Build all four suits from Ace to King on the <strong>Foundations</strong>.</p>
    <p><strong>Tableau</strong>: Build columns down by alternating colors.</p>
    <p><strong>Free Cells</strong>: Four empty cells can hold any single card.</p>
    <p><strong>Movement</strong>: Move stacks corresponding to the number of free cells/columns available.</p>
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
