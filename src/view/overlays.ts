// Screen-space juice over the field and the HUD: damage numbers (repeat hits on one target merge
// and re-pop), coins flying to the gold pill, the tutorial hand and hint pill, the "new troop"
// card popup and the big banners (countdown, FIGHT!, results). After Potion Siege's fly.ts and
// floaters and Holy Kicker's merged numbers and onboarding finger.

import { Container, type Text } from 'pixi.js';
import { T } from '../app/i18n';
import type { Tile } from '../sim/map';
import { FP } from '../sim/fixed';
import { PHASE_PLAY, RARITY, RARITY_COLOR, UNITS, type UnitKey } from '../sim/rules';
import { coin } from './bodies';
import type { Frame, Juice } from './frame';
import { Num } from './digits';
import { label, liveGraphics, setLabel } from './pen';
import { UnitView } from './unitView';

export interface BannerOpts {
  size?: number;
  life?: number;
  color?: string;
  /** Fraction of the screen height of the text's middle (default 0.42). */
  y?: number;
  /** A full-width band behind the text. */
  band?: string;
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
  private what = label('', { size: 13, color: '#cbd5e1', weight: 800, align: 'left' });
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
      this.bg.p.clear().rrect(0, 0, cw, ch, 14, 'rgba(15,23,42,0.92)', rc, 3);
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
      setLabel(this.name, T('u_' + cd.unit), { size: 17, color: '#ffffff', weight: 900, align: 'left' });
      this.name.position.set(88, 24);
      setLabel(this.rar, T('r_' + RARITY[cd.rarity]), { size: 14, color: rc, weight: 900, align: 'left' });
      this.rar.position.set(88, 48);
      setLabel(this.what, cd.n ? T('squad', { n: cd.n }) : T('barracks'), { size: 13, color: '#cbd5e1', weight: 800, align: 'left' });
      this.what.position.set(88, 70);
    }
  }
}

export class Overlays {
  readonly root = new Container();
  private dmgBox = new Container();
  private coinG = liveGraphics();
  private ringG = liveGraphics();
  private hand = liveGraphics();
  private handS = 0;
  private pill = liveGraphics();
  private hintText = label('', { size: 16, color: '#1f2937', weight: 900 });
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
    this.root.addChild(this.dmgBox, this.coinG.g, this.ringG.g, this.hand.g, this.pill.g, this.hintText, this.cardView.root, this.bandG.g, this.bannerBox);
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
    const play = f.eng.phase === PHASE_PLAY;
    J.goldPop = J.goldPop > 0 ? Math.max(0, J.goldPop - dt * 5) : Math.min(0, Math.max(-0.5, J.goldPop + dt * 4));
    if (J.goldShake > 0) J.goldShake = Math.max(0, J.goldShake - dt);
    // damage numbers
    const dsize = Math.max(14, cam.scale * 0.5);
    for (const [id, d] of this.dmg) {
      d.t += dt;
      d.pop = Math.max(0, d.pop - dt * 6);
      if (d.t > 0.9) {
        d.view.destroy();
        this.dmg.delete(id);
        continue;
      }
      const p = cam.worldToScreen(d.x, d.y - 0.9 - d.t * 0.7);
      d.view.set(String(Math.round(d.v)), { h: dsize * 1.1, tint: d.color });
      d.view.position.set(p.x, p.y);
      d.view.scale.set(1 + 0.4 * d.pop);
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
      setLabel(this.hintText, this.hint!, { size: fs, color: '#1f2937', weight: 900 });
      const tw = this.hintText.width + 30;
      const y = H - cam.hudBot - 34;
      const a = 0.85 + 0.15 * Math.sin(f.time * 5);
      this.pill.p.rrect(W / 2 - tw / 2, y - fs, tw, fs * 2, fs, `rgba(250,204,21,${a.toFixed(3)})`);
      this.hintText.position.set(W / 2, y + 1);
    }
    // the card for a barracks / mystery roll
    const cd = this.card;
    if (cd) {
      cd.t += dt;
      if (cd.t >= cd.life) this.card = null;
      else {
        const k = Math.min(1, cd.t * 5) * Math.min(1, (cd.life - cd.t) * 4);
        this.cardView.show(cd, f.local, W / 2 - 100, cam.hudTop + 14 - (1 - k) * 30, k);
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
    this.hand.g.visible = !!at;
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
    if (s !== this.handS) {
      this.handS = s;
      const h = this.hand.p.clear();
      const lw = Math.max(2, s * 0.09);
      h.g.roundRect(-s * 0.42, s * 0.55, s * 0.84, s * 0.85, s * 0.3).fill('#ffffff').stroke({ color: '#1f2937', width: lw, join: 'round' });
      h.g.roundRect(-s * 0.15, 0, s * 0.3, s * 0.95, s * 0.15).fill('#ffffff').stroke({ color: '#1f2937', width: lw, join: 'round' });
      h.rect(-s * 0.1, s * 0.6, s * 0.2, s * 0.3, '#ffffff');
    }
    this.hand.g.position.set(p.x + s * 0.15, p.y + s * (0.15 + 0.45 * (1 - press)));
    this.hand.g.rotation = -0.35;
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
    for (const b of this.banners) {
      const k = b.t / b.life;
      const pop = b.t < 0.18 ? 0.6 + (b.t / 0.18) * 0.55 : b.t < 0.3 ? 1.15 - ((b.t - 0.18) / 0.12) * 0.15 : 1;
      const alpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      const base = (b.size || 48) * Math.min(1, W / 420);
      const fs = base * pop;
      const cy = H * (b.y || 0.42);
      if (b.band) {
        band.a = alpha;
        band.rect(0, cy - fs * 0.85, W, fs * 1.7, b.band);
        band.a = 1;
      }
      setLabel(b.view, b.text, { size: base, color: b.color || '#ffffff', weight: 900, stroke: b.stroke || 'rgba(0,0,0,0.65)' });
      b.view.position.set(W / 2, cy);
      b.view.scale.set(pop);
      b.view.alpha = alpha;
    }
  }

  destroy(): void {
    this.reset();
    this.root.destroy({ children: true });
  }
}
