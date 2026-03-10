// klondike.js — Game Rules and Configuration for Klondike Solitaire
import { Zone } from '../zone.js';
import { BaseRules } from './base.js';

export const KlondikeRules = {
  ...BaseRules,
  config: { layoutCols: 7, layoutRows: 3 },
  helpHTML: `
    <p><strong>Goal</strong>: Build all four suits from Ace to King on the <strong>Foundations</strong>.</p>
    <p><strong>Tableau</strong>: Build columns down by alternating colors.</p>
    <p><strong>Stock</strong>: Draw cards into the waste pile.</p>
    <p><strong>Movement</strong>: Move face-up sequence stacks matching alternating colors. Only Kings can be moved to empty cells.</p>
  `,
  // Define layout structure mathematically using a hypothetical grid or constraints
  // For renderer: Top margin = y:0. Tableau = y:1
  createZones() {
    const zones = new Map();

    // 1 Stock
    zones.set('stock', new Zone('stock', 'stack', { gridX: 0, gridY: 0, showCount: true, clickAction: 'deal' }));

    // 1 Waste
    zones.set('waste', new Zone('waste', 'fanRightLimited', { gridX: 1, gridY: 0 }));

    // 4 Foundations
    for (let i = 0; i < 4; i++) {
        zones.set(`foundation-${i}`, new Zone(`foundation-${i}`, 'stack', { gridX: 3 + i, gridY: 0, label: ['♠', '♥', '♦', '♣'][i] }));
    }

    // 7 Tableau Columns
    for (let i = 0; i < 7; i++) {
        zones.set(`tableau-${i}`, new Zone(`tableau-${i}`, 'fanDown', { gridX: i, gridY: 1, label: 'K' }));
    }

    return zones;
  },

  // Initial deal logic maps deck cards to zones
  deal(zones, deck) {
    let idx = 0;
    // Deal Tableau
    for (let col = 0; col < 7; col++) {
      const tableauZone = zones.get(`tableau-${col}`);
      for (let row = 0; row <= col; row++) {
        const card = { ...deck[idx++] };
        card.faceUp = (row === col);
        tableauZone.addCard(card);
      }
    }
    // Rest to Stock
    const stockZone = zones.get('stock');
    for (; idx < deck.length; idx++) {
      stockZone.addCard({ ...deck[idx], faceUp: false });
    }
  },

  // -------------------------------------------------------------
  // Validation Rules
  // -------------------------------------------------------------
  canDrop(card, targetZone, targetZoneId, state) {
    if (targetZoneId.startsWith('tableau-')) {
        return this.canPlaceOnTableau(card, targetZone.cards);
    }
    if (targetZoneId.startsWith('foundation-')) {
        return this.canPlaceOnFoundation(card, targetZone.cards);
    }
    return false;
  },

  canPickUp(zone, cardIndex, state) {
     if (zone.id.startsWith('tableau-')) {
         return zone.cards[cardIndex].faceUp;
     }
     if (zone.id.startsWith('waste') || zone.id.startsWith('foundation-')) {
         return cardIndex === zone.cards.length - 1; // Only top card
     }
     return false; // Cannot pick up from stock
  },

  canPlaceOnTableau(card, columnCards) {
    if (columnCards.length === 0) return card.value === 'K';
    const top = columnCards[columnCards.length - 1];
    return this.isValidRunLink(top, card);
  },

  isValidRunLink(prev, card) {
    if (!prev.faceUp || !card.faceUp) return false;
    return prev.color !== card.color && prev.order === card.order + 1;
  },

  canPlaceOnFoundation(card, foundationCards) {
    if (foundationCards.length === 0) return card.value === 'A';
    const top = foundationCards[foundationCards.length - 1];
    return top.suit === card.suit && card.order === top.order + 1;
  },

  findFoundationFor(card, state) {
    const zones = state.zones;
    for (let i = 0; i < 4; i++) {
        const fzone = zones.get(`foundation-${i}`);
        if (this.canPlaceOnFoundation(card, fzone.cards)) return fzone.id;
    }
    if (card.value === 'A') {
        for (let i = 0; i < 4; i++) {
            const fzone = zones.get(`foundation-${i}`);
            if (fzone.isEmpty()) return fzone.id;
        }
    }
    return null;
  },

  isWon(zones) {
    for (let i = 0; i < 4; i++) {
        if (zones.get(`foundation-${i}`).cards.length !== 13) return false;
    }
    return true;
  },

  allCardsFaceUp(state) {
    const zones = state.zones;
    for (const [id, zone] of zones.entries()) {
        if (id === 'stock' || id === 'waste') {
            if (!zone.isEmpty()) return false;
            continue;
        }
        if (id.startsWith('tableau-')) {
            for (const card of zone.cards) {
                if (!card.faceUp) return false;
            }
        }
    }
    return true;
  },

  getAutoCompleteCard(state) {
    const zones = state.zones;
    const foundations = [
        zones.get('foundation-0'), zones.get('foundation-1'), 
        zones.get('foundation-2'), zones.get('foundation-3')
    ];
    const minFound = Math.min(...foundations.map(f => f.isEmpty() ? 0 : f.getTopCard().order));

    const waste = zones.get('waste');
    if (!waste.isEmpty()) {
      const card = waste.getTopCard();
      const fi = this.findFoundationFor(card, zones);
      if (fi && card.order <= minFound + 2) {
        return { sourceZoneId: 'waste', card, targetZoneId: fi };
      }
    }
    for (let i = 0; i < 7; i++) {
      const col = zones.get(`tableau-${i}`);
      if (col.isEmpty()) continue;
      const card = col.getTopCard();
      if (!card.faceUp) continue;
      const fi = this.findFoundationFor(card, zones);
      if (fi && card.order <= minFound + 2) {
        return { sourceZoneId: col.id, cardIndex: col.cards.length - 1, card, targetZoneId: fi };
      }
    }
    return null;
  }
};
