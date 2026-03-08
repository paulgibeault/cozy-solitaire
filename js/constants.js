// constants.js — Colors, sizes, timing
export const COLORS = {
  background: '#3a2a1a',
  felt: '#2d5a3d',
  feltBorder: '#1e3d29',
  cardFace: '#fdf6e3',
  cardBorder: '#c8b896',
  cardShadow: 'rgba(0,0,0,0.3)',
  cardBack1: '#8b4513',
  cardBack2: '#a0522d',
  cardBackPattern: '#6b3410',
  red: '#c0392b',
  black: '#2c3e50',
  highlight: 'rgba(255,215,0,0.4)',
  validDrop: 'rgba(144,238,144,0.3)',
  emptyPile: 'rgba(255,255,255,0.08)',
  emptyPileBorder: 'rgba(255,255,255,0.15)',
  text: '#fdf6e3',
  textDark: '#2c3e50',
  buttonBg:         '#4a3824',       // warm medium brown
  buttonBgHover:    '#5a4830',
  buttonText:       '#f0e4cc',       // warm cream
  buttonBorder:     '#8a7050',       // lighter warm gold-brown
  headerBg:         'rgba(30,58,40,0.88)', // felt-green panel — cohesive with the board
  winParticle1: '#ffd700',
  winParticle2: '#ff6b6b',
  winParticle3: '#51cf66',
  modeBg: 'rgba(0,0,0,0.65)',
  modalBox:         '#1c2e1f',       // deep felt green
  modalBorder:      '#8a7050',       // warm gold-brown
  modalTitle:       '#f0e4cc',       // cream
  modeButton:       '#2a3d2a',       // muted felt green
  modeButtonActive: '#4a3824',       // warm brown (matches header buttons)
  modeButtonActiveBorder: '#c0a870', // warm gold
  modeButtonText:   '#e8dcc8',
};

export const SUITS = ['♠', '♥', '♦', '♣'];
export const SUIT_COLORS = { '♠': 'black', '♥': 'red', '♦': 'red', '♣': 'black' };
export const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const VALUE_ORDER = { A:1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, J:11, Q:12, K:13 };

// Layout ratios (relative to card width)
export const CARD_ASPECT = 1.45;
export const CARD_RADIUS_RATIO = 0.08;
export const CARD_OVERLAP_FACEDOWN = 0.18;
export const CARD_OVERLAP_FACEUP = 0.30;
export const OVERLAP_RATIO = 0.25;
export const PILE_GAP_RATIO = 0.12;
export const TOP_MARGIN_RATIO = 0.08;
export const FONT_RATIO = 0.28;
export const SUIT_FONT_RATIO = 0.22;
export const CENTER_SUIT_RATIO = 0.55;

// Animation
export const TWEEN_DURATION = 200;
export const DEAL_DURATION = 80;
export const AUTO_COMPLETE_DELAY = 100;
export const BOUNCE_OVERSHOOT = 1.15;

// Game
export const TABLEAU_COLS = 7;
export const FOUNDATION_COUNT = 4;
export const MAX_CARD_W = 120;
export const MAX_CARD_W_PORTRAIT = 80;

// Drop zone expansion (in pixels, added to each side of the card)
export const DROP_ZONE_EXPAND_X = 12;
export const DROP_ZONE_EXPAND_Y = 20;

export const VARIANTS = [
  { id: 'klondike', label: 'Klondike' },
  { id: 'freecell', label: 'FreeCell' },
  { id: 'spider', label: 'Spider' }
];

// Game modes
export const DRAW_MODES = [
  { id: 'draw1', label: 'Draw 1', drawCount: 1 },
  { id: 'draw3', label: 'Draw 3', drawCount: 3 },
];

export const RECYCLE_MODES = [
  { id: 'unlimited', label: 'Unlimited', passes: Infinity },
  { id: 'pass3', label: '3 Passes', passes: 3 },
  { id: 'pass1', label: '1 Pass', passes: 1 },
];
