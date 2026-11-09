// One troop on screen: its ground shadow, the body (a shared context per kind, team, size and
// facing; the drake's flapping wings are drawn live), the adept's orb, the white hit flash, the
// rarity ring of epic and legendary troops and the hp bar. Used by the field (SpriteLayer) and by
// the "new troop" card popup.

import { Container, Graphics } from 'pixi.js';
import { RARITY_COLOR, type UnitKey } from '../sim/rules';
import { hpBar, shadowCtx, unitBody, unitCtx } from './bodies';
import { liveGraphics, sharedCtx, type Pen } from './pen';

/** What a troop looks like this frame, in view units (positions are relative to its foot point). */
export interface UnitLook {
  type: UnitKey;
  team: number;
  /** Size (radius) in view units. */
  s: number;
  face: number;
  lunge: boolean;
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

export class UnitView {
  readonly root = new Container();
  private shadow = new Graphics();
  private ring = new Graphics();
  private body = new Graphics();
  private live: { g: Graphics; p: Pen } | null = null;
  private orb = new Graphics(dotCtx('#fde047'));
  private flash = new Graphics(dotCtx('#ffffff'));
  private hp: { g: Graphics; p: Pen } = liveGraphics();
  private hpKey = '';
  private key = '';
  seen = 0;

  constructor() {
    this.root.addChild(this.shadow, this.body, this.orb, this.flash, this.ring, this.hp.g);
  }

  update(u: UnitLook): void {
    const s = u.s, face = u.face;
    const bx = u.lunge ? face * 0.12 : 0, by = -u.bob;
    const key = `${u.type}|${u.team}|${face}|${s}|${u.rarity}`;
    if (key !== this.key) {
      this.key = key;
      this.shadow.context = shadowCtx(s * 0.9);
      this.shadow.position.set(0, s * 0.85);
      if (u.type !== 'drake') this.body.context = unitCtx(u.type, u.team, s, face);
      this.body.visible = u.type !== 'drake';
      if (u.type === 'drake' && !this.live) {
        this.live = liveGraphics();
        this.root.addChildAt(this.live.g, this.root.getChildIndex(this.body) + 1);
      }
      if (this.live) this.live.g.visible = u.type === 'drake';
      this.ring.visible = u.rarity >= 2;
      if (u.rarity >= 2) this.ring.context = ringCtx(RARITY_COLOR[u.rarity] ?? '#ffffff', s);
      this.ring.position.set(0, s * 0.85);
      this.orb.visible = u.type === 'adept';
    }
    if (u.type === 'drake') unitBody(this.live!.p.clear(), 'drake', u.team, s, face, bx, by, u.time, u.id || 1);
    else this.body.position.set(bx, by);
    if (u.type === 'adept') {
      this.orb.position.set(bx + face * s * 1.2, by - s * 0.6);
      this.orb.scale.set(s * 0.28 + Math.sin(u.time * 10) * 0.03);
    }
    this.flash.visible = u.flash > 0;
    if (u.flash > 0) {
      this.flash.position.set(bx, by);
      this.flash.scale.set(s * 1.08);
      this.flash.alpha = 0.8 * u.flash;
    }
    const hk = u.hp < 1 ? `${u.hp.toFixed(3)}|${u.own ? 1 : 0}|${s}` : '';
    if (hk !== this.hpKey) {
      this.hpKey = hk;
      const p = this.hp.p.clear();
      if (u.hp < 1) hpBar(p, 0, -s * 1.6 - 0.15, Math.max(0.5, s * 1.8), Math.max(0, u.hp), u.own);
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
