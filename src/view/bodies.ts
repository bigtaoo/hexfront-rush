// The shapes of everything on the field, drawn through a Pen at the origin (ported one to one
// from the old canvas renderer). Still shapes go into shared contexts (sharedCtx) keyed by what
// changes their look, so a hundred troops of a kind share one; moving parts (flags, timers, hp
// bars, the drake's wings, the guard) are drawn into per-view Graphics each frame.

import type { GraphicsContext } from 'pixi.js';
import type { Obstacle } from '../sim/map';
import { RARITY_COLOR, type BuildingType, type UnitKey } from '../sim/rules';
import { Pen, sharedCtx } from './pen';
import { teamCol, teamDark } from './viewConst';

export function shadow(p: Pen, x: number, y: number, rx: number): void {
  p.ellipse(x, y, rx, rx * 0.38, 'rgba(0,0,0,0.22)');
}

export function eyes(p: Pen, x: number, y: number, s: number, face: number): void {
  if (s <= 0) return;
  const ex = face * s * 0.25;
  p.circle(x - s * 0.28 + ex, y, s * 0.2, '#ffffff');
  p.circle(x + s * 0.28 + ex, y, s * 0.2, '#ffffff');
  p.circle(x - s * 0.24 + ex * 1.3, y + s * 0.02, s * 0.1, '#111827');
  p.circle(x + s * 0.32 + ex * 1.3, y + s * 0.02, s * 0.1, '#111827');
}

export function coin(p: Pen, x: number, y: number, r: number): void {
  p.circle(x, y, r, '#fbbf24', '#92400e', r * 0.18);
  p.circle(x, y, r * 0.55, null, '#d97706', r * 0.12);
}

/** A coin timer: fills up as the next payout comes. */
export function incomeRing(p: Pen, x: number, y: number, r: number, k: number): void {
  k = Math.max(0, Math.min(1, k));
  p.circle(x, y, r * 0.55, '#fbbf24', '#92400e', 0.03);
  p.circle(x, y, r, null, 'rgba(0,0,0,0.35)', 0.09);
  if (k > 0.001) p.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2, '#fde047', 0.09);
}

export function hpBar(p: Pen, x: number, y: number, w: number, k: number, own: boolean): void {
  p.rect(x - w / 2 - 0.03, y - 0.03, w + 0.06, 0.16, 'rgba(0,0,0,0.55)');
  if (k > 0) p.rect(x - w / 2, y, w * k, 0.1, own ? '#4ade80' : '#f87171');
}

// ---------- obstacles ----------
/** The look variant an obstacle tile shows (from its deco roll). */
export function obstacleLook(kind: Obstacle, deco: number): number {
  const v = deco / 1000;
  return kind === 'rock' ? Math.round(v * 4) / 4 : kind === 'cactus' ? (v > 0.5 ? 1 : 0) : 0;
}
export function obstacleCtx(kind: Obstacle, v: number): GraphicsContext {
  return sharedCtx(`o|${kind}|${v}`, (p) => obstacleBody(p, kind, v));
}
function obstacleBody(p: Pen, kind: Obstacle, v: number): void {
  switch (kind) {
    case 'tree':
      p.ellipse(0, 0.35, 0.55, 0.2, 'rgba(0,0,0,0.18)');
      p.rect(-0.09, -0.1, 0.18, 0.45, '#7c4a24');
      p.circle(-0.25, -0.35, 0.38, '#3f8f3a');
      p.circle(0.25, -0.4, 0.36, '#4aa244');
      p.circle(0, -0.68, 0.4, '#5cb653');
      p.circle(-0.1, -0.78, 0.14, 'rgba(255,255,255,0.25)');
      break;
    case 'pine':
      p.ellipse(0, 0.35, 0.5, 0.18, 'rgba(0,0,0,0.18)');
      p.rect(-0.08, 0.05, 0.16, 0.3, '#6b4423');
      for (let k = 0; k < 3; k++) {
        const yy = 0.1 - k * 0.32, w = 0.58 - k * 0.14;
        p.poly([-w, yy, w, yy, 0, yy - 0.5], k % 2 ? '#2f6d5a' : '#357a64');
        p.poly([-w * 0.6, yy - 0.12, w * 0.2, yy - 0.12, 0, yy - 0.5], '#f1f5f9');
      }
      break;
    case 'rock':
      p.ellipse(0, 0.3, 0.6, 0.2, 'rgba(0,0,0,0.2)');
      p.poly([-0.6, 0.3, -0.45, -0.25, -0.05, -0.55 - v * 0.15, 0.4, -0.3, 0.6, 0.3], '#8b8f98');
      p.poly([-0.05, -0.55 - v * 0.15, 0.4, -0.3, 0.6, 0.3, 0.05, 0.3], '#6b7280');
      break;
    case 'cactus':
      p.ellipse(0, 0.35, 0.45, 0.16, 'rgba(0,0,0,0.18)');
      p.rrect(-0.16, -0.75, 0.32, 1.1, 0.16, '#4d9a4a');
      p.rrect(-0.48, -0.45, 0.2, 0.45, 0.1, '#4d9a4a');
      p.rrect(-0.48, -0.1, 0.38, 0.18, 0.09, '#4d9a4a');
      p.rrect(0.28, -0.6, 0.2, 0.45, 0.1, '#4d9a4a');
      p.rrect(0.1, -0.25, 0.38, 0.18, 0.09, '#4d9a4a');
      if (v > 0.5) p.circle(0, -0.8, 0.1, '#f472b6');
      break;
    case 'ice':
      p.ellipse(0, 0.3, 0.5, 0.18, 'rgba(0,0,0,0.15)');
      for (const [dx, h, w] of [[-0.25, 0.7, 0.2], [0.1, 1.0, 0.25], [0.35, 0.6, 0.18]] as const) {
        p.poly([dx - w, 0.3, dx, 0.3 - h, dx + w, 0.3], '#a5d8f3');
        p.poly([dx, 0.3 - h, dx + w, 0.3, dx, 0.3], '#7cc3e8');
      }
      break;
  }
}

// ---------- buildings ----------
export function buildingCtx(type: BuildingType, team: number, rarity: number): GraphicsContext {
  return sharedCtx(`b|${type}|${team}|${rarity}`, (p) => buildingBody(p, type, team, rarity));
}
function buildingBody(p: Pen, type: BuildingType, team: number, rarity: number): void {
  const tc = teamCol(team), td = teamDark(team);
  shadow(p, 0, 0.3, 0.62);
  switch (type) {
    case 'base':
      p.rrect(-0.62, -0.55, 1.24, 0.85, 0.08, '#e5e7eb');
      p.rect(-0.62, 0.05, 1.24, 0.25, '#cbd5e1');
      for (const dx of [-0.62, 0.62]) {
        p.rect(dx - 0.2, -0.85, 0.4, 1.15, '#d1d5db');
        p.poly([dx - 0.27, -0.85, dx, -1.25, dx + 0.27, -0.85], tc);
      }
      p.poly([-0.45, -0.55, 0, -1.0, 0.45, -0.55], td);
      p.rrect(-0.18, -0.2, 0.36, 0.5, 0.15, '#5b3a1e');
      p.line([0, -1.0, 0, -1.45], '#374151', 0.05);
      break;
    case 'mine':
      p.g.beginPath();
      p.g.moveTo(-0.6, 0.3);
      p.g.quadraticCurveTo(-0.5, -0.6, 0, -0.62);
      p.g.quadraticCurveTo(0.5, -0.6, 0.6, 0.3);
      p.g.closePath();
      p.fill('#78716c');
      p.rrect(-0.22, -0.15, 0.44, 0.45, 0.2, '#292524');
      p.line([-0.26, 0.3, -0.26, -0.18, 0.26, -0.18, 0.26, 0.3], '#a16207', 0.07);
      p.circle(-0.36, -0.15, 0.1, '#fde047');
      p.circle(0.35, -0.3, 0.08, '#fde047');
      p.circle(0.1, -0.5, 0.07, '#fde047');
      p.rect(-0.03, -0.95, 0.06, 0.35, tc);
      p.poly([0.03, -0.95, 0.3, -0.86, 0.03, -0.77], tc);
      break;
    case 'tower':
      p.rect(-0.3, -0.8, 0.6, 1.1, '#9ca3af');
      p.rect(0.05, -0.8, 0.25, 1.1, '#6b7280');
      p.rect(-0.42, -1.05, 0.84, 0.3, '#d1d5db');
      for (let k = 0; k < 3; k++) p.rect(-0.42 + k * 0.32, -1.2, 0.2, 0.18, '#d1d5db');
      p.rect(-0.42, -0.83, 0.84, 0.08, tc);
      p.rrect(-0.08, -0.55, 0.16, 0.26, 0.08, '#1f2937');
      break;
    case 'barracks':
      p.rect(-0.6, -0.35, 1.2, 0.65, '#a16207');
      p.rect(0.2, -0.35, 0.4, 0.65, '#854d0e');
      p.poly([-0.72, -0.3, 0, -0.95, 0.72, -0.3], tc);
      p.poly([0, -0.95, 0.72, -0.3, 0.3, -0.3], td);
      p.rrect(-0.2, -0.15, 0.4, 0.45, 0.18, '#3f2a14');
      p.poly([0, -0.78, 0.14, -0.62, 0, -0.46, -0.14, -0.62], RARITY_COLOR[rarity] ?? '#9aa5b1', '#111827', 0.04);
      break;
  }
}

export function rubbleCtx(): GraphicsContext {
  return sharedCtx('rubble', (p) => {
    for (const [dx, dy, r] of [[-0.3, 0.1, 0.16], [0.1, 0.2, 0.2], [0.32, 0.0, 0.13], [-0.05, -0.12, 0.14]] as const) {
      p.circle(dx, dy, r, '#78716c', '#57534e', 0.04);
    }
  });
}

/** The chest's box, without its shadow (the shadow stays on the ground while the box bobs). */
export function chestCtx(): GraphicsContext {
  return sharedCtx('chest', (p) => {
    p.rrect(-0.36, -0.2, 0.72, 0.45, 0.06, '#92400e');
    p.rrect(-0.38, -0.4, 0.76, 0.25, 0.1, '#b45309');
    p.rect(-0.38, -0.18, 0.76, 0.06, '#fbbf24');
    p.rect(-0.05, -0.4, 0.1, 0.65, '#fbbf24');
    p.circle(0, -0.1, 0.07, '#fde047');
  });
}
export function shadowCtx(rx: number): GraphicsContext {
  return sharedCtx(`shadow|${rx.toFixed(3)}`, (p) => shadow(p, 0, 0, rx));
}

// ---------- troops ----------
/** A troop's body and eyes at the origin, still (every kind but the drake). */
export function unitCtx(type: UnitKey, team: number, s: number, face: number): GraphicsContext {
  return sharedCtx(`u|${type}|${team}|${face}|${s.toFixed(3)}`, (p) => unitBody(p, type, team, s, face, 0, 0, 0));
}

/** A troop's body and eyes at (x, y). `time` and `id` only move the drake's wings. */
export function unitBody(p: Pen, type: UnitKey, team: number, s: number, face: number, x: number, y: number, time: number, id = 1): void {
  const tc = teamCol(team), td = teamDark(team);
  switch (type) {
    case 'militia':
      p.circle(x, y, s, tc, td, 0.05);
      p.line([x + face * s * 1.1, y + s * 0.8, x + face * s * 1.1, y - s * 1.4], '#78350f', 0.06);
      p.poly([x + face * s * 1.1, y - s * 1.75, x + face * s * 1.25, y - s * 1.35, x + face * s * 0.95, y - s * 1.35], '#d1d5db');
      break;
    case 'slinger':
      p.circle(x, y, s, tc, td, 0.05);
      p.pie(x, y - s * 0.4, s * 0.95, Math.PI, Math.PI * 2, '#a16207');
      p.circle(x + face * s * 1.1, y + s * 0.2, s * 0.25, '#9ca3af');
      break;
    case 'shield':
      p.circle(x, y, s, tc, td, 0.05);
      p.pie(x, y - s * 0.35, s * 0.95, Math.PI, Math.PI * 2, '#9ca3af');
      p.rrect(x + face * s * 0.55 - s * 0.35, y - s * 0.6, s * 0.7, s * 1.3, s * 0.2, td, '#e5e7eb', 0.04);
      break;
    case 'bowman':
      p.circle(x, y, s, tc, td, 0.05);
      p.poly([x - s, y - s * 0.3, x, y - s * 1.5, x + s, y - s * 0.3], '#166534');
      p.arc(x + face * s * 0.9, y, s * 0.8, -Math.PI / 2, Math.PI / 2, '#78350f', 0.05, face < 0);
      break;
    case 'ogre':
      p.circle(x, y, s, '#84a35a', td, 0.07);
      p.rect(x - s, y + s * 0.2, s * 2, s * 0.35, tc);
      p.poly([x - s * 0.7, y - s * 0.6, x - s * 0.95, y - s * 1.2, x - s * 0.4, y - s * 0.8], '#f5f5f4');
      p.poly([x + s * 0.7, y - s * 0.6, x + s * 0.95, y - s * 1.2, x + s * 0.4, y - s * 0.8], '#f5f5f4');
      p.line([x + face * s * 0.9, y + s * 0.6, x + face * s * 1.3, y - s * 0.5], '#57534e', 0.1);
      break;
    case 'adept':
      p.circle(x, y, s, tc, td, 0.05);
      p.poly([x - s * 1.05, y - s * 0.3, x + face * s * 0.3, y - s * 2.0, x + s * 1.05, y - s * 0.3], '#4c1d95');
      break;
    case 'colossus':
      p.rrect(x - s, y - s, s * 2, s * 1.9, s * 0.45, '#9ca3af', '#4b5563', 0.07);
      p.rect(x - s, y + s * 0.15, s * 2, s * 0.3, tc);
      p.circle(x - s * 0.35 + face * s * 0.15, y - s * 0.4, s * 0.15, '#fde047');
      p.circle(x + s * 0.35 + face * s * 0.15, y - s * 0.4, s * 0.15, '#fde047');
      p.circle(x - s * 0.7, y - s * 0.85, s * 0.18, '#6b7280');
      break;
    case 'drake': {
      const flap = Math.sin(time * 12 + id) * 0.25;
      p.poly([x - s * 0.2, y - s * 0.2, x - s * 1.4, y - s * (0.9 + flap), x - s * 0.6, y + s * 0.2], td);
      p.poly([x + s * 0.2, y - s * 0.2, x + s * 1.4, y - s * (0.9 + flap), x + s * 0.6, y + s * 0.2], td);
      p.ellipse(x, y, s * 0.9, s * 0.7, '#f97316');
      p.ellipse(x, y + s * 0.25, s * 0.6, s * 0.35, tc);
      p.circle(x + face * s * 0.8, y - s * 0.45, s * 0.42, '#fb923c');
      eyes(p, x + face * s * 0.85, y - s * 0.5, s * 0.5, face);
      return;
    }
  }
  eyes(p, x, y - s * 0.05, s * (type === 'colossus' ? 0 : 0.85), face);
}

/** The castle guard: a knight with a tall shield and a spear, a size between a castle and a troop.
 *  Drawn at its foot point (0, 0) with `bob` lifting the body. */
export function guardBody(p: Pen, team: number, face: number, bob: number): void {
  const x = 0, y = -bob;
  const tc = teamCol(team), td = teamDark(team);
  shadow(p, 0, 0.32, 0.45);
  p.line([x + face * 0.38, y + 0.35, x + face * 0.38, y - 0.75], '#78350f', 0.07);
  p.poly([x + face * 0.38, y - 0.98, x + face * 0.38 + 0.1, y - 0.72, x + face * 0.38 - 0.1, y - 0.72], '#e5e7eb');
  p.circle(x, y, 0.36, tc, '#0f172a', 0.05);
  p.pie(x, y - 0.08, 0.38, Math.PI, Math.PI * 2, '#9ca3af');
  p.rect(x - 0.38, y - 0.1, 0.76, 0.07, '#6b7280');
  p.ellipseRot(x - face * 0.05, y - 0.5, 0.09, 0.17, -face * 0.4, td);
  eyes(p, x, y + 0.04, 0.3, face);
  p.rrect(x - face * 0.32 - 0.16, y - 0.12, 0.32, 0.46, 0.1, td, '#fde68a', 0.04);
}

// ---------- offer icons (on the card faces) ----------
const TIER_RING = ['#d1d5db', '#38bdf8', '#c084fc'] as const;
/** An offer's icon at (x, y), size s. The mystery's '?' is a Text the card adds on top. */
export function offerIcon(p: Pen, key: string, x: number, y: number, s: number): void {
  if (key === 'mine') {
    p.circle(x - s * 0.35, y + s * 0.15, s * 0.42, '#f59e0b', '#92400e', s * 0.12);
    p.circle(x + s * 0.35, y + s * 0.15, s * 0.42, '#fbbf24', '#92400e', s * 0.12);
    p.circle(x, y - s * 0.3, s * 0.42, '#fde047', '#92400e', s * 0.12);
  } else if (key === 'tower') {
    p.poly([x, y - s * 0.9, x + s * 0.75, y - s * 0.6, x + s * 0.6, y + s * 0.4, x, y + s * 0.95, x - s * 0.6, y + s * 0.4, x - s * 0.75, y - s * 0.6], '#60a5fa', '#1e3a8a', s * 0.14);
  } else if (key === 'myst') {
    p.circle(x, y, s * 0.85, '#7c3aed', '#3b0764', s * 0.14);
  } else {
    const tier = key === 'bar1' ? 0 : key === 'bar2' ? 1 : 2;
    const ring = TIER_RING[tier]!;
    p.circle(x, y, s * 0.85, '#374151', ring, s * 0.18);
    p.line([x - s * 0.45, y + s * 0.45, x + s * 0.45, y - s * 0.45], '#f3f4f6', s * 0.16, 'round');
    p.line([x + s * 0.45, y + s * 0.45, x - s * 0.45, y - s * 0.45], '#f3f4f6', s * 0.16, 'round');
    for (let k = 0; k <= tier; k++) p.circle(x - tier * 0.22 * s + k * 0.44 * s, y + s * 1.05, s * 0.14, ring);
  }
}
