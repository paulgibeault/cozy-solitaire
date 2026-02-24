// renderer.js — Canvas drawing
import { COLORS, SUIT_COLORS, CARD_ASPECT, CARD_RADIUS_RATIO, CARD_OVERLAP_FACEDOWN, CARD_OVERLAP_FACEUP,
  PILE_GAP_RATIO, TOP_MARGIN_RATIO, FONT_RATIO, SUIT_FONT_RATIO, CENTER_SUIT_RATIO,
  TABLEAU_COLS, FOUNDATION_COUNT } from './constants.js';

let canvas, ctx;
let layout = {};

export function initRenderer(c) {
  canvas = c;
  ctx = canvas.getContext('2d');
  recalcLayout();
}

export function recalcLayout() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Calculate card size to fit 7 columns + gaps
  const totalCols = TABLEAU_COLS;
  const gapCount = totalCols + 1;
  const cardW = Math.floor((w - gapCount * 6) / totalCols * 0.92);
  const cardH = Math.floor(cardW * CARD_ASPECT);
  const gap = Math.floor((w - cardW * totalCols) / (totalCols + 1));

  layout = {
    w, h, cardW, cardH, gap, dpr,
    radius: Math.round(cardW * CARD_RADIUS_RATIO),
    overlapDown: Math.round(cardH * CARD_OVERLAP_FACEDOWN),
    overlapUp: Math.round(cardH * CARD_OVERLAP_FACEUP),
    topMargin: Math.round(h * TOP_MARGIN_RATIO),
    fontSize: Math.round(cardW * FONT_RATIO),
    suitSize: Math.round(cardW * SUIT_FONT_RATIO),
    centerSuitSize: Math.round(cardW * CENTER_SUIT_RATIO),
    // Pile positions
    stockX: 0, stockY: 0,
    wasteX: 0, wasteY: 0,
    foundationX: [], foundationY: 0,
    tableauX: [], tableauY: 0,
    // Button areas
    buttonY: 0,
  };

  // Top row: stock, waste, gap, 4 foundations
  const topY = layout.topMargin;
  layout.stockX = gap;
  layout.stockY = topY;
  layout.wasteX = gap + cardW + gap;
  layout.wasteY = topY;
  layout.foundationY = topY;
  layout.foundationX = [];
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    layout.foundationX.push(w - (FOUNDATION_COUNT - i) * (cardW + gap) + gap);
  }

  // Tableau row
  layout.tableauY = topY + cardH + Math.round(gap * 1.5);
  layout.tableauX = [];
  for (let i = 0; i < TABLEAU_COLS; i++) {
    layout.tableauX.push(gap + i * (cardW + gap));
  }

  // Buttons area
  layout.buttonY = 4;

  return layout;
}

export function getLayout() { return layout; }

export function clear() {
  ctx.fillStyle = COLORS.felt;
  ctx.fillRect(0, 0, layout.w, layout.h);
  // Subtle felt texture via border
  ctx.strokeStyle = COLORS.feltBorder;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, layout.w - 4, layout.h - 4);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawCardBack(x, y, alpha = 1) {
  const { cardW, cardH, radius } = layout;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Shadow
  ctx.shadowColor = COLORS.cardShadow;
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  roundRect(x, y, cardW, cardH, radius);
  ctx.fillStyle = COLORS.cardBack1;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Cross-hatch pattern
  ctx.strokeStyle = COLORS.cardBackPattern;
  ctx.lineWidth = 1;
  const pad = 4;
  ctx.save();
  ctx.clip();
  const step = 8;
  for (let i = -cardH; i < cardW + cardH; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + pad + i, y + pad);
    ctx.lineTo(x + pad + i + cardH, y + cardH - pad);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + pad + i, y + cardH - pad);
    ctx.lineTo(x + pad + i + cardH, y + pad);
    ctx.stroke();
  }
  ctx.restore();

  // Border
  roundRect(x, y, cardW, cardH, radius);
  ctx.strokeStyle = COLORS.cardBack2;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Inner border
  roundRect(x + 3, y + 3, cardW - 6, cardH - 6, radius - 1);
  ctx.strokeStyle = COLORS.cardBack2;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export function drawCardFace(x, y, card, alpha = 1) {
  const { cardW, cardH, radius, fontSize, suitSize, centerSuitSize } = layout;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Shadow
  ctx.shadowColor = COLORS.cardShadow;
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  roundRect(x, y, cardW, cardH, radius);
  ctx.fillStyle = COLORS.cardFace;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Border
  roundRect(x, y, cardW, cardH, radius);
  ctx.strokeStyle = COLORS.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  const color = card.color === 'red' ? COLORS.red : COLORS.black;
  ctx.fillStyle = color;

  // Top-left value
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(card.value, x + 5, y + 4);

  // Top-left suit
  ctx.font = `${suitSize}px serif`;
  ctx.fillText(card.suit, x + 5, y + fontSize + 2);

  // Bottom-right (inverted)
  ctx.save();
  ctx.translate(x + cardW - 5, y + cardH - 4);
  ctx.rotate(Math.PI);
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(card.value, 0, 0);
  ctx.font = `${suitSize}px serif`;
  ctx.fillText(card.suit, 0, fontSize + 2);
  ctx.restore();

  // Center suit
  ctx.font = `${centerSuitSize}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.suit, x + cardW / 2, y + cardH / 2);

  ctx.restore();
}

export function drawEmptyPile(x, y, label = '') {
  const { cardW, cardH, radius } = layout;
  roundRect(x, y, cardW, cardH, radius);
  ctx.fillStyle = COLORS.emptyPile;
  ctx.fill();
  roundRect(x, y, cardW, cardH, radius);
  ctx.strokeStyle = COLORS.emptyPileBorder;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (label) {
    ctx.fillStyle = COLORS.emptyPileBorder;
    ctx.font = `${layout.centerSuitSize * 0.6}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + cardW / 2, y + cardH / 2);
  }
}

export function drawHighlight(x, y) {
  const { cardW, cardH, radius } = layout;
  roundRect(x, y, cardW, cardH, radius);
  ctx.fillStyle = COLORS.validDrop;
  ctx.fill();
  roundRect(x, y, cardW, cardH, radius);
  ctx.strokeStyle = 'rgba(144,238,144,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function drawButton(x, y, w, h, text, fontSize = 14) {
  const r = 6;
  roundRect(x, y, w, h, r);
  ctx.fillStyle = COLORS.buttonBg;
  ctx.fill();
  roundRect(x, y, w, h, r);
  ctx.strokeStyle = COLORS.cardBack2;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = COLORS.buttonText;
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);
}

export function drawText(x, y, text, size = 14, align = 'left') {
  ctx.fillStyle = COLORS.text;
  ctx.font = `${size}px Georgia, serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// Particles for win effect
const particles = [];

export function spawnWinParticles() {
  const colors = [COLORS.winParticle1, COLORS.winParticle2, COLORS.winParticle3];
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: layout.w / 2,
      y: layout.h / 2,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12 - 4,
      life: 1,
      decay: 0.005 + Math.random() * 0.01,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 5,
    });
  }
}

export function updateAndDrawParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // gravity
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return particles.length > 0;
}

export function getCardPosition(state, source, colIndex, cardIndex) {
  const l = layout;
  if (source === 'stock') return { x: l.stockX, y: l.stockY };
  if (source === 'waste') return { x: l.wasteX, y: l.wasteY };
  if (source === 'foundation') return { x: l.foundationX[colIndex], y: l.foundationY };
  if (source === 'tableau') {
    const col = state.tableau[colIndex];
    let yOff = 0;
    for (let i = 0; i < cardIndex; i++) {
      yOff += col[i].faceUp ? l.overlapUp : l.overlapDown;
    }
    return { x: l.tableauX[colIndex], y: l.tableauY + yOff };
  }
  return { x: 0, y: 0 };
}
