// The buildings on the field and the ground they stand on: a building's picture, its pop-in, hit
// flash and badge (the disc at its foot that shows what it makes and how far along it is), plus
// the paved yard / low stone walls that mark out every tile with a building. Split out of
// sprites.ts, which draws everything else that stands on the field and keeps the y-sorting.
//
// Only WallLayer and BuildingView leave this file; the badge is private to it.

import { Container, Graphics, Sprite } from 'pixi.js';
import type { Engine } from '../sim/engine';
import { TICK_RATE } from '../sim/fixed';
import { BUILD, HIT_FLASH, UNITS } from '../sim/rules';
import type { Building } from '../sim/types';
import { artH, artSprite, artW, buildingTex, castSprite, setCast, PPU, TILE_FOOT, unitTex } from './art';
import { coin, hpBar, shadowCtx } from './bodies';
import type { Camera } from './camera';
import type { Frame } from './frame';
import { type Live, liveGraphics, Pen, sharedCtx } from './pen';
import { LOOK_B } from './lookB';
import { COL, RARITY_COLOR } from './viewConst';

/** A built mine's or barracks' badge: a dark disc at the building's foot showing what it makes (a
 *  coin, or the troop it trains) inside a ring that fills toward the next coin or troop. The badge
 *  and the full-colour picture are what tell a building from an offer's flat symbol (offers.ts). */
const BADGE_Y = LOOK_B ? 0.24 : 0.2, BADGE_R = LOOK_B ? 0.2 : 0.27;
/** The widest and tallest a building's picture is drawn (view units; a tile is 1.73 wide). lookB
 *  had them smaller, but next to the 1.3x troops the painted toy buildings (wide footprints) then
 *  read smaller than a soldier, so they fill most of their tile again. */
const BLD_W = LOOK_B ? 1.45 : 1.35, BLD_H = LOOK_B ? 1.75 : 1.7;
const badgeCtx = () => sharedCtx('badge', (p) => {
  p.circle(0, 0, BADGE_R + 0.06, 'rgba(24,18,12,0.88)');
  p.circle(0, 0, BADGE_R - 0.005, '#3a3f46');
});
const badgeCoinCtx = () => sharedCtx('badge|coin', (p) => coin(p, 0, 0, 0.17));
const portraitMaskCtx = () => sharedCtx('badge|mask', (p) => p.circle(0, 0, BADGE_R - 0.01, '#ffffff'));

function makeBadge(b: Building): Container {
  const c = new Container();
  c.position.set(0, BADGE_Y);
  c.addChild(new Graphics(badgeCtx()));
  if (b.type === 'barracks' && b.unit) {
    // the troop's upper body, cut round
    const t = unitTex(b.unit, b.team);
    const sp = new Sprite({ texture: t, anchor: { x: 0.5, y: 0.36 } });
    sp.scale.set((BADGE_R * 2.3) / Math.max(1, t.width, t.height * 0.75));
    const mask = new Graphics(portraitMaskCtx());
    sp.mask = mask;
    c.addChild(mask, sp);
  } else c.addChild(new Graphics(badgeCoinCtx()));
  return c;
}

/** The badge's ring, filled to k (0..1). */
function badgeRing(p: Pen, k: number, color: string): void {
  k = Math.max(0, Math.min(1, k));
  if (k > 0.001) p.arc(0, BADGE_Y, BADGE_R + 0.025, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2, color, 0.055);
}

/** Low stone walls along every edge of a tile with a building on it (an edge two such tiles share
 *  is drawn once): built ground reads as a walled yard, an offer's tile stays open. */
export class WallLayer {
  readonly g = new Graphics();
  private p = new Pen(this.g.context);
  private key = '';
  /** Per tile, each side's neighbour (-1 on the map's rim) and the side's two corners. */
  private sides: { j: number; ax: number; ay: number; bx: number; by: number }[][] = [];

  /** Tile centres (view units). */
  private cv: { x: number; y: number }[] = [];

  build(eng: Engine, cam: Camera): void {
    this.key = '';
    this.p.clear();
    this.cv = cam.tv;
    const R = 0.97;
    this.sides = eng.tiles.map((t) => {
      const v = cam.tv[t.i]!;
      const out: { j: number; ax: number; ay: number; bx: number; by: number }[] = [];
      for (let k = 0; k < 6; k++) {
        // pointy-top hex: side k faces 60k degrees, between the corners at 60k -/+ 30
        const ang = (60 * k * Math.PI) / 180;
        const mx = v.x + Math.cos(ang) * 1.732, my = v.y + Math.sin(ang) * 1.732;
        const j = t.nb.find((nb) => {
          const w = cam.tv[nb]!;
          return Math.abs(w.x - mx) < 0.1 && Math.abs(w.y - my) < 0.1;
        }) ?? -1;
        const a0 = ang - Math.PI / 6, a1 = ang + Math.PI / 6;
        out.push({ j, ax: v.x + Math.cos(a0) * R, ay: v.y + Math.sin(a0) * R, bx: v.x + Math.cos(a1) * R, by: v.y + Math.sin(a1) * R });
      }
      return out;
    });
  }

  update(eng: Engine): void {
    let key = '';
    for (const t of eng.tiles) if (t.bld) key += t.i + ',';
    if (key === this.key) return;
    this.key = key;
    const segs: number[][] = [];
    for (const t of eng.tiles) {
      if (!t.bld) continue;
      for (const s of this.sides[t.i] ?? []) {
        if (s.j >= 0 && eng.tiles[s.j]!.bld && s.j < t.i) continue;
        segs.push([s.ax, s.ay, s.bx, s.by]);
      }
    }
    const p = this.p.clear();
    if (LOOK_B) {
      // lookB: one paved yard under the built tiles, no wall per tile: a block of built tiles reads
      // as one place, not as a grid of boxes
      for (const t of eng.tiles) if (t.bld) p.hex(this.cv[t.i]!.x, this.cv[t.i]!.y + 0.05, 1.03, 'rgba(120,96,64,0.22)');
      for (const t of eng.tiles) if (t.bld) p.hex(this.cv[t.i]!.x, this.cv[t.i]!.y, 1.02, '#ece3cf');
      return;
    }
    const H = 0.06;
    // outline, then the wall's face, then its top, each over all walls so the joins run on
    for (const s of segs) p.line([s[0]!, s[1]! + H * 0.5, s[2]!, s[3]! + H * 0.5], 'rgba(52,44,34,0.85)', 0.19, 'round');
    for (const s of segs) p.line([s[0]!, s[1]! + H, s[2]!, s[3]! + H], '#837d71', 0.12, 'round');
    for (const s of segs) p.line([s[0]!, s[1]!, s[2]!, s[3]!], '#cdc7b8', 0.11, 'round');
  }
}

export class BuildingView {
  readonly root = new Container();
  private pop = new Container();
  private shadow = new Graphics(shadowCtx(0.7));
  private body: Sprite;
  private flash: Sprite;
  private dyn: Live = liveGraphics();
  private hp: Live = liveGraphics();
  private hpKey = '';
  /** Picture top, view units from the tile centre (negative: above). */
  private top: number;
  seen = 0;

  constructor(b: Building) {
    const t = buildingTex(b.type, b.team, b.rarity || 0);
    // a building stays inside its own tile: one that spilled onto its neighbours hid their cards
    const k = Math.min(1, BLD_W / artW(t), BLD_H / artH(t));
    this.body = artSprite(t, TILE_FOOT);
    this.flash = artSprite(t, TILE_FOOT);
    this.body.scale.set(k / PPU);
    this.flash.scale.set(k / PPU);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0.6;
    this.top = TILE_FOOT - artH(t) * k;
    this.shadow.position.set(0, TILE_FOOT - 0.1);
    this.pop.pivot.set(0, TILE_FOOT);
    this.pop.position.set(0, TILE_FOOT);
    this.pop.addChild(this.shadow, this.body, this.flash);
    if (LOOK_B) {
      const c = castSprite(t, TILE_FOOT);
      setCast(c, k / PPU, k / PPU);
      this.pop.addChildAt(c, 0);
    }
    if (b.type !== 'tower') this.pop.addChild(makeBadge(b));
    this.pop.addChild(this.dyn.g);
    this.root.addChild(this.pop, this.hp.g);
  }

  update(b: Building, f: Frame): void {
    const eng = f.eng;
    const born = (eng.tick - b.bornT + f.alpha) / TICK_RATE;
    const pop = Math.min(1, born * 4);
    // grows out of the ground: wider than tall at first, a little overshoot, then still
    const k0 = 0.6 + 0.4 * pop + (pop < 1 ? Math.sin(pop * Math.PI) * 0.15 : 0);
    this.pop.scale.set(pop < 1 ? k0 * 1.08 : 1, k0);
    this.flash.visible = eng.tick - b.hitT < HIT_FLASH;
    // the moving parts: the badge's ring, the castle's coin timer
    const p = this.dyn.p.clear();
    switch (b.type) {
      case 'base':
        badgeRing(p, b.timer / BUILD.base.incomeEvery!, COL.coin);
        break;
      case 'mine':
        badgeRing(p, b.timer / BUILD.mine.incomeEvery!, COL.coin);
        break;
      case 'barracks': {
        // training; grey while the team is at the troop cap and the next troop waits
        const full = b.spawnT <= 0;
        const k = full ? 1 : 1 - b.spawnT / UNITS[b.unit as keyof typeof UNITS].spawn;
        badgeRing(p, k, full ? '#9ca3af' : RARITY_COLOR[b.rarity] ?? '#9aa5b1');
        break;
      }
    }
    const k = b.hp / b.maxhp;
    const own = b.team === f.local;
    const hk = b.hp < b.maxhp ? `${k.toFixed(3)}|${own ? 1 : 0}` : '';
    if (hk !== this.hpKey) {
      this.hpKey = hk;
      const q = this.hp.p.clear();
      if (b.hp < b.maxhp) hpBar(q, 0, this.top - 0.1, b.type === 'base' ? 1.3 : 0.9, Math.max(0, k), own);
    }
  }
}
