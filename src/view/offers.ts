// The local team's offers, stamped on their tiles: a flat white symbol with a thick dark rim per kind
// (a helmet for a barracks, a turret for a tower, a pickaxe for a mine, a question mark for a
// mystery) and the price under it. Only what stands is drawn in full colour (sprites.ts), so an offer never reads
// as a building (art/STYLE.md). A card the player just tapped turns edge-on (it flips) and fades;
// the building, or the mystery result, comes from the sim. A card that appears (the tiles around a
// flipped one open up) turns face-up from edge-on and drops into place. The symbol is a shared
// context per offer; the price is a picture number (digits.ts).

import { Container, Graphics } from 'pixi.js';
import { cardCost } from '../sim/economy';
import { OFFER_LIST } from '../sim/rules';
import { coin } from './bodies';
import { Num } from './digits';
import { inView, type Frame } from './frame';
import { LOOK_B } from './lookB';
import { sharedCtx, type Pen } from './pen';

/** How long a new card takes to turn face-up (s). */
const REVEAL = 0.35;
/** The symbol's scale on its tile, and where its centre and the price row sit (view units). */
const GLYPH_K = LOOK_B ? 0.85 : 1.3, GLYPH_Y = LOOK_B ? -0.14 : -0.22, PRICE_Y = LOOK_B ? 0.32 : 0.46;
/** The price's height (view units), a picture number (digits.ts). */
const PRICE_H = LOOK_B ? 0.3 : 0.46;
/** The price is never drawn shorter than this on screen (px): at a phone's zoom PRICE_H alone came
 *  to about 9 px, too small to read at a glance. It grows only so far, or it would leave the plaque. */
const PRICE_MIN_PX = 13, PRICE_MAX_H = PRICE_H * 1.45;
/** An offer the player cannot pay for: the price is cut into the plaque in the plaque's own dark
 *  brown, its coin dims and the whole price row steps back. It was a dull clay (#b9a487) once,
 *  within a shade of the plaque's tone and unreadable (D70); the answer then was a strong rust red,
 *  which over-corrected -- on a board where most prices are out of reach that painted the whole map
 *  in the one colour the eye cannot ignore, so the loudest thing on screen was everything the
 *  player could NOT do. Dark on cream stays readable (the digits' own outline merges into it and
 *  the number reads as carved), but it has no hue to chase. */
const POOR_TINT = '#4a3729', POOR_ALPHA = 0.45, POOR_FADE = 0.85;
/** A price the player can pay: the bright sticker face, full strength, with a gold rim around its
 *  plaque (rimCtx). Light-on-cream plus a saturated rim is what the eye picks out of a board of
 *  carved brown, and there are only ever a few of them -- which is the point. */
const PRICE_TINT = '#ffffff';

/** How a price is drawn. The one invariant, held by offers.test.ts: what the player CAN buy is the
 *  bright one. Since D81 a price never changes, so there is no third colour for a cut one -- what a
 *  card costs is what it has always cost, and the only question the look answers is whether the
 *  player can meet it. `fade` multiplies the price row's alpha; `rich` lights the plaque's rim. */
export function priceLook(gold: number, cost: number): { tint: string; coinAlpha: number; fade: number; rich: boolean } {
  if (gold < cost) return { tint: POOR_TINT, coinAlpha: POOR_ALPHA, fade: POOR_FADE, rich: false };
  return { tint: PRICE_TINT, coinAlpha: 1, fade: 1, rich: true };
}

/** The stamp's two colours: a light cream face and a dark brown ink rim. */
// lookB: a stamp in the ground's own light tone with a soft brown rim, not white on black
const FACE = LOOK_B ? '#fbf3e1' : '#fffaf0', INK = LOOK_B ? '#7a6248' : '#2b2118';
/** Ink rim width around a filled shape, and the extra width under a stroked one. */
const RIM = 0.07, RIM2 = 0.12;

/** A stroked path with an ink rim: drawn twice, wide in ink, then narrower in cream. */
function inked(p: Pen, w: number, path: () => void): void {
  path();
  p.stroke(INK, w + RIM2, 'round');
  path();
  p.stroke(FACE, w, 'round');
}

function barracksGlyph(p: Pen, tier: number): void {
  // a soldier's helmet: a crest, a round dome with cheek guards, a T-shaped visor
  p.rrect(-0.055, -0.42, 0.11, 0.2, 0.05, FACE, INK, RIM);
  p.g.beginPath();
  p.g.moveTo(-0.25, 0.14);
  p.g.lineTo(-0.25, -0.06);
  p.g.arc(0, -0.06, 0.25, Math.PI, Math.PI * 2);
  p.g.lineTo(0.25, 0.14);
  p.g.lineTo(0.08, 0.14);
  p.g.lineTo(0.08, 0.02);
  p.g.lineTo(-0.08, 0.02);
  p.g.lineTo(-0.08, 0.14);
  p.g.closePath();
  p.fill(FACE).stroke(INK, RIM);
  p.rect(-0.18, -0.07, 0.36, 0.07, INK);
  p.rect(-0.04, -0.07, 0.08, 0.12, INK);
  // the price tier as pips: a dearer barracks card trains rarer troops more often
  for (let k = 0; k < tier; k++) p.circle((k - (tier - 1) / 2) * 0.16, 0.27, 0.05, FACE, INK, RIM);
}

function towerGlyph(p: Pen): void {
  p.poly([-0.17, 0.26, 0.17, 0.26, 0.13, -0.1, -0.13, -0.1], FACE, INK, RIM);
  p.poly([
    -0.23, -0.08, 0.23, -0.08, 0.23, -0.32, 0.13, -0.32, 0.13, -0.22, 0.05, -0.22, 0.05, -0.32,
    -0.05, -0.32, -0.05, -0.22, -0.13, -0.22, -0.13, -0.32, -0.23, -0.32,
  ], FACE, INK, RIM);
  p.rrect(-0.055, 0.1, 0.11, 0.16, 0.05, INK);
  p.rect(-0.02, -0.02, 0.04, 0.09, INK);
}

function mineGlyph(p: Pen): void {
  // a pickaxe: the handle up to the right, the curved head across its top
  inked(p, 0.1, () => {
    p.g.beginPath();
    p.g.moveTo(-0.22, 0.24);
    p.g.lineTo(0.12, -0.14);
  });
  inked(p, 0.12, () => {
    p.g.beginPath();
    p.g.moveTo(-0.14, -0.33);
    p.g.quadraticCurveTo(0.27, -0.29, 0.31, 0.1);
  });
}

function mysteryGlyph(p: Pen): void {
  inked(p, 0.1, () => {
    p.g.beginPath();
    p.g.moveTo(-0.13, -0.15);
    p.g.arc(0, -0.15, 0.13, Math.PI, Math.PI * 2.45);
    p.g.lineTo(0.005, 0.07);
  });
  p.circle(0, 0.2, 0.06, FACE, INK, RIM);
}

function glyphCtx(key: string) {
  return sharedCtx(`glyph|${key}`, (p) => {
    switch (key) {
      case 'mine':
        return mineGlyph(p);
      case 'tower':
        return towerGlyph(p);
      case 'myst':
        return mysteryGlyph(p);
      default:
        return barracksGlyph(p, Number(key.slice(3)) || 1);
    }
  });
}

const coinCtx = () => sharedCtx('offer|coin', (p) => coin(p, 0, 0, 0.13));

/** lookB: the card is a carved plaque lying on its tile, not a symbol printed on it. A flat cream
 *  glyph on flat ground was the one thing on the board with no thickness at all, and thirty of
 *  them at once were what made the field read as paper. Shared by every card: one context. */
const PLQ = { w: 1.0, h: 1.08, cy: -0.07, r: 0.15 };
const plaqueCtx = () =>
  sharedCtx('offer|plaque', (p) => {
    const x = -PLQ.w / 2, t = PLQ.cy - PLQ.h / 2;
    p.rrect(x + 0.045, t + 0.075, PLQ.w, PLQ.h, PLQ.r, 'rgba(30,19,7,0.26)');
    p.rrect(x, t + 0.055, PLQ.w, PLQ.h, PLQ.r, '#6d5637');
    p.rrect(x, t, PLQ.w, PLQ.h, PLQ.r, '#cbb086', '#5e4727', 0.05);
    // the lip along the top edge, where the light stands
    p.line([x + 0.13, t + 0.055, x + PLQ.w - 0.13, t + 0.055], 'rgba(255,247,228,0.5)', 0.045, 'round');
  });

/** The gold rim that marks a plaque the player can buy from, drawn just inside its face. It is the
 *  positive half of the signal: a board is read by looking for the few lit cards, not by reading
 *  every price on it. */
const rimCtx = () =>
  sharedCtx('offer|rim', (p) => {
    const x = -PLQ.w / 2 + 0.05, t = PLQ.cy - PLQ.h / 2 + 0.05;
    p.rrect(x, t, PLQ.w - 0.1, PLQ.h - 0.1, PLQ.r * 0.8, null, 'rgba(253,224,71,0.55)', 0.05);
  });

interface CardView {
  root: Container;
  /** The coin and the price, in a layer over the troops (renderer.ts): one walking across a card
   *  hid what it cost just when the player was deciding. */
  tag: Container;
  glyph: Graphics;
  /** The gold rim, shown only while the price can be paid (null outside lookB, which has no plaque). */
  rim: Graphics | null;
  coin: Graphics;
  cost: Num;
  key: string;
  seen: number;
}

export class OfferLayer {
  readonly root = new Container({ sortableChildren: true });
  /** The prices, drawn above the units. */
  readonly tags = new Container();
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
    for (const c of this.cards.values()) this.drop(c);
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
      const cost = cardCost(oi);
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
      c.root.position.set(v.x, v.y - lift);
      c.root.zIndex = v.y;
      c.root.scale.set(sx, 1);
      c.root.alpha = alpha;
      c.tag.position.copyFrom(c.root.position);
      c.tag.scale.set(sx, 1);
      if (c.key !== off.key) {
        c.key = off.key;
        c.glyph.context = glyphCtx(off.key);
      }
      // what the player cannot pay for keeps its symbol and its plaque at full strength; only the
      // price row steps back (priceLook), so a board nothing on it can be bought from still reads
      // as a board rather than as a greyed-out menu.
      const ph = Math.min(PRICE_MAX_H, Math.max(PRICE_H, PRICE_MIN_PX / zoom));
      const look = priceLook(Tm.gold, cost);
      c.cost.set(String(cost), { h: ph, tint: look.tint, align: 'left', screen: zoom });
      c.coin.alpha = look.coinAlpha;
      c.tag.alpha = alpha * look.fade;
      if (c.rim) c.rim.visible = look.rich;
    }
    for (const [i, c] of this.cards) {
      if (c.seen === n) continue;
      this.drop(c);
      this.cards.delete(i);
    }
  }

  private drop(c: CardView): void {
    c.root.destroy({ children: true });
    c.tag.destroy({ children: true });
  }

  private card(i: number): CardView {
    let c = this.cards.get(i);
    if (c) return c;
    const root = new Container();
    let rim: Graphics | null = null;
    if (LOOK_B) {
      root.addChild(new Graphics(plaqueCtx()));
      rim = new Graphics(rimCtx());
      root.addChild(rim);
    }
    const glyph = new Graphics();
    glyph.position.set(0, GLYPH_Y);
    glyph.scale.set(GLYPH_K);
    const cg = new Graphics(coinCtx());
    cg.position.set(LOOK_B ? -0.17 : -0.24, PRICE_Y);
    if (LOOK_B) cg.scale.set(0.7);
    const cost = new Num();
    cost.position.set(LOOK_B ? -0.06 : -0.08, PRICE_Y);
    root.addChild(glyph);
    const tag = new Container();
    tag.addChild(cg, cost);
    this.root.addChild(root);
    this.tags.addChild(tag);
    c = { root, tag, glyph, rim, coin: cg, cost, key: '', seen: 0 };
    this.cards.set(i, c);
    return c;
  }
}
