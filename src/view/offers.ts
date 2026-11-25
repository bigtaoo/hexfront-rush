// The local team's offers, stamped on their tiles: a flat white symbol with a thick dark rim per kind
// (a helmet for a barracks, a turret for a tower, a pickaxe for a mine, a question mark for a
// mystery) and the price under it. Only what stands is drawn in full colour (sprites.ts), so an offer never reads
// as a building (art/STYLE.md). A card the player just tapped turns edge-on (it flips) and fades;
// the building, or the mystery result, comes from the sim. A card that appears (the tiles around a
// flipped one open up) turns face-up from edge-on and drops into place. The symbol is a shared
// context per offer; the price is a picture number (digits.ts).

import { Container, Graphics } from 'pixi.js';
import type { Engine } from '../sim/engine';
import { cardCost } from '../sim/economy';
import { OFFER_LIST } from '../sim/rules';
import { coin } from './bodies';
import type { Camera } from './camera';
import { Num } from './digits';
import { inView, type Frame } from './frame';
import { LOOK_B } from './lookB';
import { sharedCtx, type Pen } from './pen';

/** How long a new card takes to turn face-up (s). */
const REVEAL = 0.35;
/** The symbol's scale on its tile, and where its centre and the price row sit (view units).
 *
 *  MEASURED OFF THE REFERENCE, not chosen (D97). On its build plot (D:/new/ref, IMG_3660) a hex is
 *  180 px across and the cream symbol on an offer hex is 41 px wide: 0.23 of a hex width. Ours was
 *  0.30 wide and 0.45 TALL -- a third again as wide and nearly twice as tall -- and fourteen of
 *  them around a castle is what the player sees as a wall of stickers. The reference's own board
 *  carries the same number of offers and reads quietly because each one is a small mark on a tile
 *  that still shows as a tile. 0.82 puts our symbol at 0.235 of a hex. */
const GLYPH_K = LOOK_B ? 0.82 : 1.3, GLYPH_Y = LOOK_B ? -0.11 : -0.22, PRICE_Y = LOOK_B ? 0.26 : 0.46;
/** The price's height (view units), a picture number (digits.ts). Also measured: the reference's
 *  price digits are 23-24 px tall on its 180 px hex, 0.131 of a hex width, where ours were 0.173.
 *  0.23 view units is 0.133 of a hex. */
const PRICE_H = LOOK_B ? 0.23 : 0.46;
/** The price is never drawn shorter than this on screen (px): at a phone's zoom PRICE_H alone came
 *  to about 9 px, too small to read at a glance. It grows only so far, or it would run into the
 *  symbol above it. 11, down from 13, for the same reason the heights came down: at the zoom a
 *  phone actually plays at, 13 was the floor that was binding and it drew the digits half again
 *  taller than the reference's. */
const PRICE_MIN_PX = 11, PRICE_MAX_H = PRICE_H * 1.45;
/** An offer the player cannot pay for: the price turns red, and that is the whole signal. The hue
 *  has been in and out three times. A dull clay (#b9a487) was unreadable (D70); a strong rust
 *  (#a81f12) was readable but shouted over a plaque (D83); a dark red cut into the plaque read
 *  well and said almost nothing (D84). The reference (D:/new/ref) settles it: no plaque at all, and
 *  an out-of-reach price is a plain bright red number with the same dark outline every other number
 *  has -- half the prices on its board are red and it reads fine, because the board under them is
 *  flat and nothing else on it is red. Nothing dims and nothing steps back: a price you cannot
 *  meet is still a price you have to read. See DECISIONS.md D87.
 */
const POOR_TINT = '#f2382a';
/** A price the player can pay: the plain white sticker face. */
const PRICE_TINT = '#ffffff';

/** How a price is drawn, and where. The one invariant, held by offers.test.ts: what the player CAN
 *  buy is the bright one. Since D81 a price never changes, so there is no third colour for a cut
 *  one -- what a card costs is what it has always cost, and the only question the look answers is
 *  whether the player can meet it. Nothing fades any more (D87): both prices are drawn at full
 *  strength, exactly as the reference does it, and `afford` only picks the tint and which layer the
 *  row rides in. */
export function priceLook(gold: number, cost: number): { tint: string; afford: boolean } {
  if (gold < cost) return { tint: POOR_TINT, afford: false };
  return { tint: PRICE_TINT, afford: true };
}

/** The stamp's two colours: a light cream face and a dark brown ink rim. The glyph lies straight on
 *  the ground now, not on a plaque, so the rim carries it: dark enough to hold against any board. */
const FACE = LOOK_B ? '#f7ecd6' : '#fffaf0', INK = LOOK_B ? '#5a442e' : '#2b2118';
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

/** lookB: the card is a flat stamp on the ground -- a cream glyph with a dark rim, a small coin and
 *  the price -- and nothing else. It used to be a carved wooden plaque: a body, a drop shadow, a
 *  lit lip and a gold rim when you could afford it, thirty of them at once around a castle. The
 *  reference (D:/new/ref) draws exactly the same information with no card under it at all, and its
 *  board is the quieter one for it: a plaque is a second object competing with the building it is
 *  offering you. What marks an offer you can pay for is now the one thing it needs to be, the
 *  colour of the number. See DECISIONS.md D87. */
/** The card's geometry as the rest of the view needs it: how far below its own tile centre the
 *  stamp reaches, and the two rows on its face. buildingView.ts sizes the buildings against these
 *  so a wall never grows into the card on the tile one row up. */
export const CARD_BOX = { bottom: PRICE_Y + PRICE_H / 2, glyphY: GLYPH_Y, priceY: PRICE_Y } as const;

/** Whether something that stands tall sits on a tile BELOW this one, where it would cover the price
 *  row. Only the two neighbours one row down can reach it: a left or right neighbour's centre is
 *  1.73 away and no building is drawn wider than 1.73 minus the lane between two of them
 *  (buildingView.ts), so its silhouette never arrives at the digits in the middle of this tile.
 *
 *  This is read off `cam.tv`, the drawn board, not off the tile's own row: the red player's view is
 *  a coordinate remap of the same map (camera.ts), so "below" means below on screen for both. */
export function coveredBelow(eng: Engine, cam: Camera, i: number): boolean {
  const y = cam.tv[i]!.y;
  for (const j of eng.tiles[i]!.nb) {
    if (cam.tv[j]!.y <= y) continue;
    const n = eng.tiles[j]!;
    if (n.bld || n.obst) return true;
  }
  return false;
}

interface CardView {
  root: Container;
  /** The layer over the troops (renderer.ts) a price row rides in while it can be paid: a soldier
   *  walking across a card hid what it cost just when the player was deciding. A price out of
   *  reach moves down into `root` instead and lets the troops cover it -- nobody is deciding about
   *  a card they cannot pay for, and in a melee four or five of them were being stamped in dark red
   *  across the soldiers, which is most of what made a fight read as noise.
   *
   *  What that traded away, and `coveredBelow` buys back: `root` is under the buildings as well as
   *  under the troops, and a building does not walk on. A castle on the tile one row down covers
   *  the whole price row of the card above it, for the entire match -- and the price a player
   *  cannot pay yet is exactly the one they are saving towards. So the row only drops when nothing
   *  stands below it. */
  tag: Container;
  glyph: Graphics;
  coin: Graphics;
  cost: Num;
  /** Whether the price row currently sits in `tag` (over the troops) rather than in `root`. */
  up: boolean;
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
      // what the player cannot pay for keeps its symbol at full strength and turns its price red
      // (priceLook), so a board nothing on it can be bought from still reads as a board rather
      // than as a greyed-out menu.
      const ph = Math.min(PRICE_MAX_H, Math.max(PRICE_H, PRICE_MIN_PX / zoom));
      const look = priceLook(Tm.gold, cost);
      c.cost.set(String(cost), { h: ph, tint: look.tint, align: 'left', screen: zoom });
      // the price row rides over the troops only while it can be paid (CardView.tag) -- unless
      // something stands on the tile below it, which would hide it for good instead of for the
      // second a soldier takes to walk past (coveredBelow)
      const up = look.afford || coveredBelow(eng, cam, i);
      if (c.up !== up) {
        c.up = up;
        (up ? c.tag : c.root).addChild(c.coin, c.cost);
      }
      c.tag.alpha = alpha;
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
    const glyph = new Graphics();
    glyph.position.set(0, GLYPH_Y);
    glyph.scale.set(GLYPH_K);
    const cg = new Graphics(coinCtx());
    cg.position.set(LOOK_B ? -0.14 : -0.24, PRICE_Y);
    if (LOOK_B) cg.scale.set(0.58);
    const cost = new Num();
    cost.position.set(LOOK_B ? -0.05 : -0.08, PRICE_Y);
    root.addChild(glyph);
    const tag = new Container();
    tag.addChild(cg, cost);
    this.root.addChild(root);
    this.tags.addChild(tag);
    c = { root, tag, glyph, coin: cg, cost, up: true, key: '', seen: 0 };
    this.cards.set(i, c);
    return c;
  }
}
