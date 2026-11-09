'use strict';
// Canvas renderer for Hexfront Rush. All shapes are drawn with paths; no image assets.
//
// The renderer only reads the engine. Sim state is integer fixed point (1000 = one hex radius)
// stepped at 30 Hz; the view runs at display rate and draws every mobile entity at
// lerp(previous tick, current tick, alpha), so motion stays smooth at any frame rate. Effects,
// floaters and numbers live here (fed by sim events) and use Math.random freely: none of it
// can reach the sim. The map is drawn from the local team's side: for red the view flips
// vertically (the map is mirrored top to bottom, so the hex grid maps onto itself), and
// sprites are still drawn upright.

const COL = {
  blue: '#3b82f6', blueDark: '#1d4ed8', blueLight: '#93c5fd', blueTile: 'rgba(59,130,246,0.55)', blueSide: '#1e3a8a',
  red: '#ef4444', redDark: '#b91c1c', redLight: '#fca5a5', redTile: 'rgba(239,68,68,0.55)', redSide: '#7f1d1d',
  gold: '#fbbf24', ink: '#1f2937', white: '#ffffff',
};
// Lilita One (SIL OFL 1.1, fonts/) has one weight and no CJK: Latin text uses it as is, Chinese
// falls back to the system font at a heavy weight.
const FONT_STACK = '"Lilita One", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const fontW = (w) => (LANG === 'zh' ? (w || 800) : 400);
const teamCol = (t) => (t === TEAM_BLUE ? COL.blue : COL.red);
const teamDark = (t) => (t === TEAM_BLUE ? COL.blueDark : COL.redDark);
const teamLight = (t) => (t === TEAM_BLUE ? COL.blueLight : COL.redLight);
const VIEW_FLIP_Y = (hexY(0) + hexY(ROWS - 1)) / FP;   // view y = this - world y, for the red side

class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 1; this.H = 1; this.dpr = 1;
    this.scale = 30; this.ox = 0; this.oy = 0;
    this.banners = [];
    this.card = null;
    this.hint = null;
    this.marker = null;
    this.guide = null;       // tile the tutorial hand points at
    this.shake = 0;          // trauma 0..1; the offset grows with its square
    this.time = 0;
    this.coins = [];         // screen-space coins flying to the gold pill
    this.dmg = new Map();    // target id -> live damage number (repeat hits merge into one)
    this.goldPop = 0;        // counter pop when coins land
    this.goldShake = 0;      // refuse shake when the player cannot afford something
    this.lastGold = null;
    this.effects = [];       // particles and rings, view space
    this.floaters = [];      // rising labels, view space
    this.local = TEAM_BLUE;
    this.flip = false;
    this.eng = null;
    this.tv = [];            // per tile view position
    this.status = null;      // online status line { text, color }
  }

  /** Point the view at an engine, seen from `local`'s side. Clears per-match juice. */
  setView(eng, local) {
    this.eng = eng;
    this.local = local || TEAM_BLUE;
    this.flip = this.local === TEAM_RED;
    this.tv = eng.tiles.map((t) => ({ x: t.x / FP, y: this.vy(t.y / FP) }));
  }
  reset() {
    this.hint = null; this.guide = null; this.banners = []; this.card = null; this.marker = null;
    this.coins = []; this.dmg.clear(); this.goldPop = 0; this.goldShake = 0; this.lastGold = null; this.shake = 0;
    this.effects = []; this.floaters = []; this.status = null;
  }
  vy(y) { return this.flip ? VIEW_FLIP_Y - y : y; }
  /** World fixed-point point -> view units. */
  view(x, y) { return { x: x / FP, y: this.vy(y / FP) }; }
  /** Interpolated view position of a mobile entity (px/py = last tick, x/y = this tick). */
  lerpPos(e, alpha) {
    return { x: (e.px + (e.x - e.px) * alpha) / FP, y: this.vy((e.py + (e.y - e.py) * alpha) / FP) };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H; this.dpr = dpr;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    this.hudTop = Math.max(58, Math.min(78, H * 0.085));
    this.hudBot = Math.max(64, Math.min(92, H * 0.1));
    const mapW = Math.sqrt(3) * (COLS + 0.5) + 0.3;
    const mapH = 1.5 * (ROWS - 1) + 2 + 0.5;
    const availH = H - this.hudTop - this.hudBot - 8;
    this.scale = Math.min((W - 12) / mapW, availH / mapH);
    this.ox = (W - mapW * this.scale) / 2 + 0.15 * this.scale;
    this.oy = this.hudTop + 4 + (availH - mapH * this.scale) / 2;
  }

  /** Screen pixel -> world fixed point (what the sim and worldToHex take). */
  screenToWorld(sx, sy) {
    const vx = (sx - this.ox) / this.scale, vyy = (sy - this.oy) / this.scale;
    return { x: Math.round(vx * FP), y: Math.round(this.vy(vyy) * FP) };
  }
  worldToScreen(x, y) { return { x: this.ox + x * this.scale, y: this.oy + y * this.scale }; }

  // ---------- events -> juice ----------
  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      this.effects.push({ type: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, t: 0,
        life: 0.5 + Math.random() * 0.4, color, size: 0.08 + Math.random() * 0.08 });
    }
  }
  ring(x, y, r, color) { this.effects.push({ type: 'ring', x, y, r, color, t: 0, life: 0.35 }); }
  floater(x, y, text, color) { this.floaters.push({ x, y, text, color, t: 0, life: 1.1 }); }
  markTile(ti) { const v = this.tv[ti]; if (v) this.marker = { x: v.x, y: v.y, t: 0.6 }; }

  /** Visual reaction to one sim event (sound and UI flow stay in main.js). */
  onEvent(e) {
    const mine = e.team === this.local;
    const p = e.x !== undefined ? this.view(e.x, e.y) : null;
    switch (e.type) {
      case 'burst': this.burst(p.x, p.y, e.color, e.n); break;
      case 'ring': this.ring(p.x, p.y, e.r / FP, e.kind === 'fire' ? '#fb923c' : '#a5b4fc'); break;
      case 'dmg': this.damageNumber(e.id, p.x, p.y, e.amount, mine ? '#fca5a5' : '#ffffff'); break;
      case 'income': if (mine) { this.floater(p.x, p.y - 0.9, '+' + e.amount, '#fde047'); this.coinFly(p.x, p.y, 1); } break;
      case 'chest': if (mine) { this.floater(p.x, p.y - 0.6, T('chest', { g: e.gold }), '#fde047'); this.coinFly(p.x, p.y, 5); } break;
      case 'quest': if (mine) this.coinFly(p.x, p.y, 6); break;
      case 'mysteryNothing': if (mine) this.floater(p.x, p.y - 0.6, T('nothing'), '#e5e7eb'); break;
      case 'bldDown': this.shake += mine ? 0.75 : 0.55; break;
      case 'heroDown': if (mine) this.shake += 0.7; break;
    }
  }
  needGold(x, y) {
    const p = this.view(x, y);
    this.floater(p.x, p.y - 0.6, T('needGold'), '#fca5a5');
    this.goldShake = 0.4;
  }

  // ---------- primitives ----------
  hexPath(x, y, r) {
    const c = this.ctx;
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 180 * (60 * k - 30);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }
  circle(x, y, r, fill, stroke, lw) {
    const c = this.ctx;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 0.06; c.stroke(); }
  }
  rrect(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  text(s, x, y, size, color, align, weight, stroke) {
    const c = this.ctx;
    // In world space a label is a fraction of a pixel before the transform scales it up, and glyph
    // advances get rounded at that size (the letters drift apart): draw it at device size instead.
    const k = c.getTransform().a;
    if (k > 4) {
      c.save(); c.translate(x, y); c.scale(1 / k, 1 / k);
      this.text(s, 0, 0, size * k, color, align, weight, stroke);
      c.restore();
      return;
    }
    c.font = fontW(weight) + ' ' + size + 'px ' + FONT_STACK;
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    if (stroke) { c.lineJoin = 'round'; c.strokeStyle = stroke; c.lineWidth = size * 0.22; c.strokeText(s, x, y); }
    c.fillStyle = color; c.fillText(s, x, y);
  }

  // ---------- frame ----------
  /** eng: the Engine; alpha: 0..1 between the last two ticks; dt: real seconds (0 while paused);
   *  ui: { goldFlash, heroView } (heroView: predicted view position of the local hero, online). */
  draw(eng, alpha, dt, ui) {
    if (eng !== this.eng) this.setView(eng, this.local);
    this.time += dt;
    this.alpha = alpha;
    this.ui = ui || {};
    const c = this.ctx;
    const dpr = this.dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = eng.theme.bg;
    c.fillRect(0, 0, this.W, this.H);

    let sx = 0, sy = 0;
    if (this.shake > 0) {
      this.shake = Math.min(1, this.shake);
      const k = this.shake * this.shake * 14;
      sx = Math.sin(this.time * 61) * k; sy = Math.cos(this.time * 53) * k;
      this.shake = Math.max(0, this.shake - dt * 1.6);
    }
    const s = this.scale;
    c.setTransform(s * dpr, 0, 0, s * dpr, (this.ox + sx) * dpr, (this.oy + sy) * dpr);

    this.drawTiles(eng);
    this.drawOffers(eng);
    if (this.marker && this.marker.t > 0) {
      this.marker.t -= dt;
      c.globalAlpha = Math.max(0, Math.min(1, this.marker.t * 2));
      this.hexPath(this.marker.x, this.marker.y, 0.55 + (1 - this.marker.t) * 0.2);
      c.strokeStyle = '#ffffff'; c.lineWidth = 0.08; c.stroke();
      c.globalAlpha = 1;
    }

    // y-sorted sprites (view y)
    const sprites = [];
    for (const t of eng.tiles) {
      const v = this.tv[t.i];
      const b = t.bld ? eng.ent(t.bld) : null;
      if (t.obst) sprites.push({ y: v.y, f: () => this.drawObstacle(t, v) });
      else if (b) sprites.push({ y: v.y, f: () => this.drawBuilding(b, v, eng) });
      else if (t.rubble) sprites.push({ y: v.y - 0.1, f: () => this.drawRubble(v) });
      if (t.chest && !b) sprites.push({ y: v.y + 0.01, f: () => this.drawChest(t, v) });
    }
    for (const u of eng.units) {
      if (!u.alive) continue;
      const p = this.lerpPos(u, alpha);
      sprites.push({ y: p.y, f: () => this.drawUnit(u, p, eng) });
    }
    for (const tm of TEAMS) {
      const h = eng.heroes[tm];
      if (h.dead) continue;
      const p = tm === this.local && this.ui.heroView ? this.ui.heroView : this.lerpPos(h, alpha);
      sprites.push({ y: p.y + 0.02, f: () => this.drawHero(h, p, eng) });
    }
    sprites.sort((a, b) => a.y - b.y);
    for (const sp of sprites) sp.f();

    this.drawProjectiles(eng, alpha);
    this.drawEffects(dt);

    // screen-space HUD
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHUD(eng);
    this.drawOverlays(eng, dt);
  }

  drawTiles(eng) {
    const c = this.ctx;
    const th = eng.theme;
    for (const t of eng.tiles) {
      const v = this.tv[t.i];
      this.hexPath(v.x, v.y + 0.16, 0.97);
      c.fillStyle = t.owner === TEAM_BLUE ? COL.blueSide : t.owner === TEAM_RED ? COL.redSide : th.side;
      c.fill();
    }
    for (const t of eng.tiles) {
      const v = this.tv[t.i];
      this.hexPath(v.x, v.y, 0.95);
      c.fillStyle = th.ground[t.shade];
      c.fill();
      if (t.owner) {
        c.fillStyle = t.owner === TEAM_BLUE ? COL.blueTile : COL.redTile;
        c.fill();
      }
      if (t.obst) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fill(); }
    }
    // network rings around buildings (light outline)
    c.lineWidth = 0.07;
    for (const b of eng.blds) {
      c.strokeStyle = b.team === TEAM_BLUE ? 'rgba(219,234,254,0.85)' : 'rgba(254,226,226,0.85)';
      const v = this.tv[b.tile];
      this.hexPath(v.x, v.y, 0.86); c.stroke();
    }
  }

  drawOffers(eng) {
    const c = this.ctx;
    const Tm = eng.team[this.local];
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    for (let i = 0; i < NTILES; i++) {
      const oi = Tm.offers[i];
      if (oi < 0) continue;
      const v = this.tv[i];
      const off = OFFER_LIST[oi];
      const afford = Tm.gold >= off.cost;
      c.setLineDash([0.18, 0.12]);
      this.hexPath(v.x, v.y, 0.8);
      c.strokeStyle = afford ? `rgba(255,255,255,${0.6 + pulse * 0.4})` : 'rgba(255,255,255,0.45)';
      c.lineWidth = 0.07;
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.fill();
      this.drawOfferIcon(off.key, v.x, v.y - 0.22, 0.38);
      this.text(String(off.cost), v.x, v.y + 0.42, 0.42, afford ? '#ffffff' : '#ff4d4d', 'center', 900, 'rgba(0,0,0,0.6)');
    }
  }

  drawOfferIcon(key, x, y, s) {
    const c = this.ctx;
    if (key === 'mine') {
      this.circle(x - s * 0.35, y + s * 0.15, s * 0.42, '#f59e0b', '#92400e', s * 0.12);
      this.circle(x + s * 0.35, y + s * 0.15, s * 0.42, '#fbbf24', '#92400e', s * 0.12);
      this.circle(x, y - s * 0.3, s * 0.42, '#fde047', '#92400e', s * 0.12);
    } else if (key === 'tower') {
      c.beginPath();
      c.moveTo(x, y - s * 0.9); c.lineTo(x + s * 0.75, y - s * 0.6); c.lineTo(x + s * 0.6, y + s * 0.4);
      c.lineTo(x, y + s * 0.95); c.lineTo(x - s * 0.6, y + s * 0.4); c.lineTo(x - s * 0.75, y - s * 0.6); c.closePath();
      c.fillStyle = '#60a5fa'; c.fill(); c.strokeStyle = '#1e3a8a'; c.lineWidth = s * 0.14; c.stroke();
    } else if (key === 'myst') {
      this.circle(x, y, s * 0.85, '#7c3aed', '#3b0764', s * 0.14);
      this.text('?', x, y + s * 0.05, s * 1.3, '#ffffff', 'center', 900);
    } else {
      const tier = key === 'bar1' ? 0 : key === 'bar2' ? 1 : 2;
      const ring = ['#d1d5db', '#38bdf8', '#c084fc'][tier];
      this.circle(x, y, s * 0.85, '#374151', ring, s * 0.18);
      c.strokeStyle = '#f3f4f6'; c.lineWidth = s * 0.16; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - s * 0.45, y + s * 0.45); c.lineTo(x + s * 0.45, y - s * 0.45);
      c.moveTo(x + s * 0.45, y + s * 0.45); c.lineTo(x - s * 0.45, y - s * 0.45); c.stroke();
      c.lineCap = 'butt';
      for (let k = 0; k <= tier; k++) this.circle(x - (tier * 0.22 * s) + k * 0.44 * s, y + s * 1.05, s * 0.14, ring);
    }
  }

  drawObstacle(t, vp) {
    const c = this.ctx;
    const x = vp.x, y = vp.y;
    const v = t.deco / 1000;
    switch (t.obst) {
      case 'tree':
        c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x, y + 0.35, 0.55, 0.2, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#7c4a24'; c.fillRect(x - 0.09, y - 0.1, 0.18, 0.45);
        this.circle(x - 0.25, y - 0.35, 0.38, '#3f8f3a');
        this.circle(x + 0.25, y - 0.4, 0.36, '#4aa244');
        this.circle(x, y - 0.68, 0.4, '#5cb653');
        this.circle(x - 0.1, y - 0.78, 0.14, 'rgba(255,255,255,0.25)');
        break;
      case 'pine':
        c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x, y + 0.35, 0.5, 0.18, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#6b4423'; c.fillRect(x - 0.08, y + 0.05, 0.16, 0.3);
        for (let k = 0; k < 3; k++) {
          const yy = y + 0.1 - k * 0.32, w = 0.58 - k * 0.14;
          c.beginPath(); c.moveTo(x - w, yy); c.lineTo(x + w, yy); c.lineTo(x, yy - 0.5); c.closePath();
          c.fillStyle = k % 2 ? '#2f6d5a' : '#357a64'; c.fill();
          c.beginPath(); c.moveTo(x - w * 0.6, yy - 0.12); c.lineTo(x + w * 0.2, yy - 0.12); c.lineTo(x, yy - 0.5); c.closePath();
          c.fillStyle = '#f1f5f9'; c.fill();
        }
        break;
      case 'rock':
        c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(x, y + 0.3, 0.6, 0.2, 0, 0, Math.PI * 2); c.fill();
        c.beginPath();
        c.moveTo(x - 0.6, y + 0.3); c.lineTo(x - 0.45, y - 0.25); c.lineTo(x - 0.05, y - 0.55 - v * 0.15);
        c.lineTo(x + 0.4, y - 0.3); c.lineTo(x + 0.6, y + 0.3); c.closePath();
        c.fillStyle = '#8b8f98'; c.fill();
        c.beginPath(); c.moveTo(x - 0.05, y - 0.55 - v * 0.15); c.lineTo(x + 0.4, y - 0.3); c.lineTo(x + 0.6, y + 0.3); c.lineTo(x + 0.05, y + 0.3); c.closePath();
        c.fillStyle = '#6b7280'; c.fill();
        break;
      case 'cactus':
        c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x, y + 0.35, 0.45, 0.16, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#4d9a4a';
        this.rrect(x - 0.16, y - 0.75, 0.32, 1.1, 0.16); c.fill();
        this.rrect(x - 0.48, y - 0.45, 0.2, 0.45, 0.1); c.fill();
        this.rrect(x - 0.48, y - 0.1, 0.38, 0.18, 0.09); c.fill();
        this.rrect(x + 0.28, y - 0.6, 0.2, 0.45, 0.1); c.fill();
        this.rrect(x + 0.1, y - 0.25, 0.38, 0.18, 0.09); c.fill();
        if (v > 0.5) this.circle(x, y - 0.8, 0.1, '#f472b6');
        break;
      case 'ice':
        c.fillStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); c.ellipse(x, y + 0.3, 0.5, 0.18, 0, 0, Math.PI * 2); c.fill();
        for (const [dx, h, w] of [[-0.25, 0.7, 0.2], [0.1, 1.0, 0.25], [0.35, 0.6, 0.18]]) {
          c.beginPath(); c.moveTo(x + dx - w, y + 0.3); c.lineTo(x + dx, y + 0.3 - h); c.lineTo(x + dx + w, y + 0.3); c.closePath();
          c.fillStyle = '#a5d8f3'; c.fill();
          c.beginPath(); c.moveTo(x + dx, y + 0.3 - h); c.lineTo(x + dx + w, y + 0.3); c.lineTo(x + dx, y + 0.3); c.closePath();
          c.fillStyle = '#7cc3e8'; c.fill();
        }
        break;
    }
  }

  drawShadow(x, y, rx) {
    const c = this.ctx;
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(x, y, rx, rx * 0.38, 0, 0, Math.PI * 2); c.fill();
  }

  drawBuilding(b, v, eng) {
    const c = this.ctx;
    const x = v.x, y = v.y;
    const tc = teamCol(b.team), td = teamDark(b.team);
    const born = (eng.tick - b.bornT + this.alpha) / TICK_RATE;
    const pop = Math.min(1, born * 4);
    const sc = 0.6 + 0.4 * pop + (pop < 1 ? Math.sin(pop * Math.PI) * 0.15 : 0);
    c.save();
    c.translate(x, y + 0.3); c.scale(sc, sc); c.translate(-x, -(y + 0.3));
    this.drawShadow(x, y + 0.3, 0.62);
    if (eng.tick - b.hitT < HIT_FLASH) c.filter = 'brightness(1.8)';
    switch (b.type) {
      case 'base': {
        c.fillStyle = '#e5e7eb'; this.rrect(x - 0.62, y - 0.55, 1.24, 0.85, 0.08); c.fill();
        c.fillStyle = '#cbd5e1'; c.fillRect(x - 0.62, y + 0.05, 1.24, 0.25);
        for (const dx of [-0.62, 0.62]) {
          c.fillStyle = '#d1d5db'; c.fillRect(x + dx - 0.2, y - 0.85, 0.4, 1.15);
          c.beginPath(); c.moveTo(x + dx - 0.27, y - 0.85); c.lineTo(x + dx, y - 1.25); c.lineTo(x + dx + 0.27, y - 0.85); c.closePath();
          c.fillStyle = tc; c.fill();
        }
        c.beginPath(); c.moveTo(x - 0.45, y - 0.55); c.lineTo(x, y - 1.0); c.lineTo(x + 0.45, y - 0.55); c.closePath();
        c.fillStyle = td; c.fill();
        c.fillStyle = '#5b3a1e'; this.rrect(x - 0.18, y - 0.2, 0.36, 0.5, 0.15); c.fill();
        c.strokeStyle = '#374151'; c.lineWidth = 0.05; c.beginPath(); c.moveTo(x, y - 1.0); c.lineTo(x, y - 1.45); c.stroke();
        const wv = Math.sin(this.time * 6) * 0.05;
        c.beginPath(); c.moveTo(x, y - 1.45); c.lineTo(x + 0.38, y - 1.36 + wv); c.lineTo(x, y - 1.25); c.closePath(); c.fillStyle = tc; c.fill();
        break;
      }
      case 'mine': {
        c.beginPath(); c.moveTo(x - 0.6, y + 0.3); c.quadraticCurveTo(x - 0.5, y - 0.6, x, y - 0.62); c.quadraticCurveTo(x + 0.5, y - 0.6, x + 0.6, y + 0.3); c.closePath();
        c.fillStyle = '#78716c'; c.fill();
        c.fillStyle = '#292524'; this.rrect(x - 0.22, y - 0.15, 0.44, 0.45, 0.2); c.fill();
        c.strokeStyle = '#a16207'; c.lineWidth = 0.07; c.beginPath(); c.moveTo(x - 0.26, y + 0.3); c.lineTo(x - 0.26, y - 0.18); c.lineTo(x + 0.26, y - 0.18); c.lineTo(x + 0.26, y + 0.3); c.stroke();
        this.circle(x - 0.36, y - 0.15, 0.1, '#fde047'); this.circle(x + 0.35, y - 0.3, 0.08, '#fde047'); this.circle(x + 0.1, y - 0.5, 0.07, '#fde047');
        c.fillStyle = tc; c.fillRect(x - 0.03, y - 0.95, 0.06, 0.35);
        c.beginPath(); c.moveTo(x + 0.03, y - 0.95); c.lineTo(x + 0.3, y - 0.86); c.lineTo(x + 0.03, y - 0.77); c.fill();
        const p = Math.min(1, b.timer / BUILD.mine.incomeEvery);
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.09; c.beginPath(); c.arc(x + 0.55, y - 0.65, 0.17, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = '#fde047'; c.beginPath(); c.arc(x + 0.55, y - 0.65, 0.17, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); c.stroke();
        break;
      }
      case 'tower': {
        c.fillStyle = '#9ca3af'; c.fillRect(x - 0.3, y - 0.8, 0.6, 1.1);
        c.fillStyle = '#6b7280'; c.fillRect(x + 0.05, y - 0.8, 0.25, 1.1);
        c.fillStyle = '#d1d5db'; c.fillRect(x - 0.42, y - 1.05, 0.84, 0.3);
        for (let k = 0; k < 3; k++) { c.fillStyle = '#d1d5db'; c.fillRect(x - 0.42 + k * 0.32, y - 1.2, 0.2, 0.18); }
        c.fillStyle = tc; c.fillRect(x - 0.42, y - 0.83, 0.84, 0.08);
        c.fillStyle = '#1f2937'; this.rrect(x - 0.08, y - 0.55, 0.16, 0.26, 0.08); c.fill();
        break;
      }
      case 'barracks': {
        const rc = RARITY_COLOR[b.rarity];
        c.fillStyle = '#a16207'; c.fillRect(x - 0.6, y - 0.35, 1.2, 0.65);
        c.fillStyle = '#854d0e'; c.fillRect(x + 0.2, y - 0.35, 0.4, 0.65);
        c.beginPath(); c.moveTo(x - 0.72, y - 0.3); c.lineTo(x, y - 0.95); c.lineTo(x + 0.72, y - 0.3); c.closePath();
        c.fillStyle = tc; c.fill();
        c.beginPath(); c.moveTo(x, y - 0.95); c.lineTo(x + 0.72, y - 0.3); c.lineTo(x + 0.3, y - 0.3); c.closePath(); c.fillStyle = td; c.fill();
        c.fillStyle = '#3f2a14'; this.rrect(x - 0.2, y - 0.15, 0.4, 0.45, 0.18); c.fill();
        c.beginPath(); c.moveTo(x, y - 0.78); c.lineTo(x + 0.14, y - 0.62); c.lineTo(x, y - 0.46); c.lineTo(x - 0.14, y - 0.62); c.closePath();
        c.fillStyle = rc; c.fill(); c.strokeStyle = '#111827'; c.lineWidth = 0.04; c.stroke();
        const ud = UNITS[b.unit];
        const full = b.kids >= ud.cap;
        const p = full ? 1 : 1 - Math.max(0, b.spawnT) / ud.spawn;
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x - 0.45, y + 0.42, 0.9, 0.1);
        c.fillStyle = full ? '#9ca3af' : rc; c.fillRect(x - 0.45, y + 0.42, 0.9 * Math.max(0, Math.min(1, p)), 0.1);
        break;
      }
    }
    c.filter = 'none';
    c.restore();
    if (b.hp < b.maxhp) this.hpBar(x, y - (b.type === 'base' ? 1.65 : 1.2), b.type === 'base' ? 1.3 : 0.9, b.hp / b.maxhp, b.team);
  }

  drawRubble(v) {
    for (const [dx, dy, r] of [[-0.3, 0.1, 0.16], [0.1, 0.2, 0.2], [0.32, 0.0, 0.13], [-0.05, -0.12, 0.14]]) {
      this.circle(v.x + dx, v.y + dy, r, '#78716c', '#57534e', 0.04);
    }
  }

  drawChest(t, v) {
    const c = this.ctx;
    const x = v.x, y = v.y + Math.sin(this.time * 3 + t.i) * 0.05;
    this.drawShadow(v.x, v.y + 0.3, 0.4);
    c.fillStyle = '#92400e'; this.rrect(x - 0.36, y - 0.2, 0.72, 0.45, 0.06); c.fill();
    c.fillStyle = '#b45309'; this.rrect(x - 0.38, y - 0.4, 0.76, 0.25, 0.1); c.fill();
    c.fillStyle = '#fbbf24'; c.fillRect(x - 0.38, y - 0.18, 0.76, 0.06); c.fillRect(x - 0.05, y - 0.4, 0.1, 0.65);
    this.circle(x, y - 0.1, 0.07, '#fde047');
    const sp = (Math.sin(this.time * 5 + t.i) + 1) / 2;
    this.circle(x + 0.3, y - 0.5, 0.05 + sp * 0.04, 'rgba(255,255,255,0.9)');
  }

  hpBar(x, y, w, p, team) {
    const c = this.ctx;
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - w / 2 - 0.03, y - 0.03, w + 0.06, 0.16);
    c.fillStyle = team === this.local ? '#4ade80' : '#f87171';
    c.fillRect(x - w / 2, y, w * Math.max(0, p), 0.1);
  }

  drawEyes(x, y, s, face) {
    const ex = face * s * 0.25;
    this.circle(x - s * 0.28 + ex, y, s * 0.2, '#ffffff');
    this.circle(x + s * 0.28 + ex, y, s * 0.2, '#ffffff');
    this.circle(x - s * 0.24 + ex * 1.3, y + s * 0.02, s * 0.1, '#111827');
    this.circle(x + s * 0.32 + ex * 1.3, y + s * 0.02, s * 0.1, '#111827');
  }

  drawUnit(u, p, eng) {
    const def = UNITS[u.type];
    const moving = u.x !== u.px || u.y !== u.py;
    this.drawUnitSprite({
      type: u.type, team: u.team, x: p.x, y: p.y, s: def.size / FP, face: u.face || (u.team === TEAM_BLUE ? 1 : -1),
      lunge: eng.tick - u.lungeT < LUNGE_TICKS, bob: moving ? Math.abs(Math.sin((this.time + u.id * 0.37) * 9)) * 0.06 : 0,
      flash: Math.max(0, HIT_FLASH - (eng.tick - u.hitT)) / HIT_FLASH, hp: u.hp / u.maxhp, id: u.id, rarity: def.rarity,
    });
  }

  /** A unit drawn from plain view data, also used for the barracks card preview. */
  drawUnitSprite(u) {
    const c = this.ctx;
    const s = u.s;
    const face = u.face;
    const x = u.x + (u.lunge ? face * 0.12 : 0), y = u.y - u.bob;
    const tc = teamCol(u.team), td = teamDark(u.team);
    this.drawShadow(u.x, u.y + s * 0.85, s * 0.9);
    switch (u.type) {
      case 'militia':
        this.circle(x, y, s, tc, td, 0.05);
        c.strokeStyle = '#78350f'; c.lineWidth = 0.06; c.beginPath(); c.moveTo(x + face * s * 1.1, y + s * 0.8); c.lineTo(x + face * s * 1.1, y - s * 1.4); c.stroke();
        c.fillStyle = '#d1d5db'; c.beginPath(); c.moveTo(x + face * s * 1.1, y - s * 1.75); c.lineTo(x + face * s * 1.25, y - s * 1.35); c.lineTo(x + face * s * 0.95, y - s * 1.35); c.fill();
        break;
      case 'slinger':
        this.circle(x, y, s, tc, td, 0.05);
        c.fillStyle = '#a16207'; c.beginPath(); c.arc(x, y - s * 0.4, s * 0.95, Math.PI, 0); c.fill();
        this.circle(x + face * s * 1.1, y + s * 0.2, s * 0.25, '#9ca3af');
        break;
      case 'shield':
        this.circle(x, y, s, tc, td, 0.05);
        c.fillStyle = '#9ca3af'; c.beginPath(); c.arc(x, y - s * 0.35, s * 0.95, Math.PI, 0); c.fill();
        c.fillStyle = td; this.rrect(x + face * s * 0.55 - s * 0.35, y - s * 0.6, s * 0.7, s * 1.3, s * 0.2); c.fill();
        c.strokeStyle = '#e5e7eb'; c.lineWidth = 0.04; c.stroke();
        break;
      case 'bowman':
        this.circle(x, y, s, tc, td, 0.05);
        c.fillStyle = '#166534'; c.beginPath(); c.moveTo(x - s, y - s * 0.3); c.lineTo(x, y - s * 1.5); c.lineTo(x + s, y - s * 0.3); c.closePath(); c.fill();
        c.strokeStyle = '#78350f'; c.lineWidth = 0.05; c.beginPath(); c.arc(x + face * s * 0.9, y, s * 0.8, -Math.PI / 2, Math.PI / 2, face < 0); c.stroke();
        break;
      case 'ogre':
        this.circle(x, y, s, '#84a35a', td, 0.07);
        c.fillStyle = tc; c.fillRect(x - s, y + s * 0.2, s * 2, s * 0.35);
        c.fillStyle = '#f5f5f4';
        c.beginPath(); c.moveTo(x - s * 0.7, y - s * 0.6); c.lineTo(x - s * 0.95, y - s * 1.2); c.lineTo(x - s * 0.4, y - s * 0.8); c.fill();
        c.beginPath(); c.moveTo(x + s * 0.7, y - s * 0.6); c.lineTo(x + s * 0.95, y - s * 1.2); c.lineTo(x + s * 0.4, y - s * 0.8); c.fill();
        c.strokeStyle = '#57534e'; c.lineWidth = 0.1; c.beginPath(); c.moveTo(x + face * s * 0.9, y + s * 0.6); c.lineTo(x + face * s * 1.3, y - s * 0.5); c.stroke();
        break;
      case 'adept':
        this.circle(x, y, s, tc, td, 0.05);
        c.fillStyle = '#4c1d95'; c.beginPath(); c.moveTo(x - s * 1.05, y - s * 0.3); c.lineTo(x + face * s * 0.3, y - s * 2.0); c.lineTo(x + s * 1.05, y - s * 0.3); c.closePath(); c.fill();
        this.circle(x + face * s * 1.2, y - s * 0.6, s * 0.28 + Math.sin(this.time * 10) * 0.03, '#fde047');
        break;
      case 'colossus':
        c.fillStyle = '#9ca3af'; this.rrect(x - s, y - s, s * 2, s * 1.9, s * 0.45); c.fill();
        c.strokeStyle = '#4b5563'; c.lineWidth = 0.07; c.stroke();
        c.fillStyle = tc; c.fillRect(x - s, y + s * 0.15, s * 2, s * 0.3);
        this.circle(x - s * 0.35 + face * s * 0.15, y - s * 0.4, s * 0.15, '#fde047');
        this.circle(x + s * 0.35 + face * s * 0.15, y - s * 0.4, s * 0.15, '#fde047');
        this.circle(x - s * 0.7, y - s * 0.85, s * 0.18, '#6b7280');
        break;
      case 'drake': {
        const flap = Math.sin(this.time * 12 + u.id) * 0.25;
        c.fillStyle = td;
        c.beginPath(); c.moveTo(x - s * 0.2, y - s * 0.2); c.lineTo(x - s * 1.4, y - s * (0.9 + flap)); c.lineTo(x - s * 0.6, y + s * 0.2); c.fill();
        c.beginPath(); c.moveTo(x + s * 0.2, y - s * 0.2); c.lineTo(x + s * 1.4, y - s * (0.9 + flap)); c.lineTo(x + s * 0.6, y + s * 0.2); c.fill();
        c.fillStyle = '#f97316'; c.beginPath(); c.ellipse(x, y, s * 0.9, s * 0.7, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = tc; c.beginPath(); c.ellipse(x, y + s * 0.25, s * 0.6, s * 0.35, 0, 0, Math.PI * 2); c.fill();
        this.circle(x + face * s * 0.8, y - s * 0.45, s * 0.42, '#fb923c');
        this.drawEyes(x + face * s * 0.85, y - s * 0.5, s * 0.5, face);
        break;
      }
    }
    if (u.type !== 'drake') this.drawEyes(x, y - s * 0.05, s * (u.type === 'colossus' ? 0 : 0.85), face);
    if (u.flash > 0) this.circle(x, y, s * 1.08, 'rgba(255,255,255,' + (0.8 * u.flash) + ')');
    if (u.rarity >= 2) {
      c.strokeStyle = RARITY_COLOR[u.rarity]; c.lineWidth = 0.05;
      c.beginPath(); c.ellipse(u.x, u.y + s * 0.85, s * 1.05, s * 0.4, 0, 0, Math.PI * 2); c.stroke();
    }
    if (u.hp < 1) this.hpBar(u.x, u.y - s * 1.6 - 0.15, Math.max(0.5, s * 1.8), u.hp, u.team);
  }

  drawHero(h, p, eng) {
    const c = this.ctx;
    const bob = h.moving ? Math.abs(Math.sin(this.time * 11)) * 0.08 : 0;
    const x = p.x, y = p.y - bob;
    const face = h.face || 1;
    const tc = teamCol(h.team), td = teamDark(h.team);
    const mine = h.team === this.local;
    if (mine) {
      c.strokeStyle = 'rgba(253,224,71,0.95)'; c.lineWidth = 0.07;
      c.beginPath(); c.ellipse(p.x, p.y + 0.35, 0.55, 0.22, 0, 0, Math.PI * 2); c.stroke();
    } else this.drawShadow(p.x, p.y + 0.35, 0.5);
    // cape
    c.fillStyle = td;
    c.beginPath(); c.moveTo(x - 0.38, y - 0.1); c.lineTo(x - face * 0.55, y + 0.4); c.lineTo(x + 0.38, y + 0.3); c.closePath(); c.fill();
    this.circle(x, y, 0.42, tc, '#0f172a', 0.06);
    c.fillStyle = td; c.beginPath(); c.arc(x, y - 0.12, 0.44, Math.PI * 1.05, Math.PI * 1.95); c.fill();
    this.drawEyes(x, y - 0.02, 0.36, face);
    // crossbow points at the current target
    const tg = eng.live(h.aim);
    let ang = face > 0 ? 0 : Math.PI;
    if (tg) {
      const tp = tg.px !== undefined ? this.lerpPos(tg, this.alpha) : this.view(tg.x, tg.y);
      ang = Math.atan2(tp.y - p.y, tp.x - p.x);
    }
    const cx = x + Math.cos(ang) * 0.42, cy = y + 0.12 + Math.sin(ang) * 0.42;
    c.save(); c.translate(cx, cy); c.rotate(ang);
    c.fillStyle = '#78350f'; c.fillRect(-0.2, -0.05, 0.45, 0.1);
    c.strokeStyle = '#d6d3d1'; c.lineWidth = 0.06; c.beginPath(); c.arc(0.12, 0, 0.22, -Math.PI / 2, Math.PI / 2, true); c.stroke();
    c.restore();
    const fl = Math.max(0, HIT_FLASH - (eng.tick - h.hitT)) / HIT_FLASH;
    if (fl > 0) this.circle(x, y, 0.46, 'rgba(255,255,255,' + (0.8 * fl) + ')');
    this.hpBar(p.x, p.y - 0.85, 0.9, h.hp / h.maxhp, h.team);
    this.text(mine ? T('you') : T('rival'), p.x, p.y - 1.1, 0.34, '#ffffff', 'center', 800, 'rgba(0,0,0,0.6)');
  }

  drawProjectiles(eng, alpha) {
    const c = this.ctx;
    for (const p of eng.projs) {
      if (p.life <= 0) continue;
      const q = this.lerpPos(p, alpha);
      const from = this.view(p.px, p.py), to = this.view(p.x, p.y);
      const a = Math.atan2(to.y - from.y, to.x - from.x);
      switch (p.kind) {
        case 'bolt':
        case 'arrow':
          c.strokeStyle = p.kind === 'bolt' ? '#fef3c7' : '#d6d3d1'; c.lineWidth = 0.07;
          c.beginPath(); c.moveTo(q.x - Math.cos(a) * 0.35, q.y - Math.sin(a) * 0.35); c.lineTo(q.x, q.y); c.stroke();
          break;
        case 'tower':
          c.strokeStyle = p.team === TEAM_BLUE ? '#bfdbfe' : '#fecaca'; c.lineWidth = 0.1;
          c.beginPath(); c.moveTo(q.x - Math.cos(a) * 0.4, q.y - Math.sin(a) * 0.4); c.lineTo(q.x, q.y); c.stroke();
          break;
        case 'stone': this.circle(q.x, q.y, 0.08, '#a8a29e'); break;
        case 'orb': this.circle(q.x, q.y, 0.14, '#fde047'); this.circle(q.x, q.y, 0.24, 'rgba(253,224,71,0.3)'); break;
        case 'fire': this.circle(q.x, q.y, 0.16, '#fb923c'); this.circle(q.x, q.y, 0.28, 'rgba(251,146,60,0.35)'); break;
      }
    }
  }

  drawEffects(dt) {
    const c = this.ctx;
    for (const e of this.effects) {
      e.t += dt;
      if (e.type === 'p') { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 6 * dt; }
    }
    this.effects = this.effects.filter((e) => e.t < e.life);
    for (const e of this.effects) {
      const k = 1 - e.t / e.life;
      if (e.type === 'p') { c.globalAlpha = k; this.circle(e.x, e.y, e.size, e.color); }
      else if (e.type === 'ring') {
        c.globalAlpha = k; c.strokeStyle = e.color; c.lineWidth = 0.1;
        c.beginPath(); c.arc(e.x, e.y, e.r * (1 - k * 0.5), 0, Math.PI * 2); c.stroke();
      }
    }
    c.globalAlpha = 1;
    for (const f of this.floaters) { f.t += dt; f.y -= 0.8 * dt; }
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    for (const f of this.floaters) {
      c.globalAlpha = Math.min(1, (1 - f.t / f.life) * 2);
      this.text(f.text, f.x, f.y, 0.42, f.color, 'center', 900, 'rgba(0,0,0,0.6)');
    }
    c.globalAlpha = 1;
  }

  // ---------- HUD ----------
  drawCoin(x, y, r) {
    this.circle(x, y, r, '#fbbf24', '#92400e', r * 0.18);
    this.circle(x, y, r * 0.55, null, '#d97706', r * 0.12);
  }

  drawHUD(eng) {
    const c = this.ctx;
    const W = this.W, H = this.H;
    const top = this.hudTop;
    const me = this.local, foe = enemyOf(me);
    c.fillStyle = 'rgba(15,23,42,0.72)';
    c.fillRect(0, 0, W, top);
    const pad = 10;
    const av = top * 0.32;
    const cx = W / 2;
    const fs = Math.max(13, top * 0.26);
    // avatars: own side on the left
    this.circle(pad + av, top * 0.42, av, teamCol(me), '#ffffff', 2);
    this.text(String(eng.team[me].units), pad + av, top * 0.42, fs * 0.95, '#fff', 'center', 900);
    this.circle(W - pad - av, top * 0.42, av, teamCol(foe), '#ffffff', 2);
    this.text(String(eng.team[foe].units), W - pad - av, top * 0.42, fs * 0.95, '#fff', 'center', 900);
    // timer
    const tLeft = Math.max(0, Math.ceil(eng.timeT / TICK_RATE));
    const mm = Math.floor(tLeft / 60), ss = tLeft % 60;
    const urgent = tLeft <= 10 && eng.phase === PHASE_PLAY;
    this.text(mm + ':' + String(ss).padStart(2, '0'), cx, top * 0.3, fs * 1.15, urgent ? '#fca5a5' : '#ffffff', 'center', 900);
    // tug bar
    const bx = pad + av * 2 + 10, bw = W - 2 * bx, by = top * 0.6, bh = Math.max(14, top * 0.24);
    const a = eng.team[me].tiles, b = eng.team[foe].tiles;
    const p = (a + b) ? a / (a + b) : 0.5;
    c.save();
    this.rrect(bx, by, bw, bh, bh / 2); c.clip();
    c.fillStyle = teamCol(foe); c.fillRect(bx, by, bw, bh);
    c.fillStyle = teamCol(me); c.fillRect(bx, by, bw * p, bh);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(bx, by, bw, bh * 0.4);
    c.restore();
    this.rrect(bx, by, bw, bh, bh / 2); c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke();
    this.text(String(a), bx + 8, by + bh / 2 + 1, bh * 0.75, '#fff', 'left', 900, 'rgba(0,0,0,0.4)');
    this.text(String(b), bx + bw - 8, by + bh / 2 + 1, bh * 0.75, '#fff', 'right', 900, 'rgba(0,0,0,0.4)');

    // bottom panel
    const bt = H - this.hudBot;
    c.fillStyle = 'rgba(15,23,42,0.72)';
    c.fillRect(0, bt, W, this.hudBot);
    const gy = bt + this.hudBot / 2;
    const gfs = Math.max(18, this.hudBot * 0.34);
    const gold = eng.team[me].gold;
    const gw = gfs * 4.2;
    if (this.lastGold !== null && gold < this.lastGold) this.goldPop = Math.min(this.goldPop, -0.5);
    this.lastGold = gold;
    const gx = W / 2 - gw / 2 + (this.goldShake > 0 ? Math.sin(this.goldShake * 60) * this.goldShake * 22 : 0);
    this.goldAt = { x: W / 2 - gw / 2 + gfs * 0.8, y: gy };
    c.fillStyle = 'rgba(0,0,0,0.45)'; this.rrect(gx, gy - gfs * 0.75, gw, gfs * 1.5, gfs * 0.75); c.fill();
    if (this.ui.goldFlash > 0) { c.strokeStyle = '#f87171'; c.lineWidth = 3; c.stroke(); }
    const pk = this.goldPop > 0 ? 1 + 0.35 * this.goldPop : this.goldPop < 0 ? 1 + 0.15 * this.goldPop : 1;
    this.drawCoin(gx + gfs * 0.8, gy, gfs * 0.52 * pk);
    this.text(String(gold), gx + gfs * 1.55, gy + 1, gfs * pk, this.goldShake > 0 ? '#fca5a5' : '#fde047', 'left', 900);

    // quest (left)
    const qp = eng.questOf(me);
    if (qp) {
      const qx = 8, qw = Math.min(W / 2 - gw / 2 - 16, 240);
      if (qw > 90) {
        const qfs = Math.max(11, Math.min(15, qw / 15));
        const flash = eng.tick - eng.team[me].questT < TICK_RATE * 1.2;
        c.fillStyle = flash ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.12)';
        this.rrect(qx, gy - qfs * 1.9, qw, qfs * 3.8, 10); c.fill();
        this.text(T('quest_' + qp.q.id, { n: qp.q.need }), qx + 10, gy - qfs * 0.75, qfs, '#ffffff', 'left', 800);
        const pbw = qw - 20 - qfs * 3.5;
        c.fillStyle = 'rgba(0,0,0,0.4)'; this.rrect(qx + 10, gy + qfs * 0.35, pbw, qfs * 0.8, qfs * 0.4); c.fill();
        c.fillStyle = '#4ade80'; this.rrect(qx + 10, gy + qfs * 0.35, Math.max(qfs * 0.8, pbw * qp.prog / qp.q.need), qfs * 0.8, qfs * 0.4); c.fill();
        this.text(qp.prog + '/' + qp.q.need, qx + 10 + pbw / 2, gy + qfs * 0.77, qfs * 0.7, '#fff', 'center', 800);
        this.drawCoin(qx + qw - qfs * 2.6, gy + qfs * 0.75, qfs * 0.45);
        this.text(String(qp.q.reward), qx + qw - qfs * 2.0, gy + qfs * 0.78, qfs * 0.85, '#fde047', 'left', 900);
      }
    }
    // online status, just above the bottom panel on the right (the buttons sit inside the panel)
    if (this.status) {
      const sfs = Math.max(11, Math.min(14, W / 40));
      this.text(this.status.text, W - 10, bt - sfs * 0.9, sfs, this.status.color || '#cbd5e1', 'right', 800, 'rgba(0,0,0,0.5)');
    }
  }

  drawOverlays(eng, dt) {
    const c = this.ctx;
    const W = this.W, H = this.H;
    const play = eng.phase === PHASE_PLAY;
    this.drawJuice(dt);
    if (this.guide && play) this.drawGuide(this.tv[this.guide.i]);
    const ph = eng.heroes[this.local];
    if (ph.dead && play) {
      this.text(T('respawn', { s: Math.ceil(ph.respT / TICK_RATE) }), W / 2, H - this.hudBot - 30, 20, '#ffffff', 'center', 900, 'rgba(0,0,0,0.7)');
    }
    if (this.hint && play) {
      const fs = Math.min(18, W / 26);
      c.font = fontW(800) + ' ' + fs + 'px ' + FONT_STACK;
      const tw = c.measureText(this.hint).width + 30;
      const y = H - this.hudBot - 34 - (ph.dead ? 36 : 0);
      const a = 0.85 + 0.15 * Math.sin(this.time * 5);
      c.fillStyle = `rgba(250,204,21,${a})`; this.rrect(W / 2 - tw / 2, y - fs, tw, fs * 2, fs); c.fill();
      this.text(this.hint, W / 2, y + 1, fs, '#1f2937', 'center', 900);
    }
    // card for a barracks / mystery roll
    if (this.card) {
      const cd = this.card;
      cd.t += dt;
      const k = Math.min(1, cd.t * 5) * Math.min(1, (cd.life - cd.t) * 4);
      if (cd.t >= cd.life) this.card = null;
      else {
        const cw = 200, ch = 92;
        const x = W / 2 - cw / 2, y = this.hudTop + 14 - (1 - k) * 30;
        c.globalAlpha = Math.max(0, k);
        c.fillStyle = 'rgba(15,23,42,0.92)'; this.rrect(x, y, cw, ch, 14); c.fill();
        c.strokeStyle = RARITY_COLOR[cd.rarity]; c.lineWidth = 3; c.stroke();
        c.save();
        c.translate(x + 46, y + ch / 2 + 6); c.scale(34, 34);
        const def = UNITS[cd.unit];
        this.drawUnitSprite({ type: cd.unit, team: this.local, x: 0, y: 0, s: Math.min(0.5, def.size / FP * 1.2), face: 1,
          lunge: false, bob: 0, flash: 0, hp: 1, id: 1, rarity: def.rarity });
        c.restore();
        this.text(T('u_' + cd.unit), x + 88, y + 34, 17, '#ffffff', 'left', 900);
        this.text(T('r_' + RARITY[cd.rarity]), x + 88, y + 60, 14, RARITY_COLOR[cd.rarity], 'left', 900);
        c.globalAlpha = 1;
      }
    }
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter((b) => b.t < b.life);
    for (const b of this.banners) {
      const k = b.t / b.life;
      const pop = b.t < 0.18 ? 0.6 + b.t / 0.18 * 0.55 : b.t < 0.3 ? 1.15 - (b.t - 0.18) / 0.12 * 0.15 : 1;
      c.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      const fs = (b.size || 48) * pop * Math.min(1, W / 420);
      if (b.band) {
        c.fillStyle = b.band; c.fillRect(0, H * (b.y || 0.42) - fs * 0.85, W, fs * 1.7);
      }
      this.text(b.text, W / 2, H * (b.y || 0.42), fs, b.color || '#ffffff', 'center', 900, b.stroke || 'rgba(0,0,0,0.65)');
      c.globalAlpha = 1;
    }
  }

  // ---------- juice (after Potion Siege's fly.ts / floaters and Holy Kicker's merged numbers) ----------
  /** `n` coins fly from a view (or, with screen: true, screen) point to the gold pill; it pops as each lands. */
  coinFly(x, y, n, screen) {
    const p = screen ? { x, y } : this.worldToScreen(x, y);
    for (let i = 0; i < n; i++) {
      this.coins.push({ x0: p.x + (Math.random() - 0.5) * 16, y0: p.y + (Math.random() - 0.5) * 10,
        bend: (Math.random() - 0.5) * 140, t: -i * 0.07, life: 0.55 + Math.random() * 0.12 });
    }
  }

  /** A damage number over a hero or building; hits on the same target within 0.4 s add up and re-pop. */
  damageNumber(id, x, y, amount, color) {
    const d = this.dmg.get(id);
    if (d && d.t < 0.4) { d.v += amount; d.t = 0; d.x = x; d.y = y; d.pop = 1; return; }
    this.dmg.set(id, { v: amount, x, y, t: 0, pop: 1, color });
  }

  drawJuice(dt) {
    const c = this.ctx;
    this.goldPop = this.goldPop > 0 ? Math.max(0, this.goldPop - dt * 5) : Math.min(0, Math.max(-0.5, this.goldPop + dt * 4));
    if (this.goldShake > 0) this.goldShake = Math.max(0, this.goldShake - dt);
    for (const [id, d] of this.dmg) {
      d.t += dt; d.pop = Math.max(0, d.pop - dt * 6);
      if (d.t > 0.9) { this.dmg.delete(id); continue; }
      const p = this.worldToScreen(d.x, d.y - 0.9 - d.t * 0.7);
      c.globalAlpha = d.t > 0.6 ? (0.9 - d.t) / 0.3 : 1;
      this.text(String(Math.round(d.v)), p.x, p.y, Math.max(14, this.scale * 0.5) * (1 + 0.4 * d.pop), d.color, 'center', 900, 'rgba(0,0,0,0.7)');
    }
    c.globalAlpha = 1;
    // flying coins: quadratic bezier with a sideways bend, ease-in so they snap into the pill
    const to = this.goldAt;
    if (!to) { this.coins.length = 0; return; }
    const r = Math.max(6, this.hudBot * 0.09);
    for (const k of this.coins) {
      k.t += dt;
      if (k.t < 0) continue;
      const u = Math.min(1, k.t / k.life), e = u * u;
      const mx = (k.x0 + to.x) / 2 + k.bend, my = Math.min(k.y0, to.y) - 60;
      const x = (1 - e) * (1 - e) * k.x0 + 2 * (1 - e) * e * mx + e * e * to.x;
      const y = (1 - e) * (1 - e) * k.y0 + 2 * (1 - e) * e * my + e * e * to.y;
      this.drawCoin(x, y, r * (1 + 0.3 * Math.sin(u * Math.PI)));
      if (u >= 1) { k.done = true; this.goldPop = 1; }
    }
    this.coins = this.coins.filter((k) => !k.done);
  }

  /** Tutorial hand (after Holy Kicker's onboarding finger): taps the view point, with a ring on each tap. */
  drawGuide(at) {
    if (!at) return;
    const c = this.ctx;
    const p = this.worldToScreen(at.x, at.y);
    const u = (this.time * 1.1) % 1;
    const press = u < 0.25 ? u / 0.25 : u < 0.4 ? 1 : Math.max(0, 1 - (u - 0.4) / 0.3);
    const s = Math.max(20, this.scale * 0.7);
    if (u > 0.25 && u < 0.85) {
      const k = (u - 0.25) / 0.6;
      c.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; c.lineWidth = 3;
      c.beginPath(); c.arc(p.x, p.y, s * (0.3 + k * 0.9), 0, Math.PI * 2); c.stroke();
    }
    c.save();
    c.translate(p.x + s * 0.15, p.y + s * (0.15 + 0.45 * (1 - press)));
    c.rotate(-0.35);
    c.lineJoin = 'round'; c.lineWidth = Math.max(2, s * 0.09); c.strokeStyle = '#1f2937'; c.fillStyle = '#ffffff';
    this.rrect(-s * 0.42, s * 0.55, s * 0.84, s * 0.85, s * 0.3); c.fill(); c.stroke();
    this.rrect(-s * 0.15, 0, s * 0.3, s * 0.95, s * 0.15); c.fill(); c.stroke();
    c.fillStyle = '#ffffff'; c.fillRect(-s * 0.1, s * 0.6, s * 0.2, s * 0.3);
    c.restore();
  }

  banner(text, opts) { this.banners.push(Object.assign({ text, t: 0, life: 1.4 }, opts || {})); }
}
