// Everything that stands on the field, sorted by view y so lower things cover higher ones:
// obstacles, buildings (with their pop-in, hit flash and badge), rubble, map events, troops and the
// two castle guards, over the low stone walls that ring every tile with a building on it. Bodies are the drawn pictures (art.ts) standing on
// their foot; timers, bars and shadows are Graphics. Each view keeps its objects between frames,
// is hidden while off screen and is destroyed when its entity is gone.

import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { T } from '../app/i18n';
import type { Engine } from '../sim/engine';
import { FP, TICK_RATE } from '../sim/fixed';
import { BUILD, EVENT_LIST, GUARD, HIT_FLASH, LUNGE_TICKS, TEAM_BLUE, TEAMS, UNITS } from '../sim/rules';
import { TILE } from '../sim/hex';
import type { Building } from '../sim/types';
import { artH, artSprite, artW, buildingTex, castSprite, setCast, eventTex, guardTex, obstacleTex, PPU, rubbleTex, TILE_FOOT, unitTex } from './art';
import { coin, hpBar, shadowCtx } from './bodies';
import type { Camera } from './camera';
import { inView, type Frame } from './frame';
import { label, liveGraphics, Pen, setLabel, sharedCtx } from './pen';
import { LOOK_B } from './lookB';
import { DEATH_S, dotCtx, UnitView } from './unitView';
import { COL, RARITY_COLOR } from './viewConst';

type Live = { g: Graphics; p: Pen };

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
class WallLayer {
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

class BuildingView {
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

/** A map event waiting on its tile. On free ground it stands full size; once the local team has a
 *  card on the tile it shrinks to a badge on the card's top right corner (sprites draw above the
 *  cards, so it never hides the card's price). */
class EventView {
  readonly root = new Container();
  private body: Sprite;
  private shadow = new Graphics(shadowCtx(0.45));
  private spark = new Graphics(dotCtx('rgba(255,255,255,0.9)'));
  private top: number;

  constructor(readonly ev: number) {
    const t = eventTex(EVENT_LIST[ev]!.key);
    this.body = artSprite(t, TILE_FOOT);
    this.top = TILE_FOOT - artH(t);
    this.shadow.position.set(0, TILE_FOOT - 0.06);
    this.root.addChild(this.shadow, this.body, this.spark);
  }
  update(i: number, time: number, vx: number, vy: number, badge: boolean): void {
    const bob = Math.sin(time * 3 + i) * 0.04 - 0.04;
    this.root.position.set(badge ? vx + 0.32 : vx, badge ? vy - 0.75 : vy + 0.01);
    this.root.scale.set(badge ? 0.5 : 1);
    this.root.zIndex = vy + 0.01;
    this.shadow.visible = !badge;
    this.body.position.set(0, TILE_FOOT + bob);
    const sp = (Math.sin(time * 5 + i) + 1) / 2;
    this.spark.position.set(0.3, this.top + bob + 0.15);
    this.spark.scale.set(0.05 + sp * 0.04);
  }
}

/** The castle guard's foot, below its position. */
const GUARD_FOOT = 0.36;

/** Tiles covered per hop: the hop keeps pace with the feet, so a slow giant plods and a quick
 *  troop trots (one rate for all looked like every troop was scurrying). */
const STRIDE = 0.4;
/** The walk's foot phase (-1..1: which foot it is on) at time `t` for a walker at `speed` (world
 *  units x FP per tick); the hop is |phase| x 0.06 view units high. */
function stride(t: number, speed: number): number {
  const perS = (speed * TICK_RATE) / TILE / STRIDE;
  return Math.sin(t * Math.PI * perS);
}


class GuardView {
  readonly root = new Container();
  private shadow = new Graphics(shadowCtx(0.4));
  private body: Sprite;
  private flash: Sprite;
  private hp: Live = liveGraphics();
  private name: Text;
  private team = -1;
  private h = 1;
  private hpKey = '';

  constructor() {
    this.name = label('', { size: 10, color: '#e5e7eb' });
    this.body = artSprite(guardTex(0), GUARD_FOOT);
    this.flash = artSprite(guardTex(0), GUARD_FOOT);
    this.flash.blendMode = 'add';
    this.shadow.position.set(0, GUARD_FOOT);
    this.root.addChild(this.shadow, this.body, this.flash, this.hp.g, this.name);
    if (LOOK_B) {
      this.cast = castSprite(guardTex(0), GUARD_FOOT);
      this.root.addChildAt(this.cast, 0);
    }
  }
  private cast: Sprite | null = null;
  update(f: Frame, tm: number): void {
    const g = f.eng.guards[tm]!;
    if (g.team !== this.team) {
      this.team = g.team;
      const t = guardTex(g.team);
      this.body.texture = t;
      this.flash.texture = t;
      if (this.cast) this.cast.texture = t;
      this.h = artH(t);
    }
    const step = g.moving ? stride(f.time + g.id, g.aim ? GUARD.chaseSpeed : GUARD.speed) : 0;
    const bob = Math.abs(step) * 0.06;
    const face = g.face || 1;
    const sy = bob > 0 ? 1 + (bob - 0.025) * 1.3 : 1 + Math.sin(f.time * 2.2 + tm) * 0.015;
    for (const sp of [this.body, this.flash]) {
      sp.position.set(0, GUARD_FOOT - bob);
      sp.scale.set((face * (2 - sy)) / PPU, sy / PPU);
      // rocks from foot to foot like the troops (unitView.ts)
      sp.rotation = step * 0.1;
    }
    if (this.cast) setCast(this.cast, (face * (2 - sy)) / PPU, sy / PPU);
    const fl = Math.max(0, HIT_FLASH - (f.eng.tick - g.hitT)) / HIT_FLASH;
    this.flash.visible = fl > 0;
    this.flash.alpha = 0.85 * fl;
    const top = GUARD_FOOT - bob - this.h * sy;
    const own = g.team === f.local;
    const hk = `${(g.hp / g.maxhp).toFixed(3)}|${own ? 1 : 0}`;
    if (hk !== this.hpKey) {
      this.hpKey = hk;
      hpBar(this.hp.p.clear(), 0, 0, 0.75, Math.max(0, g.hp / g.maxhp), own);
    }
    this.hp.g.position.set(0, top - 0.08);
    const zoom = f.cam.scale;
    setLabel(this.name, T('guard'), { size: 0.28 * zoom, color: '#e5e7eb', weight: 800, stroke: 'rgba(0,0,0,0.6)' });
    this.name.scale.set(1 / zoom);
    this.name.position.set(0, top - 0.3);
  }
}

export class SpriteLayer {
  readonly root = new Container({ sortableChildren: true });
  private obst: (Container | null)[] = [];
  private rubble: (Container | null)[] = [];
  private events: (EventView | null)[] = [];
  private blds = new Map<number, BuildingView>();
  private units = new Map<number, UnitView>();
  private guards: (GuardView | null)[] = [null, null, null];
  private walls = new WallLayer();
  private frame = 0;

  /** New match or new side: the static obstacles, and nothing else yet. */
  build(eng: Engine, cam: Camera): void {
    this.clear();
    this.walls.build(eng, cam);
    this.walls.g.zIndex = -1e9;
    this.root.addChild(this.walls.g);
    this.obst = eng.tiles.map((t) => {
      if (!t.obst) return null;
      const { t: tx, flip } = obstacleTex(t.obst, t.deco, eng.themeKey);
      const g = new Container();
      const sh = new Graphics(shadowCtx(0.5));
      sh.position.set(0, TILE_FOOT - 0.08);
      const sp = artSprite(tx, TILE_FOOT, flip ? -1 : 1);
      if (LOOK_B) {
        // lookB: decoration sinks into the ground (a warm tint, part see-through)
        sp.tint = 0xf2e6cc;
        g.alpha = 0.62;
      }
      g.addChild(sh, sp);
      if (LOOK_B) g.addChildAt(castSprite(tx, TILE_FOOT), 0);
      const v = cam.tv[t.i]!;
      g.position.set(v.x, v.y);
      g.zIndex = v.y;
      this.root.addChild(g);
      return g;
    });
    this.rubble = eng.tiles.map(() => null);
    this.events = eng.tiles.map(() => null);
  }

  private clear(): void {
    this.root.removeChild(this.walls.g);
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    this.blds.clear();
    this.units.clear();
    this.guards = [null, null, null];
    this.obst = [];
    this.rubble = [];
    this.events = [];
  }

  draw(f: Frame): void {
    const eng = f.eng, cam = f.cam, vis = f.vis;
    const n = ++this.frame;
    this.walls.update(eng);
    for (const t of eng.tiles) {
      const v = cam.tv[t.i]!;
      const on = inView(vis, v.x, v.y);
      const ob = this.obst[t.i];
      if (ob) ob.visible = on;
      // rubble where a building fell and nothing stands
      const showRubble = !t.obst && !t.bld && !!t.rubble;
      let rb = this.rubble[t.i];
      if (showRubble && !rb) {
        rb = this.rubble[t.i] = new Container();
        rb.addChild(artSprite(rubbleTex(), TILE_FOOT - 0.08, t.i % 2 ? -1 : 1));
        rb.position.set(v.x, v.y);
        rb.zIndex = v.y - 0.1;
        this.root.addChild(rb);
      } else if (!showRubble && rb) {
        rb.destroy({ children: true });
        rb = this.rubble[t.i] = null;
      }
      if (rb) rb.visible = on;
      // a map event waits until its tile's card is flipped
      const ev = t.bld ? 0 : t.event;
      let evv = this.events[t.i];
      if (evv && evv.ev !== ev) {
        evv.root.destroy({ children: true });
        evv = this.events[t.i] = null;
      }
      if (ev && !evv) {
        evv = this.events[t.i] = new EventView(ev);
        this.root.addChild(evv.root);
      }
      if (evv) {
        evv.root.visible = on;
        if (on) evv.update(t.i, f.time, v.x, v.y, (eng.team[f.local]?.offers[t.i] ?? -1) >= 0);
      }
    }
    for (const b of eng.blds) {
      if (!b.alive) continue;
      let bv = this.blds.get(b.id);
      if (!bv) {
        bv = new BuildingView(b);
        const v = cam.tv[b.tile]!;
        bv.root.position.set(v.x, v.y);
        bv.root.zIndex = v.y;
        this.blds.set(b.id, bv);
        this.root.addChild(bv.root);
      }
      bv.seen = n;
      const v = cam.tv[b.tile]!;
      bv.root.visible = inView(vis, v.x, v.y);
      if (bv.root.visible) bv.update(b, f);
    }
    for (const [id, bv] of this.blds) {
      if (bv.seen === n) continue;
      bv.root.destroy({ children: true });
      this.blds.delete(id);
    }
    for (const u of eng.units) {
      if (!u.alive) continue;
      let uv = this.units.get(u.id);
      if (!uv) {
        uv = new UnitView();
        this.units.set(u.id, uv);
        this.root.addChild(uv.root);
      }
      uv.seen = n;
      const p = cam.lerpPos(u, f.alpha);
      const on = inView(vis, p.x, p.y);
      uv.root.visible = on;
      if (!on) continue;
      uv.root.position.set(p.x, p.y);
      uv.root.zIndex = p.y;
      const def = UNITS[u.type];
      const moving = u.x !== u.px || u.y !== u.py;
      const step = moving ? stride(f.time + u.id * 0.37, def.speed) : 0;
      uv.update({
        type: u.type, team: u.team, s: def.size / FP, face: u.face || (u.team === TEAM_BLUE ? 1 : -1),
        lunge: eng.tick - u.lungeT < LUNGE_TICKS, bob: Math.abs(step) * 0.06, step,
        age: (eng.tick - u.bornT + f.alpha) / TICK_RATE, ranged: !!def.ranged,
        flash: Math.max(0, HIT_FLASH - (eng.tick - u.hitT)) / HIT_FLASH, hp: u.hp / u.maxhp, own: u.team === f.local,
        id: u.id, rarity: def.rarity, time: f.time,
      });
    }
    for (const [id, uv] of this.units) {
      if (uv.seen === n) continue;
      // fallen (or gone): it tips over where it stood, then goes (not off screen: nobody sees it)
      uv.deadT ??= f.time;
      const k = (f.time - uv.deadT) / DEATH_S;
      if (k >= 1 || !uv.root.visible) {
        uv.destroy();
        this.units.delete(id);
      } else uv.dieFrame(k, uv.face);
    }
    for (const tm of TEAMS) {
      const g = eng.guards[tm]!;
      let gv = this.guards[tm];
      if (g.dead) {
        if (gv) gv.root.visible = false;
        continue;
      }
      if (!gv) {
        gv = this.guards[tm] = new GuardView();
        this.root.addChild(gv.root);
      }
      const p = cam.lerpPos(g, f.alpha);
      gv.root.visible = inView(vis, p.x, p.y);
      if (!gv.root.visible) continue;
      gv.root.position.set(p.x, p.y);
      gv.root.zIndex = p.y + 0.01;
      gv.update(f, tm);
    }
  }

  destroy(): void {
    this.clear();
    this.walls.g.destroy();
    this.root.destroy();
  }
}
