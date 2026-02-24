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
  buttonBg: '#5a3a1a',
  buttonText: '#fdf6e3',
  winParticle1: '#ffd700',
  winParticle2: '#ff6b6b',
  winParticle3: '#51cf66',
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
export const PILE_GAP_RATIO = 0.12;
export const TOP_MARGIN_RATIO = 0.08;
export const FONT_RATIO = 0.28; // card value font size relative to card width
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
