// One troop on screen: its ground shadow, the drawn body (art.ts, mirrored to face its way), a
// white additive copy of the body for the hit flash, the rarity ring of epic and legendary troops
// and the hp bar. The pictures are still, so the life is in the transform: a hop with squash and
// stretch while walking, a slow breath while standing, a lean into each attack, and the drake
// hovers above its shadow. Used by the field (SpriteLayer) and by the "new troop" card popup.

import { Container, Graphics, type Sprite } from 'pixi.js';
import { RARITY_COLOR, type UnitKey } from '../sim/rules';
import { artH, artSprite, PPU, unitTex } from './art';
import { hpBar, shadowCtx } from './bodies';
import { liveGraphics, sharedCtx, type Pen } from './pen';

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

export class UnitView {
  readonly root = new Container();
  private shadow = new Graphics();
  private ring = new Graphics();
  private body: Sprite;
  private flash: Sprite;
  private hp: { g: Graphics; p: Pen } = liveGraphics();
  private hpKey = '';
  private key = '';
  /** Picture height, view units. */
  private h = 1;
  seen = 0;

  constructor() {
    this.body = artSprite(unitTex('militia', 0));
    this.flash = artSprite(unitTex('militia', 0));
    this.flash.blendMode = 'add';
    this.root.addChild(this.shadow, this.ring, this.body, this.flash, this.hp.g);
  }

  update(u: UnitLook): void {
    const s = u.s, face = u.face, foot = unitFoot(s);
    const key = `${u.type}|${u.team}|${s}|${u.rarity}`;
    if (key !== this.key) {
      this.key = key;
      const t = unitTex(u.type, u.team);
      this.body.texture = t;
      this.flash.texture = t;
      this.h = artH(t);
      this.shadow.context = shadowCtx(Math.max(s * 0.9, 0.22));
      this.shadow.position.set(0, foot);
      this.ring.visible = u.rarity >= 2;
      if (u.rarity >= 2) this.ring.context = ringCtx(RARITY_COLOR[u.rarity] ?? '#ffffff', s);
      this.ring.position.set(0, foot);
    }
    // hop + squash while walking, a breath while standing, a lean into an attack
    const ph = u.time * 2.4 + u.id * 1.7;
    let sy = 1 + Math.sin(ph) * 0.018;
    if (u.bob > 0) sy = 1 + (u.bob - 0.025) * 1.3;
    const sx = 2 - sy;
    let lift = u.bob;
    if (u.type === 'drake') lift = DRAKE_LIFT + Math.sin(u.time * 5 + u.id) * 0.05;
    const bx = u.lunge ? face * 0.12 : 0;
    for (const sp of [this.body, this.flash]) {
      sp.position.set(bx, foot - lift);
      sp.scale.set((face * sx) / PPU, sy / PPU);
      sp.rotation = u.lunge ? face * 0.14 : 0;
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

  /** Picture height of the troop shown, view units. */
  get height(): number {
    return this.h;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
