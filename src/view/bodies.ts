// The small marks drawn in code around the pictures (art.ts): ground shadows, coins, coin timers
// and hp bars, drawn through a Pen at the origin. Still ones go into shared contexts (sharedCtx);
// timers and bars are drawn into per-view Graphics when they change.

import type { GraphicsContext } from 'pixi.js';
import { Pen, sharedCtx } from './pen';

export function shadow(p: Pen, x: number, y: number, rx: number): void {
  p.ellipse(x, y, rx, rx * 0.36, 'rgba(40,24,8,0.26)');
}

export function shadowCtx(rx: number): GraphicsContext {
  return sharedCtx(`shadow|${rx.toFixed(3)}`, (p) => shadow(p, 0, 0, rx));
}

export function coin(p: Pen, x: number, y: number, r: number): void {
  p.circle(x, y, r, '#fbbf24', '#92400e', r * 0.18);
  p.circle(x, y, r * 0.55, null, '#d97706', r * 0.12);
}

/** A coin timer: fills up as the next payout comes. */
export function incomeRing(p: Pen, x: number, y: number, r: number, k: number): void {
  k = Math.max(0, Math.min(1, k));
  p.circle(x, y, r * 0.55, '#fbbf24', '#92400e', 0.03);
  p.circle(x, y, r, null, 'rgba(24,16,8,0.45)', 0.09);
  if (k > 0.001) p.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2, '#fde047', 0.09);
}

/** An hp bar centred on x, its top at y: green for the local side, red for the rival. */
export function hpBar(p: Pen, x: number, y: number, w: number, k: number, own: boolean): void {
  p.rrect(x - w / 2 - 0.04, y - 0.04, w + 0.08, 0.18, 0.06, 'rgba(24,16,8,0.75)');
  if (k > 0) p.rrect(x - w / 2, y, Math.max(0.06, w * k), 0.1, 0.04, own ? '#4ade80' : '#f87171');
}
