// Everything that stands on the field, sorted by view y so lower things cover higher ones:
// obstacles, rubble, map events, troops and the two castle guards, over the buildings and the
// walled yards they stand in (buildingView.ts). Bodies are the drawn pictures (art.ts) standing
// on their foot; timers, bars and shadows are Graphics. Each view keeps its objects between
// frames, is hidden while off screen and is destroyed when its entity is gone.

import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { T } from '../app/i18n';
import type { Engine } from '../sim/engine';
import { FP, TICK_RATE } from '../sim/fixed';
import { EVENT_LIST, GUARD, HIT_FLASH, LUNGE_TICKS, TEAM_BLUE, TEAMS, UNITS } from '../sim/rules';
import { TILE } from '../sim/hex';
import { artH, artSprite, castSprite, setCast, eventTex, guardTex, obstacleTex, PPU, rubbleTex, TILE_FOOT } from './art';
import { hpBar, shadowCtx } from './bodies';
import { BuildingView, WallLayer } from './buildingView';
import type { Camera } from './camera';
import { inView, type Frame } from './frame';
import { label, type Live, liveGraphics, setLabel } from './pen';
import { LOOK_B } from './lookB';
import { DEATH_S, dotCtx, UnitView } from './unitView';

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
