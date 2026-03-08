// klondike.js — Specific rules for Klondike Solitaire
export const KlondikeRules = {
  canPlaceOnTableau(card, column) {
    if (column.length === 0) return card.value === 'K';
    const top = column[column.length - 1];
    if (!top.faceUp) return false;
    return top.order === card.order + 1 && top.color !== card.color;
  },

  canPlaceOnFoundation(card, foundation) {
    if (foundation.length === 0) return card.value === 'A';
    const top = foundation[foundation.length - 1];
    return top.suit === card.suit && card.order === top.order + 1;
  },

  findFoundationFor(card, foundations) {
    for (let i = 0; i < foundations.length; i++) {
        if (this.canPlaceOnFoundation(card, foundations[i])) return i;
    }
    if (card.value === 'A') {
        for (let i = 0; i < foundations.length; i++) {
            if (foundations[i].length === 0) return i;
        }
    }
    return -1;
  },

  isWon(state) {
    return state.foundations.every(f => f.length === 13);
  },

  getAutoCompleteCard(state) {
    const minFound = Math.min(...state.foundations.map(f => f.length === 0 ? 0 : f[f.length - 1].order));

    if (state.waste.length > 0) {
      const card = state.waste[state.waste.length - 1];
      const fi = this.findFoundationFor(card, state.foundations);
      if (fi >= 0 && card.order <= minFound + 2) {
        return { source: 'waste', card, foundationIndex: fi };
      }
    }
    for (let i = 0; i < state.tableau.length; i++) {
      const col = state.tableau[i];
      if (col.length === 0) continue;
      const card = col[col.length - 1];
      if (!card.faceUp) continue;
      const fi = this.findFoundationFor(card, state.foundations);
      if (fi >= 0 && card.order <= minFound + 2) {
        return { source: 'tableau', colIndex: i, card, foundationIndex: fi };
      }
    }
    return null;
  }
};
