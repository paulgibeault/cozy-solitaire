# 🃏 Cozy Solitaire

A warm, grandma-friendly Klondike Solitaire game built with vanilla JavaScript and HTML5 Canvas.

![Mobile-first](https://img.shields.io/badge/mobile-first-green) ![No dependencies](https://img.shields.io/badge/dependencies-zero-blue) ![PWA Ready](https://img.shields.io/badge/PWA-ready-purple)

## Features

- **Full Klondike Solitaire** — draw 1, 7 tableau columns, 4 foundations
- **Touch & mouse** — drag-and-drop, tap-to-auto-move, double-tap to foundation
- **Auto-complete** — when all cards are face up, cards fly to foundations
- **Unlimited undo** — never get stuck
- **Statistics** — games played, won, streaks, best time
- **Cozy theme** — warm browns, soft greens, cream cards, cabin vibes
- **Mobile-first** — responsive scaling, large touch targets
- **PWA-ready** — installable, works offline
- **Zero dependencies** — pure ES modules, no build step

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

```
cozy-solitaire/
├── index.html          # Entry point
├── manifest.json       # PWA manifest
├── css/style.css       # Minimal styles (canvas handles rendering)
├── js/
│   ├── main.js         # Game loop, state machine, rendering orchestration
│   ├── constants.js    # Colors, sizes, timing values
│   ├── cards.js        # Card/deck creation, shuffling
│   ├── game.js         # Game rules, moves, win detection
│   ├── renderer.js     # Canvas drawing (cards, piles, effects)
│   ├── input.js        # Mouse/touch input, drag-and-drop
│   ├── tween.js        # Animation system
│   └── storage.js      # localStorage persistence
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
