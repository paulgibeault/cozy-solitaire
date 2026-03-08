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
    const zones = new Map();

    // 4 Free cells (top left)
    for (let i = 0; i < 4; i++) {
        zones.set(`freecell-${i}`, new Zone(`freecell-${i}`, 'stack', { gridX: i, gridY: 0 }));
    }

    // 4 Foundations (top right)
    for (let i = 0; i < 4; i++) {
        zones.set(`foundation-${i}`, new Zone(`foundation-${i}`, 'stack', { gridX: 4 + i, gridY: 0, label: ['♠', '♥', '♦', '♣'][i] }));
    }

    // 8 Tableau Columns
    for (let i = 0; i < 8; i++) {
        zones.set(`tableau-${i}`, new Zone(`tableau-${i}`, 'fanDown', { gridX: i, gridY: 1 }));
    }

    return zones;
  },

  deal(zones, deck, options = {}) {
    let col = 0;
    for (const card of deck) {
       card.faceUp = true;
       zones.get(`tableau-${col}`).addCard(card);
       col = (col + 1) % 8;
    }
  },

  canDrop(card, targetZone, targetZoneId, state) {
    if (targetZoneId.startsWith('tableau-')) {
        return this.canPlaceOnTableau(card, targetZone.cards);
    }
    if (targetZoneId.startsWith('foundation-')) {
        return this.canPlaceOnFoundation(card, targetZone.cards);
    }
    if (targetZoneId.startsWith('freecell-')) {
        return targetZone.cards.length === 0;
    }
    return false;
  },

  canPlaceOnTableau(card, columnCards) {
    if (columnCards.length === 0) return true;
    const top = columnCards[columnCards.length - 1];
    return top.order === card.order + 1 && top.color !== card.color;
  },

  canPlaceOnFoundation(card, foundationCards) {
    if (foundationCards.length === 0) return card.value === 'A';
    const top = foundationCards[foundationCards.length - 1];
    return top.suit === card.suit && card.order === top.order + 1;
  },

  canPickUp(zone, cardIndex, state) {
      if (zone.id.startsWith('freecell-') || zone.id.startsWith('foundation-')) {
          return cardIndex === zone.cards.length - 1; 
      }
      if (zone.id.startsWith('tableau-')) {
           const cards = zone.cards;
           for(let i = cardIndex; i < cards.length - 1; i++) {
               const current = cards[i];
               const next = cards[i+1];
               if (current.color === next.color || current.order !== next.order + 1) {
                   return false;
               }
           }
           
           // Calculate max movable based on empty freecells and empty columns
           const numCardsMoving = cards.length - cardIndex;
           if (numCardsMoving === 1) return true;

           let emptyFreeCells = 0;
           for (let i = 0; i < 4; i++) {
               if (state.zones.get(`freecell-${i}`).isEmpty()) emptyFreeCells++;
           }

           let emptyCols = 0;
           for (let i = 0; i < 8; i++) {
               const colZone = state.zones.get(`tableau-${i}`);
               if (colZone.isEmpty() && colZone.id !== zone.id) emptyCols++;
           }

           const maxMovable = (emptyFreeCells + 1) * Math.pow(2, emptyCols);
           return numCardsMoving <= maxMovable;
      }
      return false;
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
      return true;
  },
  
  getAutoCompleteCard(state) {
    const zones = state.zones;
    const foundations = [
        zones.get('foundation-0'), zones.get('foundation-1'), 
        zones.get('foundation-2'), zones.get('foundation-3')
    ];
    const minFound = Math.min(...foundations.map(f => f.isEmpty() ? 0 : f.getTopCard().order));

    for (let i = 0; i < 4; i++) {
        const fzone = zones.get(`freecell-${i}`);
        if (fzone.isEmpty()) continue;
        const card = fzone.getTopCard();
        const fi = this.findFoundationFor(card, state);
        if (fi && card.order <= minFound + 2) {
            return { sourceZoneId: fzone.id, card, targetZoneId: fi };
        }
    }
    
    for (let i = 0; i < 8; i++) {
      const col = zones.get(`tableau-${i}`);
      if (col.isEmpty()) continue;
      const card = col.getTopCard();
      const fi = this.findFoundationFor(card, state);
      if (fi && card.order <= minFound + 2) {
        return { sourceZoneId: col.id, cardIndex: col.cards.length - 1, card, targetZoneId: fi };
      }
    }
    return null;
  }
};
