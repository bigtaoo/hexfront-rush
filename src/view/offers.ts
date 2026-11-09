// The local team's offers as cards standing on their tiles: icon and price on the face, a gold rim
// that breathes while it is affordable. A card the player just tapped turns edge-on (it flips)
// and fades; the building, or the mystery result, comes from the sim. A card that appears (the
// tiles around a flipped one open up) turns face-up from edge-on and drops into place. The card
// face is a shared context per offer and affordability; the price is a Text sized for the
// current zoom.

import { Container, Graphics, type Text } from 'pixi.js';
import { OFFER_LIST } from '../sim/rules';
import { coin, offerIcon } from './bodies';
import { inView, type Frame } from './frame';
import { label, liveGraphics, setLabel, sharedCtx, type Pen } from './pen';

const W = 0.9, H = 1.12, R = 0.16;
/** How long a new card takes to turn face-up (s). */
const REVEAL = 0.35;

function cardCtx(key: string, afford: boolean) {
  return sharedCtx(`card|${key}|${afford ? 1 : 0}`, (p) => {
    p.rrect(-W / 2 + 0.05, -H / 2 + 0.09, W, H, R, 'rgba(0,0,0,0.28)');
    p.rrect(-W / 2, -H / 2, W, H, R, afford ? '#fff7e0' : '#cbd5e1', afford ? null : '#64748b', 0.06);
    p.rrect(-W / 2 + 0.08, -H / 2 + 0.08, W - 0.16, H * 0.56, R * 0.6, afford ? 'rgba(251,191,36,0.22)' : 'rgba(100,116,139,0.18)');
    p.a = afford ? 1 : 0.7;
    offerIcon(p, key, 0, -0.15, 0.3);
    p.a = 1;
    coin(p, -0.2, 0.36, 0.1);
  });
}

interface CardView {
  root: Container;
  body: Graphics;
  rim: Graphics;
  rimPen: Pen;
  cost: Text;
  mark: Text | null;
  seen: number;
}

export class OfferLayer {
  readonly root = new Container({ sortableChildren: true });
  /** tile -> seconds since the local player flipped that card */
  readonly flips = new Map<number, number>();
  /** tile -> the face of a card being flipped, so a spent card (a mystery) finishes its flip */
  private faces = new Map<number, number>();
  /** tile -> seconds since its card appeared (whether on screen or not) */
  private reveals = new Map<number, number>();
  /** each tile's offer last frame, to see cards appear */
  private last: number[] = [];
  private cards = new Map<number, CardView>();
  private frame = 0;

  reset(): void {
    this.flips.clear();
    this.faces.clear();
    this.reveals.clear();
    this.last = [];
    for (const c of this.cards.values()) c.root.destroy({ children: true });
    this.cards.clear();
  }

  draw(f: Frame): void {
    const eng = f.eng, cam = f.cam;
    const Tm = eng.team[f.local]!;
    for (const [ti, t] of this.flips) {
      const nt = t + f.dt;
      if (nt > 0.7 || eng.tiles[ti]!.bld) {
        this.flips.delete(ti);
        this.faces.delete(ti);
      } else this.flips.set(ti, nt);
    }
    for (const [ti, t] of this.reveals) {
      const nt = t + f.dt;
      if (nt >= REVEAL) this.reveals.delete(ti);
      else this.reveals.set(ti, nt);
    }
    const last = this.last;
    const n = ++this.frame;
    const zoom = cam.scale;
    for (let i = 0; i < Tm.offers.length; i++) {
      let oi = Tm.offers[i]!;
      const was = last[i] ?? -1;
      last[i] = oi;
      if (oi >= 0 && was < 0) this.reveals.set(i, 0);
      if (this.flips.has(i)) {
        if (oi >= 0 && !this.faces.has(i)) this.faces.set(i, oi);
        else if (oi < 0) oi = this.faces.get(i) ?? -1;
      }
      if (oi < 0) continue;
      const v = cam.tv[i]!;
      if (!inView(f.vis, v.x, v.y)) continue;
      const off = OFFER_LIST[oi]!;
      const afford = Tm.gold >= off.cost;
      const c = this.card(i);
      c.seen = n;
      const ft = this.flips.get(i);
      let sx = 1, lift = 0, alpha = 1;
      const rt = this.reveals.get(i);
      if (ft !== undefined) {
        sx = Math.max(0.04, Math.abs(Math.cos((Math.min(1, ft / 0.25) * Math.PI) / 2)));
        lift = Math.min(1, ft / 0.12) * 0.18;
        alpha = ft > 0.25 ? Math.max(0.25, 1 - (ft - 0.25) * 3) : 1;
      } else if (rt !== undefined) {
        const k = rt / REVEAL;
        sx = Math.max(0.04, Math.sin((k * Math.PI) / 2));
        lift = (1 - k) * 0.3;
        alpha = Math.min(1, 0.3 + k);
      }
      c.root.position.set(v.x, v.y - 0.1 - lift);
      c.root.zIndex = v.y;
      c.root.scale.set(sx, 1);
      c.root.alpha = alpha;
      const ctx = cardCtx(off.key, afford);
      if (c.body.context !== ctx) c.body.context = ctx;
      setLabel(c.cost, String(off.cost), { size: 0.3 * zoom, color: afford ? '#78350f' : '#dc2626', weight: 900 });
      c.cost.scale.set(1 / zoom);
      if (off.key === 'myst') {
        if (!c.mark) {
          c.mark = label('?', { size: 0.39 * zoom, color: '#ffffff', weight: 900 });
          c.mark.position.set(0, -0.15 + 0.3 * 0.05);
          c.root.addChild(c.mark);
        }
        setLabel(c.mark, '?', { size: 0.39 * zoom, color: '#ffffff', weight: 900 });
        c.mark.scale.set(1 / zoom);
        c.mark.alpha = afford ? 1 : 0.7;
        c.mark.visible = true;
      } else if (c.mark) c.mark.visible = false;
      // the breathing gold rim
      const p = c.rimPen.clear();
      if (afford) {
        const pulse = 0.5 + 0.5 * Math.sin(f.time * 4 + i * 0.7);
        p.g.beginPath();
        p.g.roundRect(-W / 2, -H / 2, W, H, R);
        p.stroke(`rgba(245,158,11,${(0.7 + 0.3 * pulse).toFixed(3)})`, 0.08 + 0.03 * pulse);
      }
    }
    for (const [i, c] of this.cards) {
      if (c.seen === n) continue;
      c.root.destroy({ children: true });
      this.cards.delete(i);
    }
  }

  private card(i: number): CardView {
    let c = this.cards.get(i);
    if (c) return c;
    const root = new Container();
    const body = new Graphics();
    const { g: rim, p: rimPen } = liveGraphics();
    const cost = label('', { size: 10, color: '#78350f', weight: 900 });
    cost.position.set(0.06, 0.37);
    root.addChild(body, rim, cost);
    this.root.addChild(root);
    c = { root, body, rim, rimPen, cost, mark: null, seen: 0 };
    this.cards.set(i, c);
    return c;
  }
}
