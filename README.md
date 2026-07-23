# 🃏 Cozy Solitaire

<div align="center">
  <a href="https://paulgibeault.github.io/cozy-solitaire/">
    <img src="https://img.shields.io/badge/Play%20Now-Click%20Here-success?style=for-the-badge&logo=play" alt="Play Now" height="50">
  </a>
</div>

A warm, grandma-friendly Solitaire game built with vanilla JavaScript and HTML5 Canvas.

![Mobile-first](https://img.shields.io/badge/mobile-first-green) ![No dependencies](https://img.shields.io/badge/dependencies-zero-blue) ![PWA Ready](https://img.shields.io/badge/PWA-ready-purple)

## Features

- **Game Variants** — Includes classic Klondike, FreeCell, and Spider Solitaire
- **Menu System** — Unified dropdown menu to switch games, view stats, and access settings
- **Unlimited undo** — Never get stuck, undo all the way back to the start
- **Touch & mouse** — drag-and-drop, tap-to-auto-move, double-tap to foundation
- **Auto-complete** — when all cards are face up, cards fly to foundations
- **Statistics** — games played, won, streaks, best time
- **Cozy theme** — warm browns, soft greens, cream cards, cabin vibes (a single fixed palette — no theme switching)
- **Mobile-first** — responsive scaling, large touch targets
- **PWA-ready** — installable, works offline
- **Zero dependencies** — pure ES modules, no build step

## Game Variants

### Klondike
The classic Solitaire experience. Build foundations from Ace to King by suit. Tableau columns are built down by alternating colors. Features options for Draw 1 or Draw 3, and configurable passes through the deck.

### FreeCell
A strategic variant where almost every deal is winnable. Use four open "free cells" to temporarily hold cards as you build down tableau columns by alternating colors and build foundations up by suit.

### Spider
A challenging two-deck game. Build columns down by suit from King to Ace to remove them from the board. Available in 1-suit, 2-suit, and 4-suit difficulty levels.

## Menu System

The game features a streamlined dropdown menu accessible from the header. From here you can:
- **New Game**: Start a fresh deal, switch between game modes (Klondike, FreeCell, Spider), and configure options like draw counts or suit counts all in one unified dialog.
- **Restart**: Retry the current exact deal from the beginning.
- **Stats**: View your win records, streaks, and best times for each game mode individually.

## Undo Feature

Made a mistake? Cozy Solitaire includes **Unlimited Undo**. 
- Click or tap the Undo button to reverse your last action.
- You can continuously undo moves, all the way back to the initial deal, allowing you to try different strategies without any penalty.

## Play

```bash
# Any static server works:
npx serve .
# or
python3 -m http.server 8000
```

Open `http://localhost:8000` on your phone or browser.

## Controls

| Action | Mouse | Touch |
|--------|-------|-------|
| Move card | Drag & drop | Drag & drop |
| Auto-move | Click card | Tap card |
| Send to foundation | Double-click | Double-tap |
| Deal from stock | Click stock pile | Tap stock pile |
| Undo | Click Undo button | Tap Undo button |

## Project Structure

```text
cozy-solitaire/
├── index.html          # Entry point
├── manifest.json       # PWA manifest
├── package.json        # "test": "node --test tests/*.test.js"
├── css/style.css       # Minimal styles (canvas handles rendering)
├── js/
│   ├── main.js         # Game loop, state machine, rendering orchestration
│   ├── constants.js    # Colors, sizes, timing values
│   ├── cards.js        # Card/deck creation, shuffling
│   ├── game.js         # Game rules, moves, win detection
│   ├── renderer.js     # Canvas drawing (cards, piles, effects)
│   ├── input.js        # Mouse/touch input, drag-and-drop
│   ├── tween.js        # Animation system
│   ├── sfx.js          # Arcade.audio cues (card-place, flip, win jingle, ...)
│   ├── storage.js      # localStorage persistence + Arcade.records writes
│   └── rules/          # Per-variant rule modules (klondike, freecell, spider)
└── tests/
    └── game.test.js    # Game logic tests
```

## Run Tests

```bash
node tests/game.test.js
```

## Tech

- HTML5 Canvas rendering (no images needed)
- ES modules, no bundler
- requestAnimationFrame game loop
- localStorage for persistence
- Responsive scaling for any screen size

---

*Made with ☕ and cozy vibes*
