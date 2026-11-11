// A small Canvas2D-like drawing helper over a Pixi 8 GraphicsContext, so the shapes ported from the
// old canvas renderer read the same: circle(x, y, r, fill, stroke, width), rrect, poly, line...
// Colours are CSS strings; an rgba() colour carries its alpha into the fill. `a` multiplies the
// alpha of everything drawn after it is set (the canvas's globalAlpha).

import { Graphics, GraphicsContext, Text, type TextStyleOptions } from 'pixi.js';
import { fontStack, fontW } from './viewConst';

export type LineCap = 'butt' | 'round' | 'square';

export class Pen {
  /** Alpha multiplier for what is drawn next. */
  a = 1;
  constructor(readonly g: GraphicsContext) {}

  clear(): this {
    this.g.clear();
    this.a = 1;
    return this;
  }
  fill(color: string): this {
    this.g.fill(this.a === 1 ? color : { color, alpha: this.a });
    return this;
  }
  stroke(color: string, width: number, cap: LineCap = 'butt'): this {
    this.g.stroke({ color, width, alpha: this.a, cap, join: cap === 'round' ? 'round' : 'miter' });
    return this;
  }
  private paint(fill?: string | null, stroke?: string | null, lw = 0.06): this {
    if (fill) this.fill(fill);
    if (stroke) this.stroke(stroke, lw);
    return this;
  }

  circle(x: number, y: number, r: number, fill?: string | null, stroke?: string | null, lw = 0.06): this {
    this.g.beginPath();
    this.g.circle(x, y, r);
    return this.paint(fill, stroke, lw);
  }
  ellipse(x: number, y: number, rx: number, ry: number, fill?: string | null, stroke?: string | null, lw = 0.06): this {
    this.g.beginPath();
    this.g.ellipse(x, y, rx, ry);
    return this.paint(fill, stroke, lw);
  }
  /** An ellipse turned by `rot` radians (a polygon: Pixi's ellipse has no rotation). */
  ellipseRot(x: number, y: number, rx: number, ry: number, rot: number, fill: string): this {
    const pts: number[] = [];
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      pts.push(x + ex * c - ey * s, y + ex * s + ey * c);
    }
    return this.poly(pts, fill);
  }
  rect(x: number, y: number, w: number, h: number, fill?: string | null, stroke?: string | null, lw = 0.06): this {
    this.g.beginPath();
    this.g.rect(x, y, w, h);
    return this.paint(fill, stroke, lw);
  }
  rrect(x: number, y: number, w: number, h: number, r: number, fill?: string | null, stroke?: string | null, lw = 0.06): this {
    this.g.beginPath();
    this.g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
    return this.paint(fill, stroke, lw);
  }
  /** A closed polygon from flat [x0, y0, x1, y1, ...]. */
  poly(pts: number[], fill?: string | null, stroke?: string | null, lw = 0.06): this {
    this.g.beginPath();
    this.g.poly(pts, true);
    return this.paint(fill, stroke, lw);
  }
  /** An open polyline. */
  line(pts: number[], color: string, width: number, cap: LineCap = 'butt'): this {
    this.g.beginPath();
    this.g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) this.g.lineTo(pts[i]!, pts[i + 1]!);
    return this.stroke(color, width, cap);
  }
  /** An arc's outline. */
  arc(x: number, y: number, r: number, a0: number, a1: number, color: string, width: number, ccw = false): this {
    this.g.beginPath();
    this.g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
    this.g.arc(x, y, r, a0, a1, ccw);
    return this.stroke(color, width);
  }
  /** A filled half disc (a canvas arc from a0 to a1 filled straight across). */
  pie(x: number, y: number, r: number, a0: number, a1: number, fill: string): this {
    this.g.beginPath();
    this.g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
    this.g.arc(x, y, r, a0, a1);
    this.g.closePath();
    return this.fill(fill);
  }
  /** A dashed circle: dash and gap are lengths along the rim. */
  dashedCircle(x: number, y: number, r: number, dash: number, gap: number, color: string, width: number): this {
    const n = Math.max(1, Math.floor((Math.PI * 2 * r) / (dash + gap)));
    const step = (Math.PI * 2) / n, on = step * (dash / (dash + gap));
    this.g.beginPath();
    for (let k = 0; k < n; k++) {
      const a0 = k * step;
      this.g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
      this.g.arc(x, y, r, a0, a0 + on);
    }
    return this.stroke(color, width);
  }
  /** A pointy-top hex outline path, then painted. */
  hex(x: number, y: number, r: number, fill?: string | null, stroke?: string | null, lw = 0.06): this {
    return this.poly(hexPts(x, y, r), fill, stroke, lw);
  }
}

const HEX_COS: number[] = [], HEX_SIN: number[] = [];
for (let k = 0; k < 6; k++) {
  const a = (Math.PI / 180) * (60 * k - 30);
  HEX_COS.push(Math.cos(a));
  HEX_SIN.push(Math.sin(a));
}
export function hexPts(x: number, y: number, r: number): number[] {
  const pts: number[] = [];
  for (let k = 0; k < 6; k++) pts.push(x + HEX_COS[k]! * r, y + HEX_SIN[k]! * r);
  return pts;
}

/** A Graphics redrawn through a pen (what liveGraphics makes). */
export type Live = { g: Graphics; p: Pen };

/** A Graphics redrawn through a pen: the Graphics owns the context, so destroying it frees both. */
export function liveGraphics(): Live {
  const g = new Graphics();
  return { g, p: new Pen(g.context) };
}

// ---------- shared static contexts ----------
const shared = new Map<string, GraphicsContext>();
/** A context drawn once and shared by every Graphics that shows it (keyed by what it draws). */
export function sharedCtx(key: string, draw: (p: Pen) => void): GraphicsContext {
  let ctx = shared.get(key);
  if (!ctx) {
    ctx = new GraphicsContext();
    draw(new Pen(ctx));
    shared.set(key, ctx);
  }
  return ctx;
}

// ---------- text ----------
export interface LabelOpts {
  size: number;
  color: string;
  weight?: number;
  stroke?: string;
  align?: 'left' | 'center' | 'right';
}
export function labelStyle(o: LabelOpts): TextStyleOptions {
  return {
    fontFamily: fontStack(),
    fontSize: o.size,
    fill: o.color,
    fontWeight: fontW(o.weight ?? 800),
    stroke: o.stroke ? { color: o.stroke, width: o.size * 0.22, join: 'round' } : undefined,
    align: o.align ?? 'center',
    padding: Math.ceil(o.size * 0.15),
  };
}
/** A label anchored at its left, centre or right middle (the canvas's textBaseline = middle). */
export function label(text: string, o: LabelOpts): Text {
  const t = new Text({ text, style: labelStyle(o) });
  t.anchor.set(o.align === 'left' ? 0 : o.align === 'right' ? 1 : 0.5, 0.5);
  return t;
}
/** Restyle a label only when something changed (Pixi re-rasterises a Text on every style write). */
export function setLabel(t: Text, text: string, o: LabelOpts): void {
  const key = `${o.size.toFixed(2)}|${o.color}|${o.weight ?? 800}|${o.stroke ?? ''}|${o.align ?? 'center'}`;
  const tt = t as Text & { _lk?: string };
  if (tt._lk !== key) {
    tt._lk = key;
    t.style = labelStyle(o);
    t.anchor.set(o.align === 'left' ? 0 : o.align === 'right' ? 1 : 0.5, 0.5);
  }
  if (t.text !== text) t.text = text;
}
