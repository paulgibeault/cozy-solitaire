// zone.js — Generic Card Zone 
export class Zone {
  constructor(id, type, config = {}) {
    this.id = id;
    this.type = type; // 'stack', 'fanDown', 'fanRight', 'fanRightLimited'
    this.cards = [];
    
    // Configuration options (e.g. max width, custom gaps)
    this.config = config;
  }

  addCard(card) {
    this.cards.push(card);
  }

  addCards(cards) {
    this.cards.push(...cards);
  }

  removeTopCard() {
    return this.cards.pop();
  }

  removeCards(index) {
    return this.cards.splice(index);
  }

  getTopCard() {
    if (this.cards.length === 0) return null;
    return this.cards[this.cards.length - 1];
  }

  isEmpty() {
    return this.cards.length === 0;
  }

  clear() {
    this.cards = [];
  }

  clone() {
    const z = new Zone(this.id, this.type, this.config);
    z.cards = this.cards.map(c => ({ ...c }));
    return z;
  }
}
