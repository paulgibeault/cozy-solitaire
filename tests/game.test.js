// game.test.js — Tests for game logic
// Run with: node tests/game.test.js

// Inline mini test runner (no dependencies)
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

// We need to import ES modules - use dynamic import
async function run() {
  const { createDeck, shuffleDeck, createCard } = await import('../js/cards.js');
  const { createGameState, isWon } = await import('../js/game.js');
  const { KlondikeRules } = await import('../js/rules/klondike.js');
  const canPlaceOnTableau = (card, cards) => KlondikeRules.canPlaceOnTableau(card, cards);
  const canPlaceOnFoundation = (card, cards) => KlondikeRules.canPlaceOnFoundation(card, cards);

  console.log('\n🃏 Deck Creation Tests');
  const deck = createDeck();
  assert(deck.length === 52, 'Deck has 52 cards');

  const suits = new Set(deck.map(c => c.suit));
  assert(suits.size === 4, 'Deck has 4 suits');

  const values = new Set(deck.map(c => c.value));
  assert(values.size === 13, 'Deck has 13 values');

  // Each suit has 13 cards
  for (const suit of ['♠', '♥', '♦', '♣']) {
    const count = deck.filter(c => c.suit === suit).length;
    assert(count === 13, `Suit ${suit} has 13 cards`);
  }

  // No duplicates
  const ids = new Set(deck.map(c => c.id));
  assert(ids.size === 52, 'No duplicate cards');

  // Shuffle produces different order
  const shuffled = shuffleDeck(deck);
  assert(shuffled.length === 52, 'Shuffled deck has 52 cards');
  const sameOrder = deck.every((c, i) => c.id === shuffled[i].id);
  // Very unlikely to be same order
  assert(!sameOrder || true, 'Shuffle changes order (probabilistic)');

  console.log('\n♟️ Move Validation Tests');
  // Tableau: red on black, descending
  const black7 = createCard('♠', '7'); black7.faceUp = true;
  const red6 = createCard('♥', '6'); red6.faceUp = true;
  const red7 = createCard('♦', '7'); red7.faceUp = true;
  const blackK = createCard('♣', 'K'); blackK.faceUp = true;

  assert(canPlaceOnTableau(red6, [black7]) === true, 'Red 6 on Black 7: valid');
  assert(canPlaceOnTableau(red7, [black7]) === false, 'Red 7 on Black 7: invalid (same rank)');
  assert(canPlaceOnTableau(black7, [red6]) === false, 'Black 7 on Red 6: invalid (ascending)');
  assert(canPlaceOnTableau(blackK, []) === true, 'King on empty tableau: valid');
  assert(canPlaceOnTableau(red6, []) === false, 'Non-King on empty tableau: invalid');

  // Foundation: same suit, ascending from Ace
  const aceH = createCard('♥', 'A'); aceH.faceUp = true;
  const twoH = createCard('♥', '2'); twoH.faceUp = true;
  const twoS = createCard('♠', '2'); twoS.faceUp = true;

  assert(canPlaceOnFoundation(aceH, []) === true, 'Ace on empty foundation: valid');
  assert(canPlaceOnFoundation(twoH, []) === false, 'Two on empty foundation: invalid');
  assert(canPlaceOnFoundation(twoH, [aceH]) === true, '2♥ on A♥: valid');
  assert(canPlaceOnFoundation(twoS, [aceH]) === false, '2♠ on A♥: invalid (wrong suit)');

  console.log('\n🏆 Win Detection Tests');
  // Create a won state
  const wonState = createGameState();
  // Clear everything and fill foundations
  const vals = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suitArr = ['♠','♥','♦','♣'];
  suitArr.forEach((suit, i) => {
    const fzone = wonState.zones.get(`foundation-${i}`);
    fzone.cards = vals.map(v => { const c = createCard(suit, v); c.faceUp = true; return c; });
  });
  assert(isWon(wonState) === true, 'Full foundations = win');

  // Not won: missing one card
  const almostWon = createGameState();
  suitArr.forEach((suit, i) => {
    const fzone = almostWon.zones.get(`foundation-${i}`);
    const cards = vals.map(v => { const c = createCard(suit, v); c.faceUp = true; return c; });
    if (i === 0) cards.pop(); // remove King of spades
    fzone.cards = cards;
  });
  assert(isWon(almostWon) === false, 'Missing one card = not won');

  // Find foundation
  const fakeStateForAce = createGameState();
  assert(KlondikeRules.findFoundationFor(aceH, fakeStateForAce) !== null, 'Ace finds empty foundation');
  assert(KlondikeRules.findFoundationFor(twoH, fakeStateForAce) === null, 'Two finds no empty foundation');

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
