// Screen-space juice over the field and the HUD: damage numbers (repeat hits on one target merge
// and re-pop), coins flying to the gold pill, the tutorial hand and hint pill, the "new troop"
// card popup and the big banners (countdown, FIGHT!, results). After Potion Siege's fly.ts and
// floaters and Holy Kicker's merged numbers and onboarding finger.

import { Container, Sprite, type Text } from 'pixi.js';
import { T } from '../app/i18n';
import type { Tile } from '../sim/map';
import { FP } from '../sim/fixed';
import { PHASE_PLAY, RARITY, UNITS, type UnitKey } from '../sim/rules';
import { tex } from './art';
import { coin } from './bodies';
import type { Frame, Juice } from './frame';
import { Num, snapPx } from './digits';
import { fitWidth, label, liveGraphics, setLabel } from './pen';
import { UnitView } from './unitView';
import { RARITY_COLOR, UI } from './viewConst';

export interface BannerOpts {
  size?: number;
  life?: number;
  color?: string;
  /** Fraction of the screen height of the text's middle (default 0.42). */
  y?: number;
  /** A full-width band behind the text. */
  band?: string;
  /** A thin rule along the band's two edges. A side's own colour belongs here, not in `band`:
   *  the fight banner used to wash the whole screen in team blue at 0.55, which over a pale board
   *  composited to a flat lavender bar across the middle of it -- a colour in nothing else the game
   *  draws, and read as a glitch rather than as "your side". The band stays the panels' wood, which
   *  is also what white text reads best on. */
  bandEdge?: string;
  stroke?: string;
}
interface Banner extends BannerOpts {
  text: string;
  t: number;
  life: number;
  view: Text;
}
export interface CardPop {
  unit: UnitKey;
  rarity: number;
  /** What came: a barracks that keeps training them (0), or n troops at once. */
  n?: number;
  t: number;
  life: number;
}
interface DmgNum {
  v: number;
  x: number;
  y: number;
  t: number;
  pop: number;
  color: string;
  view: Num;
}
interface FlyCoin {
  x0: number;
  y0: number;
  bend: number;
  t: number;
  life: number;
}

class CardView {
  readonly root = new Container();
  private bg = liveGraphics();
  private unit = new UnitView();
  private fig = new Container();
  private name = label('', { size: 17, color: '#ffffff', weight: 900, align: 'left' });
  private rar = label('', { size: 14, color: '#ffffff', weight: 900, align: 'left' });
  private what = label('', { size: 13, color: UI.dim, weight: 800, align: 'left' });
  private key = '';

  constructor() {
    this.fig.addChild(this.unit.root);
    this.fig.scale.set(34);
    this.root.addChild(this.bg.g, this.fig, this.name, this.rar, this.what);
  }
  show(cd: CardPop, team: number, x: number, y: number, k: number): void {
    const cw = 200, ch = 92;
    this.root.alpha = Math.max(0, k);
    this.root.position.set(x, y);
    const key = `${cd.unit}|${cd.rarity}|${team}|${cd.n ?? 0}`;
    if (key !== this.key) {
      this.key = key;
      const rc = RARITY_COLOR[cd.rarity] ?? '#ffffff';
      // The pop is a wooden token like everything else on the rails (viewConst UI), not a panel of
      // its own: its own dark brown and a bare 3 px rarity ring read as a cold hole punched in the
      // board for the two seconds it hangs there. So the rail's wood with the warm rim every token
      // carries, and the rarity colour kept as a line INSIDE it -- still the first thing the eye
      // gets off the card, without the card leaving the set.
      this.bg.p.clear()
        .rrect(0, 0, cw, ch, 14, UI.rail, UI.tokenRim, 3)
        .rrect(3.5, 3.5, cw - 7, ch - 7, 11, null, rc, 2);
      const def = UNITS[cd.unit];
      this.unit.update({
        type: cd.unit, team, s: def.size / FP, face: 1, lunge: false, bob: 0, flash: 0,
        hp: 1, own: true, id: 1, rarity: def.rarity, time: 0,
      });
      // the picture, shadow and all, fits the card's left square
      const b = this.unit.root.getLocalBounds();
      const fk = Math.min(72 / Math.max(0.01, b.width), 76 / Math.max(0.01, b.height));
      this.fig.scale.set(fk);
      this.fig.position.set(44 - (b.x + b.width / 2) * fk, ch / 2 - (b.y + b.height / 2) * fk);
      // the three lines live in the card's right half: a long troop name (Portuguese's
      // "Mago da Tempestade", French's "Colosse de pierre") ran off the card and over the field
      const room = cw - 88 - 10;
      setLabel(this.name, T('u_' + cd.unit), { size: 17, color: '#ffffff', weight: 900, align: 'left' });
      fitWidth(this.name, room);
      this.name.position.set(88, 24);
      setLabel(this.rar, T('r_' + RARITY[cd.rarity]), { size: 14, color: rc, weight: 900, align: 'left' });
      fitWidth(this.rar, room);
      this.rar.position.set(88, 48);
      setLabel(this.what, cd.n ? T('squad', { n: cd.n }) : T('barracks'), { size: 13, color: UI.dim, weight: 800, align: 'left' });
      fitWidth(this.what, room);
      this.what.position.set(88, 70);
    }
  }
}

/** The hint slip's paper, ink and wooden rim (the panels' own colours, index.html). */
const HINT_PAPER = '#fff6e2', HINT_INK = '#3b2412', HINT_RIM = '#6e4320';

/** A damage number's life (seconds); it fades out over the last third of it. */
export const DMG_LIFE = 0.9;
/** How a damage number floats and how big it is drawn (view units, and pixels per view unit).
 *  It used to lift 0.9 and rise another 0.63 at half a tile tall, which put it a whole row above
 *  the thing it belonged to -- over a besieged castle that is exactly where the two offer cards
 *  hang, so the biggest numbers of the match covered the prices the player had to read right then.
 *  Now it stays on its own tile: at its tallest, mid-pop, its top edge is still clear of the card
 *  bottom in the row above (-1.5 + 0.47 = -1.03 in the target's own units). */
const DMG_LIFT = 0.4, DMG_RISE = 0.33, DMG_H = 0.4, DMG_MIN_PX = 13;
/** The tallest a number may be drawn, whatever the zoom. The 13 px floor keeps it readable on a
 *  board drawn small, but on the overview scale (about 15 px a tile) that floor alone was two
 *  thirds of a tile and walked back into the row above; the cap wins over it. */
const DMG_H_MAX = 0.62;
/** The pop's extra size at the moment of a hit, and the pixel height of a number. */
export const DMG_POP_K = 0.4;

/** How far above its target a damage number floats, and how tall it is drawn, `age` seconds
 *  after the hit on a camera of `scale` pixels per view unit. */
export function dmgLook(age: number, scale: number): { lift: number; px: number } {
  return {
    lift: DMG_LIFT + Math.min(Math.max(age, 0), DMG_LIFE) * DMG_RISE,
    px: Math.min(Math.max(DMG_MIN_PX, scale * DMG_H), scale * DMG_H_MAX),
  };
}

export class Overlays {
  readonly root = new Container();
  private dmgBox = new Container();
  private coinG = liveGraphics();
  private ringG = liveGraphics();
  private hand = new Sprite(tex('hand'));
  private pill = liveGraphics();
  private hintText = label('', { size: 16, color: HINT_INK, weight: 900 });
  private cardView = new CardView();
  private bandG = liveGraphics();
  private bannerBox = new Container();
  private dmg = new Map<number, DmgNum>();
  private coins: FlyCoin[] = [];
  private banners: Banner[] = [];
  card: CardPop | null = null;
  hint: string | null = null;
  /** The tile the tutorial hand points at. */
  guide: Tile | null = null;

  constructor(private juice: Juice) {
    this.hand.anchor.set(HAND_TIP_X, 1);
    // Ordered by how long a thing lives, longest first: the standing furniture at the bottom, the
    // things that flash and are gone on top. A damage number is on screen for well under a second
    // and it is the one piece of feedback that has to arrive on the frame it is about -- it used to
    // sit UNDER the hint line, the tutorial hand and the pick-up card, any of which could eat it at
    // the exact moment a fight turned. The tug band and the banner stay above everything, as they
    // always have: they are the match talking, not the field.
    this.root.addChild(this.cardView.root, this.pill.g, this.hintText, this.hand, this.ringG.g, this.dmgBox, this.coinG.g, this.bandG.g, this.bannerBox);
  }

  reset(): void {
    this.hint = null;
    this.guide = null;
    this.card = null;
    for (const b of this.banners) b.view.destroy();
    this.banners = [];
    for (const d of this.dmg.values()) d.view.destroy();
    this.dmg.clear();
    this.coins = [];
  }

  banner(text: string, opts: BannerOpts = {}): void {
    const view = label(text, { size: 48, color: '#ffffff', weight: 900 });
    this.bannerBox.addChild(view);
    this.banners.push({ ...opts, text, t: 0, life: opts.life ?? 1.4, view });
  }

  /** `n` coins fly from a screen point to the gold pill; it pops as each lands. */
  coinFly(sx: number, sy: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.coins.push({
        x0: sx + (Math.random() - 0.5) * 16, y0: sy + (Math.random() - 0.5) * 10,
        bend: (Math.random() - 0.5) * 140, t: -i * 0.07, life: 0.55 + Math.random() * 0.12,
      });
    }
  }

  /** A damage number at a view point; hits on the same target within 0.4 s add up and re-pop. */
  damageNumber(id: number, x: number, y: number, amount: number, color: string): void {
    const d = this.dmg.get(id);
    if (d && d.t < 0.4) {
      d.v += amount;
      d.t = 0;
      d.x = x;
      d.y = y;
      d.pop = 1;
      return;
    }
    if (d) d.view.destroy();
    const view = new Num();
    this.dmgBox.addChild(view);
    this.dmg.set(id, { v: amount, x, y, t: 0, pop: 1, color, view });
  }

  draw(f: Frame): void {
    const dt = f.dt, cam = f.cam, J = this.juice;
    const W = cam.W, H = cam.H;
    const play = f.eng.phase === PHASE_PLAY && !f.ui.covered;
    J.goldPop = J.goldPop > 0 ? Math.max(0, J.goldPop - dt * 5) : Math.min(0, Math.max(-0.5, J.goldPop + dt * 4));
    if (J.goldShake > 0) J.goldShake = Math.max(0, J.goldShake - dt);
    // damage numbers
    // under a panel they are match furniture like the bars: they age out of sight rather
    // than floating over the result card
    this.dmgBox.visible = !f.ui.covered;
    for (const [id, d] of this.dmg) {
      d.t += dt;
      d.pop = Math.max(0, d.pop - dt * 6);
      if (d.t > DMG_LIFE) {
        d.view.destroy();
        this.dmg.delete(id);
        continue;
      }
      const look = dmgLook(d.t, cam.scale);
      const p = cam.worldToScreen(d.x, d.y - look.lift);
      // this layer is over the HUD: a fight at the field's top edge floated its numbers onto the
      // clock and the tug bar, so a number shows only over the field
      d.view.visible = p.y > cam.hudTop + look.px * 0.6 && p.y < H - cam.hudBot - look.px * 0.6;
      if (!d.view.visible) continue;
      d.view.set(String(Math.round(d.v)), { h: look.px, tint: d.color });
      d.view.position.set(snapPx(p.x), snapPx(p.y));
      d.view.scale.set(1 + DMG_POP_K * d.pop);
      d.view.alpha = d.t > 0.6 ? (0.9 - d.t) / 0.3 : 1;
    }
    this.flyCoins(f);
    this.drawGuide(f, play);
    // hint pill
    const showHint = !!this.hint && play;
    this.pill.p.clear();
    this.hintText.visible = showHint;
    if (showHint) {
      const fs = Math.min(18, W / 26);
      setLabel(this.hintText, this.hint!, { size: fs, color: HINT_INK, weight: 900 });
      // a long hint (German, Russian) wraps onto a second line instead of running off a phone's edges;
      // breakWords lets Chinese and Japanese, which have no spaces, break between characters
      const maxW = Math.min(W - 24, 760);
      const st = this.hintText.style;
      if (!st.wordWrap || st.wordWrapWidth !== maxW - 30) {
        st.wordWrap = true;
        st.breakWords = true;
        st.wordWrapWidth = maxW - 30;
      }
      const tw = Math.min(maxW, this.hintText.width + 30);
      const th = Math.max(fs * 2, this.hintText.height + fs * 0.5);
      const yb = H - cam.hudBot - 34 + fs;
      // a paper slip in a wooden rim, like the panels (it was a flat yellow strip, the one thing on
      // screen in no material); it breathes by its rim, not by flashing its whole face
      const a = 0.75 + 0.25 * Math.sin(f.time * 5);
      const pr = Math.min(fs, th / 2);
      this.pill.p.rrect(W / 2 - tw / 2, yb - th + 3, tw, th, pr, HINT_RIM);
      this.pill.p.rrect(W / 2 - tw / 2, yb - th, tw, th, pr, HINT_PAPER, `rgba(110,67,32,${a.toFixed(3)})`, 3);
      this.hintText.position.set(W / 2, yb - th / 2 + 1);
    }
    // the card for a barracks / mystery roll
    const cd = this.card;
    if (cd) {
      cd.t += dt;
      if (cd.t >= cd.life) this.card = null;
      else {
        const k = Math.min(1, cd.t * 5) * Math.min(1, (cd.life - cd.t) * 4);
        // a landscape phone has no height for the card above the banners' row: it sits top left
        this.cardView.show(cd, f.local, this.cardLeft(f) ? 14 : W / 2 - 100, cam.hudTop + 14 - (1 - k) * 30, k);
      }
    }
    this.cardView.root.visible = !!this.card;
    this.drawBanners(f);
  }

  private flyCoins(f: Frame): void {
    const p = this.coinG.p.clear();
    const to = this.juice.goldAt;
    if (!to) {
      this.coins.length = 0;
      return;
    }
    const r = Math.max(6, f.cam.hudBot * 0.09);
    // quadratic bezier with a sideways bend, eased in so they snap into the pill
    this.coins = this.coins.filter((k) => {
      k.t += f.dt;
      if (k.t < 0) return true;
      const u = Math.min(1, k.t / k.life), e = u * u;
      const mx = (k.x0 + to.x) / 2 + k.bend, my = Math.min(k.y0, to.y) - 60;
      const x = (1 - e) * (1 - e) * k.x0 + 2 * (1 - e) * e * mx + e * e * to.x;
      const y = (1 - e) * (1 - e) * k.y0 + 2 * (1 - e) * e * my + e * e * to.y;
      coin(p, x, y, r * (1 + 0.3 * Math.sin(u * Math.PI)));
      if (u >= 1) {
        this.juice.goldPop = 1;
        return false;
      }
      return true;
    });
  }

  /** The tutorial hand: taps the guided tile, with a ring on each tap. */
  private drawGuide(f: Frame, play: boolean): void {
    const rp = this.ringG.p.clear();
    const at = this.guide && play ? f.cam.tv[this.guide.i] : null;
    this.hand.visible = !!at;
    if (!at) return;
    const cam = f.cam;
    const p = cam.worldToScreen(at.x, at.y);
    const u = (f.time * 1.1) % 1;
    const press = u < 0.25 ? u / 0.25 : u < 0.4 ? 1 : Math.max(0, 1 - (u - 0.4) / 0.3);
    const s = Math.max(20, cam.scale * 0.7);
    if (u > 0.25 && u < 0.85) {
      const k = (u - 0.25) / 0.6;
      rp.circle(p.x, p.y, s * (0.3 + k * 0.9), null, `rgba(255,255,255,${(1 - k).toFixed(3)})`, 3);
    }
    this.hand.scale.set((s * HAND_S) / HAND_PX);
    // the fingertip taps the card's top edge and the whole hand stands above it: the hand used to
    // reach up from below and sit on the price the player was being taught to read, and a tip in
    // the middle of the tile buries the glyph under the fist (the picture is 1.3 tiles tall)
    const gy = p.y - cam.scale * 0.55;
    this.hand.position.set(p.x, gy - s * 0.45 * (1 - press));
  }

  /** On a short landscape screen the card popup goes top left instead of top centre. */
  private cardLeft(f: Frame): boolean {
    return f.cam.H < 560 && f.cam.W > f.cam.H * 1.25;
  }

  private drawBanners(f: Frame): void {
    const W = f.cam.W, H = f.cam.H, dt = f.dt;
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter((b) => {
      if (b.t < b.life) return true;
      b.view.destroy();
      return false;
    });
    const band = this.bandG.p.clear();
    // what a banner must clear: the card popup (on a landscape phone 0.32 of the height is inside
    // it, and "Lucky!" comes with the card), then the banners placed before it (a siege note and
    // a map event at once wrote one on top of the other)
    const taken: [number, number][] = this.card && !this.cardLeft(f) ? [[0, f.cam.hudTop + 14 + 92 + 4]] : [];
    const top = f.cam.hudTop + 4, bot = H - f.cam.hudBot - 4;
    for (const b of this.banners) {
      const k = b.t / b.life;
      const pop = b.t < 0.18 ? 0.6 + (b.t / 0.18) * 0.55 : b.t < 0.3 ? 1.15 - ((b.t - 0.18) / 0.12) * 0.15 : 1;
      const alpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      const base = (b.size || 48) * Math.min(1, W / 420);
      setLabel(b.view, b.text, { size: base, color: b.color || '#ffffff', weight: 900, stroke: b.stroke || 'rgba(0,0,0,0.65)' });
      // a long banner (a boss's name in Russian on a phone held upright) shrinks to fit the screen's width
      b.view.scale.set(1);
      const sc = Math.min(pop, (W - 24) / Math.max(1, b.view.width));
      const fs = base * sc;
      // the room a banner takes, without its pop-in (which would shove the ones below it about)
      const half = base * Math.min(1, sc / pop) * 0.85;
      let cy = H * (b.y || 0.42);
      for (let k2 = 0; k2 < 3; k2++) {
        const o = taken.find(([a, z]) => cy + half > a && cy - half < z);
        if (!o) break;
        cy = o[1] + half;
      }
      // it never leaves the play area for the bars (crowded, it overlaps instead)
      cy = Math.max(top + half, Math.min(bot - half, cy));
      taken.push([cy - half, cy + half]);
      if (b.band) {
        const by = cy - fs * 0.85, bh = fs * 1.7;
        band.a = alpha;
        band.rect(0, by, W, bh, b.band);
        if (b.bandEdge) {
          const e = Math.max(2, fs * 0.05);
          band.rect(0, by, W, e, b.bandEdge);
          band.rect(0, by + bh - e, W, e, b.bandEdge);
        }
        band.a = 1;
      }
      b.view.position.set(W / 2, cy);
      b.view.scale.set(sc);
      b.view.alpha = alpha;
    }
  }

  destroy(): void {
    this.reset();
    this.root.destroy({ children: true });
  }
}

/** The tutorial hand (art/ui/src/hand.png, packed into the atlas): a painted wooden mannequin
 *  hand, the finger already pointing down and to the left, so nothing here rotates it. It replaces
 *  a dozen strokes of vector fist -- an outline, three creases and a cuff, rebuilt on every zoom --
 *  that still read as a white blob on a stick. `HAND_TIP` is where the fingertip sits inside that
 *  picture, measured off its alpha: anchoring there puts the tip on the tile, press bob and all. */
const HAND_PX = 256, HAND_S = 2.6, HAND_TIP_X = 0.082;
