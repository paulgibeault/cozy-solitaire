import { Zone } from '../zone.js';
import { createCard, shuffleDeck } from '../cards.js';
import { saveUndo } from '../game.js';

export const SpiderRules = {
  config: { layoutCols: 10, layoutRows: 3 },
  helpHTML: `
    <p><strong>Goal</strong>: Build 8 sequences of cards descending from King to Ace in the same suit.</p>
    <p><strong>Modes</strong>: Depending on difficulty (1-Suit, 2-Suit, or 4-Suit), you manage different suits. You must assemble groups of the <em>same suit</em> to move them as a unit.</p>
    <p><strong>Tableau</strong>: Build columns down regardless of suit.</p>
    <p><strong>Movement</strong>: You can only move grouped sequences if they are of the same suit. A complete K-A sequence is automatically moved to a foundation.</p>
    <p><strong>Stock</strong>: Deals one card to every column. You cannot deal if there are empty columns.</p>
  `,

  createDeck(seed, options = {}) {
     const deck = [];
     const suits = options.suits || ['♠']; // Default to 1-suit spider (Spades)
     const setsPerSuit = 8 / suits.length;
     let idCounter = 0;
     const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
     for(let i=0; i<setsPerSuit; i++) {
         for(const suit of suits) {
             for(const value of values) {
                 const card = createCard(suit, value);
                 card.id = `${card.id}-${idCounter++}`; // Unique ID for 2-deck
                 deck.push(card);
             }
         }
     }
     return shuffleDeck(deck, seed);
  },

  createZones(options = {}) {
    const zones = new Map();
    for (let i = 0; i < 8; i++) {
        zones.set(`foundation-${i}`, new Zone(`foundation-${i}`, 'stack', { gridX: i, gridY: 0 }));
    }
    zones.set('stock', new Zone('stock', 'stack', { gridX: 9, gridY: 0, clickAction: 'deal', showCount: true }));
    for (let i = 0; i < 10; i++) {
        zones.set(`tableau-${i}`, new Zone(`tableau-${i}`, 'fanDown', { gridX: i, gridY: 1 }));
    }
    return zones;
  },

  deal(zones, deck, options = {}) {
    let idx = 0;
    // 54 cards to tableau
    for (let col = 0; col < 10; col++) {
       const tz = zones.get(`tableau-${col}`);
       const target = col < 4 ? 6 : 5;
       for (let row = 0; row < target; row++) {
           const card = deck[idx++];
           card.faceUp = (row === target - 1);
           tz.addCard(card);
       }
    }
    const stock = zones.get('stock');
    for(; idx < deck.length; idx++) {
        deck[idx].faceUp = false;
        stock.addCard(deck[idx]);
    }
  },

  dealStock(state) {
     const stock = state.zones.get('stock');
     if (stock.isEmpty()) return null;
     
     for (let i = 0; i < 10; i++) {
         if (state.zones.get(`tableau-${i}`).isEmpty()) return null; // Can't deal with empty columns
     }

     saveUndo(state, 'Dealt Stock');
     
     for (let i = 0; i < 10; i++) {
         if (stock.isEmpty()) break;
         const card = stock.removeTopCard();
         card.faceUp = true;
         state.zones.get(`tableau-${i}`).addCard(card);
     }
     
     state.moves++;
     this.afterMove(state);
     return 'dealt';
  },

  canDrop(card, targetZone, targetZoneId, state) {
    if (targetZoneId.startsWith('tableau-')) {
       if (targetZone.isEmpty()) return true;
       const top = targetZone.cards[targetZone.cards.length - 1];
       return top.order === card.order + 1; // Any suit is fine
    }
    return false;
  },

  canPickUp(zone, cardIndex, state) {
     if (zone.id.startsWith('tableau-')) {
         const cards = zone.cards;
         if (!cards[cardIndex].faceUp) return false;
         for (let i = cardIndex; i < cards.length - 1; i++) {
             const c = cards[i];
             const n = cards[i+1];
             if (c.suit !== n.suit || c.order !== n.order + 1) return false;
         }
         return true;
     }
     return false;
  },

  findFoundationFor(card, state) { return null; }, 

  isWon(zones) {
     for(let i=0; i<8; i++) {
         if (zones.get(`foundation-${i}`).cards.length !== 13) return false;
     }
     return true;
  },

  allCardsFaceUp(state) { return false; }, 

  getAutoCompleteCard(state) { return null; },

  afterMove(state) {
     for (let i = 0; i < 10; i++) {
         const col = state.zones.get(`tableau-${i}`);
         const cards = col.cards;
         if (cards.length >= 13) {
             const topCard = cards[cards.length - 1];
             if (topCard.value === 'A') {
                 let validSequence = true;
                 for (let k = 0; k < 12; k++) {
                     const c = cards[cards.length - 1 - k];
                     const above = cards[cards.length - 2 - k];
                     if (!above.faceUp || c.suit !== above.suit || above.order !== c.order + 1) {
                         validSequence = false;
                         break;
                     }
                 }
                 if (validSequence) {
                     let emptyFound = null;
                     for (let f = 0; f < 8; f++) {
                         if (state.zones.get(`foundation-${f}`).isEmpty()) {
                             emptyFound = state.zones.get(`foundation-${f}`);
                             break;
                         }
                     }
                     if (emptyFound) {
                         saveUndo(state, 'Completed Spider Sequence');
                         const moving = col.removeCards(cards.length - 13);
                         emptyFound.addCards(moving);
                         const exposed = col.getTopCard();
                         if (exposed && !exposed.faceUp) exposed.faceUp = true;
                     }
                 }
             }
         }
     }
  }
};
