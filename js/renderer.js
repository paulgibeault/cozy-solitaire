import { COLORS, SUIT_COLORS, CARD_ASPECT, CARD_RADIUS_RATIO, CARD_OVERLAP_FACEDOWN, CARD_OVERLAP_FACEUP,
  PILE_GAP_RATIO, TOP_MARGIN_RATIO, FONT_RATIO, SUIT_FONT_RATIO, CENTER_SUIT_RATIO, OVERLAP_RATIO,
  TABLEAU_COLS, FOUNDATION_COUNT, MAX_CARD_W, MAX_CARD_W_PORTRAIT } from './constants.js';

let canvas, ctx;
let layout = {};
let lastCacheKey = '';

// Felt watermark — pure-path SVG, loaded once
let logoImg = null;
let logoLoaded = false;
function ensureLogoLoaded() {
  if (logoImg) return;
  logoImg = new Image();
  logoImg.onload = () => { logoLoaded = true; invalidateCardBackCache(); };
  logoImg.onerror = (e) => { console.warn('Watermark SVG failed to load', e); };
  logoImg.src = 'logo_watermark.svg';
}

// Colored logo for card backs — loaded once
let cardLogoImg = null;
let cardLogoLoaded = false;
function ensureCardLogoLoaded() {
  if (cardLogoImg) return;
  cardLogoImg = new Image();
  cardLogoImg.onload = () => { cardLogoLoaded = true; invalidateCardBackCache(); };
  cardLogoImg.onerror = (e) => { console.warn('Card logo SVG failed to load', e); };
  cardLogoImg.src = 'logo.svg';
}

// --- Offscreen card-back texture cache ---
// Re-rendered only when card dimensions change (layout recalc).
let cardBackCache = null;  // OffscreenCanvas or regular canvas
let cardBackCacheW = 0;
let cardBackCacheH = 0;
function invalidateCardBackCache() { cardBackCache = null; }

// --- Offscreen card-face texture cache ---
let cardFaceCache = new Map();
function invalidateCardFaceCache() { cardFaceCache.clear(); }

function getCardBackCache(cardW, cardH, radius) {
  if (cardBackCache && cardBackCacheW === cardW && cardBackCacheH === cardH) return cardBackCache;
  // Create (or re-create) the offscreen canvas
  const c = document.createElement('canvas');
  c.width = cardW + 4;   // +4 for fake shadow bleed
  c.height = cardH + 4;
  const cx = c.getContext('2d');

  // Fake shadow — cheap dark rect offset by 2px
  cx.fillStyle = 'rgba(0,0,0,0.25)';
  const r = radius;
  _roundRectPath(cx, 2, 2, cardW, cardH, r);
  cx.fill();

  // Card back fill
  _roundRectPath(cx, 0, 0, cardW, cardH, r);
  cx.fillStyle = '#ede2c8';
  cx.fill();

  // Clip interior for texture
  cx.save();
  _roundRectPath(cx, 0, 0, cardW, cardH, r);
  cx.clip();

  // Crosshatch texture
  cx.strokeStyle = '#8b4513';
  cx.globalAlpha = 0.18;
  cx.lineWidth = 0.75;
  const step = 9;
  for (let i = -cardH; i < cardW + cardH; i += step) {
    cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i + cardH, cardH); cx.stroke();
    cx.beginPath(); cx.moveTo(i, cardH); cx.lineTo(i + cardH, 0); cx.stroke();
  }
  cx.globalAlpha = 1;

  // Logo
  if (cardLogoLoaded) {
    const logoSize = Math.round(cardW * 0.82);
    cx.drawImage(cardLogoImg, (cardW - logoSize) / 2, (cardH - logoSize) / 2, logoSize, logoSize);
  }
  cx.restore();

  // Outer border
  _roundRectPath(cx, 0, 0, cardW, cardH, r);
  cx.strokeStyle = '#8b4513';
  cx.lineWidth = 2;
  cx.stroke();

  // Inner border
  const ib = 4;
  _roundRectPath(cx, ib, ib, cardW - ib * 2, cardH - ib * 2, Math.max(r - ib, 2));
  cx.strokeStyle = '#8b4513';
  cx.lineWidth = 0.75;
  cx.stroke();

  cardBackCache = c;
  cardBackCacheW = cardW;
  cardBackCacheH = cardH;
  return c;
}

// Shared path helper (works on any canvas context)
function _roundRectPath(cx, x, y, w, h, r) {
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.lineTo(x + w - r, y);
  cx.quadraticCurveTo(x + w, y, x + w, y + r);
  cx.lineTo(x + w, y + h - r);
  cx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  cx.lineTo(x + r, y + h);
  cx.quadraticCurveTo(x, y + h, x, y + h - r);
  cx.lineTo(x, y + r);
  cx.quadraticCurveTo(x, y, x + r, y);
  cx.closePath();
}

export function initRenderer(c) {
  canvas = c;
  ctx = canvas.getContext('2d');
  recalcLayout();
}

export function recalcLayout() {
  invalidateCardBackCache();
  invalidateCardFaceCache();
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Calculate card size to fit columns + gaps dynamically based on the game rules
  const config = (window.__gameState && window.__gameState.config) || { layoutCols: 7, layoutRows: 3 };
  const totalCols = config.layoutCols;
  const gapCount = totalCols + 1;
  
  // Height constraint — solve for the largest card that fits a full tableau column.
  // Layout: htmlHeader (~48px) + topMargin + cardH + gap*1.5 = tableauY
  //         tableauY + worstPileH <= h - bottomPad
  // Worst-case Klondike pile: 6 face-down + 12 face-up overlaps + 1 full card
  //   worstPileH = cardH * (6*CARD_OVERLAP_FACEDOWN + 12*CARD_OVERLAP_FACEUP + 1)
  // Solve for cardH:
  const bottomPad = 16;
  const htmlHeader = 48;
  // tableauY = buttonBar + topMarginRatio*cardH/CARD_ASPECT * ... simplify: let's iterate
  // topMargin = h * TOP_MARGIN_RATIO, tableauY = topMargin + cardH + gap*1.5
  // Pile height factor: 6 face-down dealt cards + 7 face-up (typical game depth) + 1 full card
  const pileHeightFactor = 6 * CARD_OVERLAP_FACEDOWN + 7 * CARD_OVERLAP_FACEUP + 1;
  // Available vertical space for tableau
  const availH = h - htmlHeader - bottomPad;
  // topMargin + cardH (top row) + gap*1.5 (inter-row gap) + pileHeightFactor * cardH <= availH
  // h*TOP_MARGIN_RATIO + cardH*(1 + pileHeightFactor) + gap*1.5 <= availH
  // Approximate gap as 6px (will be recalculated anyway).
  const approxGap = 6;
  const topMarginPx = h * TOP_MARGIN_RATIO;
  const heightCardW = Math.floor(
    (availH - topMarginPx - approxGap * 1.5) / (1 + pileHeightFactor) / CARD_ASPECT
  );
  
  // Width constraint: fit 7 columns across the screen
  const maxW = Math.floor((w - gapCount * 6) / totalCols * 0.92);

  // Final dimensions: take the smaller of width-constrained and height-constrained card sizes
  const isLandscape = w > h;

  const cols = totalCols;
  let paddingX = isLandscape ? 20 : 10;
  let cardW = (w - (paddingX * 2) - ((cols - 1) * 10)) / cols;

  if (isLandscape && cardW > MAX_CARD_W) cardW = MAX_CARD_W;
  if (!isLandscape && cardW > MAX_CARD_W_PORTRAIT) cardW = MAX_CARD_W_PORTRAIT;

  let cardH = cardW * CARD_ASPECT;

  const overlapDown = cardH * OVERLAP_RATIO;
  const overlapRight = cardW * 0.35;

  let totalW = (cols * cardW) + ((cols - 1) * 10);
  let startX = (w - totalW) / 2;

  // For portrait, we might need smaller top margin
  let topMargin = isLandscape ? 80 : 60;
  let rowSpacing = cardH + 20; // Distance between gridY=0 and gridY=1

  layout = {
    w, h,
    cardW, cardH,
    overlapDown,
    overlapRight,
    radius: Math.round(cardW * CARD_RADIUS_RATIO),
    fontSize: Math.round(cardW * FONT_RATIO),
    suitSize: Math.round(cardW * SUIT_FONT_RATIO),
    centerSuitSize: Math.round(cardW * CENTER_SUIT_RATIO),
    zones: new Map() // We'll compute absolute positions per-zone
  };

  // If game is initialized, map grid coordinates to screen coordinates
  if (window.__gameState && window.__gameState.zones) {
    for (const [id, zone] of window.__gameState.zones.entries()) {
        const gx = zone.config.gridX || 0;
        const gy = zone.config.gridY || 0;

        const x = startX + (gx * (cardW + 10));
        let y = topMargin + (gy * rowSpacing);

        layout.zones.set(id, { x, y });
    }
  }

  const newCacheKey = `${cardW.toFixed(2)}x${cardH.toFixed(2)}`;
  if (lastCacheKey !== newCacheKey) {
    invalidateCardFaceCache();
    invalidateCardBackCache(); // Also invalidate card back cache on dimension change
    lastCacheKey = newCacheKey;
  }
}

export function getLayout() { return layout; }

export function clear() {
  ctx.fillStyle = COLORS.felt;
  ctx.fillRect(0, 0, layout.w, layout.h);

  // Felt watermark logo (centered, subtle)
  ensureLogoLoaded();
  if (logoLoaded) {
    const logoSize = Math.min(layout.w, layout.h) * 0.45;
    const lx = (layout.w - logoSize) / 2;
    const ly = layout.h * 0.62 - logoSize / 2;
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.drawImage(logoImg, lx, ly, logoSize, logoSize);
    ctx.restore();
  }

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
  const cached = getCardBackCache(cardW, cardH, radius);
  // The cache canvas is cardW+4 × cardH+4 (shadow bleed), draw it offset by -2,-2
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(cached, x - 2, y - 2);
  ctx.restore();
}

function getCardFaceCache(cardW, cardH, radius, fontSize, suitSize, centerSuitSize, card) {
  const cacheKey = `${card.id}_${cardW}_${cardH}`;
  if (cardFaceCache.has(cacheKey)) {
    return cardFaceCache.get(cacheKey);
  }

  const c = document.createElement('canvas');
  c.width = cardW + 4;   // +4 for shadow bleed
  c.height = cardH + 4;
  const cx = c.getContext('2d');

  // Cheap fake shadow — no shadowBlur GPU pass
  cx.fillStyle = 'rgba(0,0,0,0.22)';
  _roundRectPath(cx, 2, 2, cardW, cardH, radius);
  cx.fill();

  // Card face
  _roundRectPath(cx, 0, 0, cardW, cardH, radius);
  cx.fillStyle = COLORS.cardFace;
  cx.fill();

  // Border
  _roundRectPath(cx, 0, 0, cardW, cardH, radius);
  cx.strokeStyle = COLORS.cardBorder;
  cx.lineWidth = 1;
  cx.stroke();

  const color = card.color === 'red' ? COLORS.red : COLORS.black;
  cx.fillStyle = color;

  // Top-left value
  cx.font = `bold ${fontSize}px Georgia, serif`;
  cx.textAlign = 'left';
  cx.textBaseline = 'top';
  cx.fillText(card.value, 5, 4);

  // Top-left suit
  cx.font = `${suitSize}px serif`;
  cx.fillText(card.suit, 5, fontSize + 2);

  // Bottom-right (inverted)
  cx.save();
  cx.translate(cardW - 5, cardH - 4);
  cx.rotate(Math.PI);
  cx.font = `bold ${fontSize}px Georgia, serif`;
  cx.textAlign = 'left';
  cx.textBaseline = 'top';
  cx.fillText(card.value, 0, 0);
  cx.font = `${suitSize}px serif`;
  cx.fillText(card.suit, 0, fontSize + 2);
  cx.restore();

  // Center suit
  cx.font = `${centerSuitSize}px serif`;
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillText(card.suit, cardW / 2, cardH / 2);

  cardFaceCache.set(cacheKey, c);
  return c;
}

export function drawCardFace(x, y, card, alpha = 1) {
  const { cardW, cardH, radius, fontSize, suitSize, centerSuitSize } = layout;
  const cached = getCardFaceCache(cardW, cardH, radius, fontSize, suitSize, centerSuitSize, card);

  ctx.save();
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(cached, x - 2, y - 2);
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
  const r = 8;
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
  ctx.fillStyle = COLORS.buttonBg;
  ctx.fill();
  ctx.strokeStyle = COLORS.buttonBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  
  ctx.fillStyle = COLORS.buttonText;
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
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

export function drawSquashedLabel(x, y, card) {
  const { cardW } = layout;
  ctx.save();

  const str = `${card.value}${card.suit}`;
  ctx.font = 'bold 13px Georgia, serif';
  const tw = ctx.measureText(str).width;

  const bx = x + cardW - tw - 12; // top right
  const by = y + 4;
  const bw = tw + 8;
  const bh = 18;
  const r = 4;

  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();

  ctx.fillStyle = COLORS.cardFace;
  ctx.fill();
  ctx.strokeStyle = COLORS.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = card.color === 'red' ? COLORS.red : COLORS.black;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, bx + bw / 2, by + bh / 2 + 1);

  ctx.restore();
}

export function getCardPosition(state, sourceZoneId, cardIndex) {
  const l = layout;
  const pos = l.zones.get(sourceZoneId);
  if (!pos) return { x: 0, y: 0 };

  const zone = state.zones.get(sourceZoneId);
  if (!zone) return pos;

  let dx = pos.x;
  let dy = pos.y;
  
  let squashFactor = 1;

  if (zone.type === 'fanDown' && zone.cards.length > 1) {
    const bottomPadding = 16;
    const maxOffset = l.h - pos.y - l.cardH - bottomPadding;
    
    let totalOffset = 0;
    for (let i = 0; i < zone.cards.length - 1; i++) {
        totalOffset += zone.cards[i].faceUp ? l.overlapDown : l.overlapDown * 0.4;
    }
    
    if (totalOffset > maxOffset && maxOffset > 0) {
        squashFactor = maxOffset / totalOffset;
    }
  }

  // Add offsets based on type for cards prior to this index
  for (let i = 0; i < cardIndex; i++) {
     const c = zone.cards[i];
     if (zone.type === 'fanDown') {
         dy += (c.faceUp ? l.overlapDown : l.overlapDown * 0.4) * squashFactor;
     } else if (zone.type === 'fanRightLimited') {
         const cardsToShow = state.drawCount;
         if (i >= zone.cards.length - cardsToShow) {
             dx += l.overlapRight;
         }
     }
  }

  return { x: dx, y: dy, squashFactor };
}
