// Everything that stands on the field, sorted by view y so lower things cover higher ones:
// obstacles, buildings (with their pop-in, hit flash, coin timers and training bar), rubble, map
// events, troops and the two castle guards. Bodies are the drawn pictures (art.ts) standing on
// their foot; timers, bars and shadows are Graphics. Each view keeps its objects between frames,
// is hidden while off screen and is destroyed when its entity is gone.

import { Container, Graphics, type Sprite, type Text } from 'pixi.js';
import { T } from '../app/i18n';
import type { Engine } from '../sim/engine';
import { FP, TICK_RATE } from '../sim/fixed';
import { BUILD, EVENT_LIST, HIT_FLASH, LUNGE_TICKS, RARITY_COLOR, TEAM_BLUE, TEAMS, UNITS } from '../sim/rules';
import type { Building } from '../sim/types';
import { artH, artSprite, buildingTex, eventTex, guardTex, obstacleTex, PPU, rubbleTex, TILE_FOOT } from './art';
import { hpBar, incomeRing, shadowCtx } from './bodies';
import type { Camera } from './camera';
import { inView, type Frame } from './frame';
import { label, liveGraphics, setLabel, type Pen } from './pen';
import { dotCtx, UnitView } from './unitView';

type Live = { g: Graphics; p: Pen };

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
    this.body = artSprite(t, TILE_FOOT);
    this.flash = artSprite(t, TILE_FOOT);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0.6;
    this.top = TILE_FOOT - artH(t);
    this.shadow.position.set(0, TILE_FOOT - 0.1);
    this.pop.pivot.set(0, TILE_FOOT);
    this.pop.position.set(0, TILE_FOOT);
    this.pop.addChild(this.shadow, this.body, this.flash, this.dyn.g);
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
    // the moving parts: coin timers, the training bar
    const p = this.dyn.p.clear();
    switch (b.type) {
      case 'base':
        incomeRing(p, 0.98, -0.3, 0.2, b.timer / BUILD.base.incomeEvery!);
        break;
      case 'mine':
        incomeRing(p, 0.7, -0.45, 0.17, b.timer / BUILD.mine.incomeEvery!);
        break;
      case 'barracks': {
        // training timer; grey while the team is at the troop cap and the next troop waits
        const full = b.spawnT <= 0;
        const k = full ? 1 : 1 - b.spawnT / UNITS[b.unit as keyof typeof UNITS].spawn;
        p.rrect(-0.47, TILE_FOOT + 0.06, 0.94, 0.15, 0.075, 'rgba(24,16,8,0.72)');
        p.rrect(-0.44, TILE_FOOT + 0.09, 0.88 * Math.max(0.05, Math.min(1, k)), 0.09, 0.045, full ? '#9ca3af' : RARITY_COLOR[b.rarity] ?? '#9aa5b1');
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
  }
  update(f: Frame, tm: number): void {
    const g = f.eng.guards[tm]!;
    if (g.team !== this.team) {
      this.team = g.team;
      const t = guardTex(g.team);
      this.body.texture = t;
      this.flash.texture = t;
      this.h = artH(t);
    }
    const bob = g.moving ? Math.abs(Math.sin((f.time + g.id) * 8)) * 0.06 : 0;
    const face = g.face || 1;
    const sy = bob > 0 ? 1 + (bob - 0.025) * 1.3 : 1 + Math.sin(f.time * 2.2 + tm) * 0.015;
    for (const sp of [this.body, this.flash]) {
      sp.position.set(0, GUARD_FOOT - bob);
      sp.scale.set((face * (2 - sy)) / PPU, sy / PPU);
    }
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
  private frame = 0;

  /** New match or new side: the static obstacles, and nothing else yet. */
  build(eng: Engine, cam: Camera): void {
    this.clear();
    this.obst = eng.tiles.map((t) => {
      if (!t.obst) return null;
      const { t: tx, flip } = obstacleTex(t.obst, t.deco, eng.themeKey);
      const g = new Container();
      const sh = new Graphics(shadowCtx(0.5));
      sh.position.set(0, TILE_FOOT - 0.08);
      g.addChild(sh, artSprite(tx, TILE_FOOT, flip ? -1 : 1));
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
      uv.update({
        type: u.type, team: u.team, s: def.size / FP, face: u.face || (u.team === TEAM_BLUE ? 1 : -1),
        lunge: eng.tick - u.lungeT < LUNGE_TICKS, bob: moving ? Math.abs(Math.sin((f.time + u.id * 0.37) * 9)) * 0.06 : 0,
        flash: Math.max(0, HIT_FLASH - (eng.tick - u.hitT)) / HIT_FLASH, hp: u.hp / u.maxhp, own: u.team === f.local,
        id: u.id, rarity: def.rarity, time: f.time,
      });
    }
    for (const [id, uv] of this.units) {
      if (uv.seen === n) continue;
      uv.destroy();
      this.units.delete(id);
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
    this.root.destroy();
  }
}
