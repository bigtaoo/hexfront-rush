// Everything that stands on the field, sorted by view y so lower things cover higher ones:
// obstacles, buildings (with their pop-in, hit flash, flag, coin timers and training bar), rubble,
// chests, troops and the two castle guards. Still parts are shared contexts; each view keeps its
// Graphics between frames, is hidden while off screen and is destroyed when its entity is gone.

import { Container, Graphics, type Text } from 'pixi.js';
import { T } from '../app/i18n';
import type { Engine } from '../sim/engine';
import { FP, TICK_RATE } from '../sim/fixed';
import { BUILD, HIT_FLASH, LUNGE_TICKS, RARITY_COLOR, TEAM_BLUE, TEAMS, UNITS } from '../sim/rules';
import type { Building } from '../sim/types';
import { buildingCtx, chestCtx, guardBody, hpBar, incomeRing, obstacleCtx, obstacleLook, rubbleCtx, shadowCtx } from './bodies';
import type { Camera } from './camera';
import { inView, type Frame } from './frame';
import { label, liveGraphics, setLabel, type Pen } from './pen';
import { dotCtx, UnitView } from './unitView';
import { teamCol } from './viewConst';

type Live = { g: Graphics; p: Pen };

class BuildingView {
  readonly root = new Container();
  private pop = new Container();
  private body = new Graphics();
  private flash = new Graphics();
  private dyn: Live = liveGraphics();
  private hp: Live = liveGraphics();
  private hpKey = '';
  seen = 0;

  constructor(b: Building) {
    const ctx = buildingCtx(b.type, b.team, b.rarity || 0);
    this.body.context = ctx;
    this.flash.context = ctx;
    this.flash.blendMode = 'add';
    this.flash.alpha = 0.6;
    this.pop.pivot.set(0, 0.3);
    this.pop.position.set(0, 0.3);
    this.pop.addChild(this.body, this.flash, this.dyn.g);
    this.root.addChild(this.pop, this.hp.g);
  }

  update(b: Building, f: Frame): void {
    const eng = f.eng;
    const born = (eng.tick - b.bornT + f.alpha) / TICK_RATE;
    const pop = Math.min(1, born * 4);
    this.pop.scale.set(0.6 + 0.4 * pop + (pop < 1 ? Math.sin(pop * Math.PI) * 0.15 : 0));
    this.flash.visible = eng.tick - b.hitT < HIT_FLASH;
    // the moving parts: the castle's flag, coin timers, the training bar
    const p = this.dyn.p.clear();
    switch (b.type) {
      case 'base': {
        const wv = Math.sin(f.time * 6) * 0.05;
        p.poly([0, -1.45, 0.38, -1.36 + wv, 0, -1.25], teamCol(b.team));
        incomeRing(p, 0.98, -0.55, 0.2, b.timer / BUILD.base.incomeEvery!);
        break;
      }
      case 'mine':
        incomeRing(p, 0.55, -0.65, 0.17, b.timer / BUILD.mine.incomeEvery!);
        break;
      case 'barracks': {
        // training timer; grey while the team is at the troop cap and the next troop waits
        const full = b.spawnT <= 0;
        const k = full ? 1 : 1 - b.spawnT / UNITS[b.unit as keyof typeof UNITS].spawn;
        p.rect(-0.45, 0.42, 0.9, 0.1, 'rgba(0,0,0,0.4)');
        p.rect(-0.45, 0.42, 0.9 * Math.max(0, Math.min(1, k)), 0.1, full ? '#9ca3af' : RARITY_COLOR[b.rarity] ?? '#9aa5b1');
        break;
      }
    }
    const k = b.hp / b.maxhp;
    const own = b.team === f.local;
    const hk = b.hp < b.maxhp ? `${k.toFixed(3)}|${own ? 1 : 0}` : '';
    if (hk !== this.hpKey) {
      this.hpKey = hk;
      const q = this.hp.p.clear();
      if (b.hp < b.maxhp) hpBar(q, 0, b.type === 'base' ? -1.65 : -1.2, b.type === 'base' ? 1.3 : 0.9, Math.max(0, k), own);
    }
  }
}

class ChestView {
  readonly root = new Container();
  private box = new Graphics(chestCtx());
  private spark = new Graphics(dotCtx('rgba(255,255,255,0.9)'));

  constructor() {
    const sh = new Graphics(shadowCtx(0.4));
    sh.position.set(0, 0.3 - 0.01);
    this.root.addChild(sh, this.box, this.spark);
  }
  update(i: number, time: number): void {
    const bob = Math.sin(time * 3 + i) * 0.05;
    this.box.position.set(0, bob - 0.01);
    const sp = (Math.sin(time * 5 + i) + 1) / 2;
    this.spark.position.set(0.3, bob - 0.01 - 0.5);
    this.spark.scale.set(0.05 + sp * 0.04);
  }
}

class GuardView {
  readonly root = new Container();
  private body: Live = liveGraphics();
  private flash = new Graphics(dotCtx('#ffffff'));
  private hp: Live = liveGraphics();
  private name: Text;
  private bodyKey = '';
  private hpKey = '';

  constructor() {
    this.name = label('', { size: 10, color: '#e5e7eb' });
    this.root.addChild(this.body.g, this.flash, this.hp.g, this.name);
    this.flash.scale.set(0.4);
  }
  update(f: Frame, tm: number): void {
    const g = f.eng.guards[tm]!;
    const bob = g.moving ? Math.abs(Math.sin((f.time + g.id) * 8)) * 0.06 : 0;
    const face = g.face || 1;
    const bk = `${face}|${bob.toFixed(4)}`;
    if (bk !== this.bodyKey) {
      this.bodyKey = bk;
      guardBody(this.body.p.clear(), g.team, face, bob);
    }
    const fl = Math.max(0, HIT_FLASH - (f.eng.tick - g.hitT)) / HIT_FLASH;
    this.flash.visible = fl > 0;
    this.flash.position.set(0, -bob);
    this.flash.alpha = 0.8 * fl;
    const own = g.team === f.local;
    const hk = `${(g.hp / g.maxhp).toFixed(3)}|${own ? 1 : 0}`;
    if (hk !== this.hpKey) {
      this.hpKey = hk;
      hpBar(this.hp.p.clear(), 0, -0.8, 0.75, Math.max(0, g.hp / g.maxhp), own);
    }
    const zoom = f.cam.scale;
    setLabel(this.name, T('guard'), { size: 0.28 * zoom, color: '#e5e7eb', weight: 800, stroke: 'rgba(0,0,0,0.6)' });
    this.name.scale.set(1 / zoom);
    this.name.position.set(0, -1.02);
  }
}

export class SpriteLayer {
  readonly root = new Container({ sortableChildren: true });
  private obst: (Graphics | null)[] = [];
  private rubble: (Graphics | null)[] = [];
  private chests: (ChestView | null)[] = [];
  private blds = new Map<number, BuildingView>();
  private units = new Map<number, UnitView>();
  private guards: (GuardView | null)[] = [null, null, null];
  private frame = 0;

  /** New match or new side: the static obstacles, and nothing else yet. */
  build(eng: Engine, cam: Camera): void {
    this.clear();
    this.obst = eng.tiles.map((t) => {
      if (!t.obst) return null;
      const g = new Graphics(obstacleCtx(t.obst, obstacleLook(t.obst, t.deco)));
      const v = cam.tv[t.i]!;
      g.position.set(v.x, v.y);
      g.zIndex = v.y;
      this.root.addChild(g);
      return g;
    });
    this.rubble = eng.tiles.map(() => null);
    this.chests = eng.tiles.map(() => null);
  }

  private clear(): void {
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    this.blds.clear();
    this.units.clear();
    this.guards = [null, null, null];
    this.obst = [];
    this.rubble = [];
    this.chests = [];
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
        rb = this.rubble[t.i] = new Graphics(rubbleCtx());
        rb.position.set(v.x, v.y);
        rb.zIndex = v.y - 0.1;
        this.root.addChild(rb);
      } else if (!showRubble && rb) {
        rb.destroy();
        rb = this.rubble[t.i] = null;
      }
      if (rb) rb.visible = on;
      // a chest waits on free ground
      const showChest = !!t.chest && !t.bld;
      let ch = this.chests[t.i];
      if (showChest && !ch) {
        ch = this.chests[t.i] = new ChestView();
        ch.root.position.set(v.x, v.y + 0.01);
        ch.root.zIndex = v.y + 0.01;
        this.root.addChild(ch.root);
      } else if (!showChest && ch) {
        ch.root.destroy({ children: true });
        ch = this.chests[t.i] = null;
      }
      if (ch) {
        ch.root.visible = on;
        if (on) ch.update(t.i, f.time);
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
