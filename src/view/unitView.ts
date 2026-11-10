// One troop on screen: its ground shadow, the drawn body (art.ts, mirrored to face its way), a
// white additive copy of the body for the hit flash, the rarity ring of epic and legendary troops
// and the hp bar. The pictures are still, so the life is in the transform, moved like a painted
// wooden piece on a board (art/STYLE.md, "Motion"): it hops and rocks from foot to foot while
// walking, breathes while standing, drops onto the board and settles when trained, lunges into a
// melee blow or rocks back from a shot, squashes when hit and tips over backwards when it dies; the
// drake hovers above its shadow. Used by the field (SpriteLayer) and by the "new troop" card popup.

import { Container, Graphics, type Sprite } from 'pixi.js';
import { RARITY_COLOR, type UnitKey } from '../sim/rules';
import { artH, artSprite, castSprite, PPU, setCast, unitTex } from './art';
import { hpBar, shadowCtx } from './bodies';
import { CAST, LOOK_B, LOOKB_UNIT_K } from './lookB';
import { liveGraphics, sharedCtx, type Pen } from './pen';
import { teamCol, teamDark } from './viewConst';

/** lookB: the troop stands on a team-coloured base, a flat disc with a darker rim and a thin top
 *  highlight, so its side reads on any ground (also on its own team's land). */
const baseCtx = (team: number, rx: number) =>
  sharedCtx(`ubase|${team}|${rx.toFixed(3)}`, (p) => {
    p.ellipse(0, 0.05, rx * 1.04, rx * 0.46, 'rgba(30,22,14,0.35)');
    p.ellipse(0, 0, rx, rx * 0.42, teamCol(team), teamDark(team), 0.06);
    p.ellipse(0, -0.012, rx * 0.72, rx * 0.26, null, 'rgba(255,255,255,0.35)', 0.035);
  });

/** What a troop looks like this frame, in view units (positions are relative to its centre). */
export interface UnitLook {
  type: UnitKey;
  team: number;
  /** Size (radius) in view units. */
  s: number;
  face: number;
  lunge: boolean;
  /** 0..0.06 hop height while walking, 0 standing. */
  bob: number;
  /** -1..1 the walk's foot phase (which foot it rocks onto), 0 standing. */
  step?: number;
  /** Seconds since it was trained (the drop-in plays in the first SPAWN_S). */
  age?: number;
  /** A shooter: rocks back from its attack instead of lunging in. */
  ranged?: boolean;
  /** 0..1 white flash after a hit. */
  flash: number;
  /** 0..1 health; the bar shows below 1. */
  hp: number;
  own: boolean;
  id: number;
  rarity: number;
  time: number;
}

/** A filled circle of radius 1, scaled to size. */
export const dotCtx = (color: string) => sharedCtx(`dot|${color}`, (p) => p.circle(0, 0, 1, color));
const ringCtx = (color: string, s: number) =>
  sharedCtx(`rring|${color}|${s.toFixed(3)}`, (p) => p.ellipse(0, 0, s * 1.05, s * 0.4, null, color, 0.05));

/** The ground point under a troop of size s, below its centre. */
export const unitFoot = (s: number): number => s * 0.85;
/** How high the drake flies over its shadow. */
const DRAKE_LIFT = 0.22;
/** Picture scale over the art's own size (lookB draws troops bigger). */
const PIC_K = LOOK_B ? LOOKB_UNIT_K : 1;
/** The drop-in after training: a fall for the first DROP of it, then a squash and settle. */
const SPAWN_S = 0.42, DROP = 0.55, DROP_H = 0.9;
/** How long a fallen troop takes to tip over and fade. */
export const DEATH_S = 0.5;

export class UnitView {
  readonly root = new Container();
  private shadow = new Graphics();
  private ring = new Graphics();
  private body: Sprite;
  /** lookB: the shadow the troop throws (null in the shipped look). */
  private cast: Sprite | null = null;
  private flash: Sprite;
  private hp: { g: Graphics; p: Pen } = liveGraphics();
  private hpKey = '';
  private key = '';
  /** Picture height, view units. */
  private h = 1;
  seen = 0;
  /** When it fell (frame time, s); null while it lives. */
  deadT: number | null = null;
  /** The way it faced last (a fallen troop tips over away from it). */
  face = 1;

  constructor() {
    this.body = artSprite(unitTex('militia', 0));
    this.flash = artSprite(unitTex('militia', 0));
    this.flash.blendMode = 'add';
    this.root.addChild(this.shadow, this.ring, this.body, this.flash, this.hp.g);
    if (LOOK_B) {
      this.cast = castSprite(unitTex('militia', 0));
      this.root.addChildAt(this.cast, 0);
    }
  }

  update(u: UnitLook): void {
    const s = u.s, face = u.face, foot = unitFoot(s);
    this.face = face;
    const key = `${u.type}|${u.team}|${s}|${u.rarity}`;
    if (key !== this.key) {
      this.key = key;
      const t = unitTex(u.type, u.team);
      this.body.texture = t;
      this.flash.texture = t;
      if (this.cast) this.cast.texture = t;
      this.h = artH(t) * PIC_K;
      this.shadow.context = LOOK_B ? baseCtx(u.team, Math.max(s * 0.95 * PIC_K, 0.3)) : shadowCtx(Math.max(s * 0.9, 0.22));
      this.shadow.position.set(0, foot);
      this.ring.visible = u.rarity >= 2;
      if (u.rarity >= 2) this.ring.context = ringCtx(RARITY_COLOR[u.rarity] ?? '#ffffff', s);
      this.ring.position.set(0, foot);
    }
    // a breath while standing, a hop with squash and stretch while walking
    const ph = u.time * 2.4 + u.id * 1.7;
    let sy = 1 + Math.sin(ph) * 0.018;
    if (u.bob > 0) sy = 1 + (u.bob - 0.025) * 1.3;
    // a hit squashes it for a moment
    if (u.flash > 0) sy *= 1 - 0.09 * u.flash;
    let lift = u.bob, rot = 0, bx = 0, alpha = 1;
    if (u.type === 'drake') lift = DRAKE_LIFT + Math.sin(u.time * 5 + u.id) * 0.05;
    // a wooden piece has no knees: it rocks onto the foot it lands on
    else if (u.bob > 0) rot = (u.step ?? 0) * 0.1;
    if (u.lunge) {
      if (u.ranged) {
        // the shot's kick: back on its heels, a touch taller
        bx = -face * 0.05;
        rot = -face * 0.09;
        sy *= 1.04;
      } else {
        bx = face * 0.12;
        rot = face * 0.14;
      }
    }
    const age = u.age ?? SPAWN_S;
    if (age < SPAWN_S) {
      const k = Math.max(0, age) / SPAWN_S;
      if (k < DROP) {
        const d = k / DROP;
        lift += DROP_H * (1 - d * d);
        alpha = Math.min(1, d * 3);
        sy *= 1.06;
      } else sy *= 1 - 0.2 * Math.sin((Math.PI * (k - DROP)) / (1 - DROP));
    }
    const sx = 2 - sy;
    for (const sp of [this.body, this.flash]) {
      sp.position.set(bx, foot - lift);
      sp.scale.set((face * sx * PIC_K) / PPU, (sy * PIC_K) / PPU);
      sp.rotation = rot;
    }
    this.body.alpha = alpha;
    this.shadow.alpha = alpha;
    if (this.cast) {
      // on the ground under the feet, even under a hovering drake
      this.cast.position.set(bx, foot);
      setCast(this.cast, (face * sx * PIC_K) / PPU, (sy * PIC_K) / PPU);
      this.cast.alpha = CAST.alpha * alpha;
    }
    this.flash.visible = u.flash > 0;
    if (u.flash > 0) this.flash.alpha = 0.85 * u.flash;
    // the bar rides over the picture's top (drawn at 0, moved, so a hovering drake does not redraw it)
    this.hp.g.position.set(0, foot - lift - this.h * sy - 0.1);
    const hk = u.hp < 1 ? `${u.hp.toFixed(3)}|${u.own ? 1 : 0}|${s}` : '';
    if (hk !== this.hpKey) {
      this.hpKey = hk;
      const p = this.hp.p.clear();
      if (u.hp < 1) hpBar(p, 0, 0, Math.max(0.5, s * 1.8), Math.max(0, u.hp), u.own);
    }
  }

  /** The troop has fallen: `k` 0..1 over DEATH_S. It tips over backwards on its feet, as a knocked
   *  piece does, sinks a little and fades; its base and shadow go with it. */
  dieFrame(k: number, face: number): void {
    const e = 1 - (1 - k) * (1 - k);
    const fade = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
    this.flash.visible = false;
    this.hp.g.visible = false;
    this.body.rotation = -face * 1.35 * e;
    this.body.alpha = fade;
    this.shadow.alpha = fade;
    if (this.cast) this.cast.alpha = CAST.alpha * fade * (1 - e);
    this.ring.visible = false;
  }

  /** Picture height of the troop shown, view units. */
  get height(): number {
    return this.h;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
