// Everything that stands on the field, sorted by view y so lower things cover higher ones:
// obstacles, rubble, map events, troops and the two castle guards, over the buildings and the
// walled yards they stand in (buildingView.ts). Bodies are the drawn pictures (art.ts) standing
// on their foot; timers, bars and shadows are Graphics. Each view keeps its objects between
// frames, is hidden while off screen and is destroyed when its entity is gone.

import { Container, Graphics, Sprite } from 'pixi.js';
import type { Engine } from '../sim/engine';
import { FP, TICK_RATE } from '../sim/fixed';
import { EVENT_LIST, GUARD, HIT_FLASH, LUNGE_TICKS, TEAM_BLUE, TEAMS, UNITS } from '../sim/rules';
import { TILE } from '../sim/hex';
import { artH, artSprite, castSprite, setCast, eventTex, guardAnim, guardTex, PPU, rubbleTex, TILE_FOOT } from './art';
import { BIRTH_MAX, BirthFx, unitAge } from './birth';
import { hpBar, shadowCtx } from './bodies';
import { BuildingView, WallLayer } from './buildingView';
import { obstacleGroup } from './obstacleView';
import type { Camera } from './camera';
import { inView, type Frame } from './frame';
import { type Live, liveGraphics } from './pen';
import { CAST, LOOK_B } from './lookB';
import {
  DEATH_S, dotCtx, fallTag, idleTag, lungeK, LUNGE_S, STRIKE_FRAMES, TURN_MIN, TURN_RATE,
  turnTag, type UnitLook, UnitView, WALK_FRAMES,
} from './unitView';

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
/** Where in the walk cycle a walker is at time `t`, 0..1 and always climbing. The foot phase above
 *  is a sine of it, so it cannot tell the first half of the cycle from the second: rendered frames
 *  picked off the sine would play forward, then backwards, which is the rocking they replace. */
function walkPhase(t: number, speed: number): number {
  const perS = (speed * TICK_RATE) / TILE / STRIDE;
  return (t * perS * 0.5) % 1;
}


class GuardView {
  readonly root = new Container();
  private shadow = new Graphics(shadowCtx(0.4));
  private body: Sprite;
  private flash: Sprite;
  private hp: Live = liveGraphics();
  private team = -1;
  private h = 1;
  /** The hp bar's last reading: hp quantised to 1/1000, and whose guard it is. */
  private hpQ = -1;
  private hpOwn = false;

  constructor() {
    this.body = artSprite(guardTex(0), GUARD_FOOT);
    this.flash = artSprite(guardTex(0), GUARD_FOOT);
    this.flash.blendMode = 'add';
    this.shadow.position.set(0, GUARD_FOOT);
    this.root.addChild(this.shadow, this.body, this.flash, this.hp.g);
    if (LOOK_B) {
      this.cast = castSprite(guardTex(0), GUARD_FOOT);
      this.root.addChildAt(this.cast, 0);
    }
  }
  private cast: Sprite | null = null;
  /** The way it is turned right now, easing toward `face`, and the last frame time seen: it pivots
   *  on its base to turn round, as the troops do (unitView.ts TURN_RATE). */
  private faceCur = 0;
  private lastT = -1;
  /** The frame the guard is drawn as right now (a turn view, a strike or a walk frame), so the
   *  texture is only swapped on a change. */
  private kTag = ' ';
  /** Whether the atlas carries the guard's rendered cycles: it then walks, strikes and topples on
   *  drawn frames, as the troops do, instead of rocking a single picture about its feet. */
  private anim = false;
  /** The cooldown last seen: the guard shoots a bolt, which the sim shows only as the cooldown
   *  rising on the tick it looses (unitView.ts), and when the shot playing now started. */
  private prevCd = -1;
  private lungeAt = -1;
  /** When it went down, in frame time, -1 while it stands: a guard falls and comes back. */
  private deadAt = -1;
  update(f: Frame, tm: number): void {
    const g = f.eng.guards[tm]!;
    if (g.team !== this.team) {
      this.team = g.team;
      this.kTag = ' ';
      this.anim = guardAnim(g.team);
      const t = guardTex(g.team);
      this.body.texture = t;
      this.flash.texture = t;
      if (this.cast) this.cast.texture = t;
      this.h = artH(t);
    }
    const ph = g.moving ? walkPhase(f.time + g.id, g.aim ? GUARD.chaseSpeed : GUARD.speed) : -1;
    const step = ph < 0 ? 0 : Math.sin(ph * 2 * Math.PI);
    // no hop here either once the frames are drawn (unitView.ts): theirs runs twice a step and
    // in the opposite phase to this one, and the two beating against each other is the shake
    const bob = this.anim ? 0 : Math.abs(step) * 0.06;
    const face = g.face || 1;
    // written out, like the troops' (unitView.ts): no array per frame. The guard keeps its shape
    // too (unitView.ts): it hops and tips, it never squashes.
    const gap = this.lastT < 0 ? 9 : Math.max(0, f.time - this.lastT);
    const dt = this.lastT < 0 ? 1 : Math.min(0.05, gap);
    this.lastT = f.time;
    this.deadAt = -1;
    // its shot is the cooldown's rising edge; `gap` drops the stale reading of a guard that has
    // just come back into view (or back from the dead)
    const shot = this.prevCd >= 0 && g.cd > this.prevCd && gap <= 0.25;
    this.prevCd = g.cd;
    if (shot && this.anim && this.lungeAt < 0) this.lungeAt = f.time;
    if (this.faceCur !== face) {
      const d = face - this.faceCur, st = TURN_RATE * dt;
      this.faceCur = Math.abs(d) <= st ? face : this.faceCur + (d > 0 ? st : -st);
    }
    // it turns through the drawn views the atlas carries, like a troop (unitView.ts turnTag):
    // at full width throughout, rather than squashing to a sliver and back
    const turn = turnTag(this.faceCur);
    this.show(this.anim ? this.frameTag(f.time, turn, ph, tm) : turn);
    const fx = turn
      ? this.faceCur < 0
        ? -1
        : 1
      : Math.abs(this.faceCur) < TURN_MIN
        ? face > 0
          ? TURN_MIN
          : -TURN_MIN
        : this.faceCur;
    const kx = fx / PPU, ky = 1 / PPU, by = GUARD_FOOT - bob;
    // rocks from foot to foot like the troops (unitView.ts), and sways while it stands. With the
    // walk frames in the atlas the legs do the walking: the rock would be a picture swaying on top
    // of a figure that is already striding, which is the tell it was there to hide.
    const st = this.anim ? 0 : step;
    let rot = Math.sin(f.time * 0.9 + tm) * 0.014 + st * 0.13 + face * 0.045 * Math.abs(st);
    let bx = 0;
    if (this.lungeAt >= 0) {           // the bolt's kick: back on its heels, as a shooter's is
      const el = f.time - this.lungeAt;
      if (el >= LUNGE_S) this.lungeAt = -1;
      else {
        const lk = lungeK(el / LUNGE_S);
        bx -= face * 0.05 * lk;
        rot -= face * 0.1 * lk;
      }
    }
    this.body.position.set(bx, by);
    this.body.scale.set(kx, ky);
    this.body.rotation = rot;
    this.flash.position.set(bx, by);
    this.flash.scale.set(kx, ky);
    this.flash.rotation = rot;
    if (this.cast) setCast(this.cast, kx, ky);
    const fl = Math.max(0, HIT_FLASH - (f.eng.tick - g.hitT)) / HIT_FLASH;
    this.flash.visible = fl > 0;
    this.flash.alpha = 0.85 * fl;
    const top = GUARD_FOOT - bob - this.h;
    const own = g.team === f.local;
    const hq = Math.round((1000 * g.hp) / g.maxhp);
    if (hq !== this.hpQ || own !== this.hpOwn) {
      this.hpQ = hq;
      this.hpOwn = own;
      hpBar(this.hp.p.clear(), 0, 0, 0.75, Math.max(0, g.hp / g.maxhp), own);
    }
    this.hp.g.position.set(0, top - 0.08);
    this.hp.g.visible = true;
    this.body.alpha = 1;
    this.shadow.alpha = 1;
    if (this.cast) this.cast.alpha = CAST.alpha;
    // no name over it: at a phone's zoom it was a 7 px smudge, and the figure says what it is
  }

  /** Draw the guard as `tag`, swapping textures only on a change: a swap breaks the draw batch. */
  private show(tag: string): void {
    if (tag === this.kTag) return;
    this.kTag = tag;
    const t = guardTex(this.team, tag);
    this.body.texture = t;
    this.flash.texture = t;
    if (this.cast) this.cast.texture = t;
  }

  /** Which rendered frame it shows, as a troop's (unitView.ts frameTag): the turn first, then the
   *  shot it is playing, then the walk cycle, else '' for the still. */
  private frameTag(time: number, turn: string, ph: number, tm: number): string {
    if (turn) return turn;
    if (this.lungeAt >= 0) {
      const k = (time - this.lungeAt) / LUNGE_S;
      if (k < 1) return `_a${Math.min(STRIKE_FRAMES - 1, Math.floor(k * STRIKE_FRAMES))}`;
    }
    // standing its post: the same breath the troops take (unitView.ts idleTag), the two guards
    // offset from each other so the pair does not shift its weight on the same beat
    if (ph < 0) return idleTag(time + tm * 1.1);
    return `_w${Math.min(WALK_FRAMES - 1, Math.floor(ph * WALK_FRAMES))}`;
  }

  /** The guard has been felled: it topples where it stood and fades out, and is hidden once it
   *  has (false). It comes back on its own (sim/guard.ts respT), and `update` undoes all of this.
   *  It used to blink out of existence on the frame it died, the one piece on the board that did. */
  down(time: number): boolean {
    if (this.deadAt < 0) {
      this.deadAt = time;
      this.lungeAt = -1;
      this.prevCd = -1;
    }
    const k = (time - this.deadAt) / DEATH_S;
    if (k >= 1) return false;
    const fade = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
    const face = this.faceCur < 0 ? -1 : 1;
    this.flash.visible = false;
    this.hp.g.visible = false;
    if (this.anim) {
      this.show(fallTag(k));
      this.body.rotation = 0;
    } else {
      this.body.rotation = -face * 1.35 * (1 - (1 - k) * (1 - k));
    }
    this.body.position.set(0, GUARD_FOOT);
    this.body.scale.set(face / PPU, 1 / PPU);
    this.body.alpha = fade;
    this.shadow.alpha = fade;
    if (this.cast) this.cast.alpha = CAST.alpha * fade * (1 - k);
    return true;
  }
}

/** One troop's look, filled in afresh for each troop drawn. A single object kept between frames
 *  rather than a literal per troop per frame; UnitView reads it and keeps nothing. */
const LOOK: UnitLook = {
  type: 'militia', team: 0, s: 1, face: 1, lunge: false, bob: 0, step: 0, phase: -1, age: 0,
  ranged: false, cd: 0,
  flash: 0, hp: 1, own: false, id: 0, rarity: 0, time: 0,
};

/** How often a waiting troop looks round, and for how long. Prime-ish against each other so the
 *  line never glances as one. */
const GLANCE_EVERY = 4.3, GLANCE_S = 0.4;

export class SpriteLayer {
  readonly root = new Container({ sortableChildren: true });
  private obst: (Container | null)[] = [];
  private rubble: (Container | null)[] = [];
  private events: (EventView | null)[] = [];
  private blds = new Map<number, BuildingView>();
  private units = new Map<number, UnitView>();
  private guards: (GuardView | null)[] = [null, null, null];
  private walls = new WallLayer();
  /** The lights that carry newborn troops out of their barracks; the renderer hangs its two
   *  containers either side of this layer. */
  readonly birth = new BirthFx();
  private frame = 0;

  /** New match or new side: the static obstacles, and nothing else yet. */
  build(eng: Engine, cam: Camera): void {
    this.clear();
    this.walls.build(eng, cam);
    this.walls.g.zIndex = -1e9;
    this.root.addChild(this.walls.g);
    this.obst = eng.tiles.map((t) => {
      if (!t.obst) return null;
      // a tree tile is a little grove, not one tree (obstacleView.ts)
      const g = obstacleGroup(t, eng.themeKey);
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
    this.birth.reset();
    this.obst = [];
    this.rubble = [];
    this.events = [];
  }

  draw(f: Frame): void {
    const eng = f.eng, cam = f.cam, vis = f.vis;
    const n = ++this.frame;
    this.birth.begin();
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
      if (bv.root.visible) {
        bv.update(b, f);
        this.birth.gather(b, v, f);
      }
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
      const ph = moving ? walkPhase(f.time + u.id * 0.37, def.speed) : -1;
      const step = moving ? Math.sin(ph * 2 * Math.PI) : 0;
      // a troop waiting for the wave used to stand perfectly still, which read as a model the view
      // had forgotten rather than a soldier waiting. The breath is drawn now (unitView.ts idleTag,
      // tools/art3d/pose.py `breathe`); this sine is what a troop with no rendered frames gets
      // instead, and the glance turns it round now and then on frames that are already in the atlas
      const idle = moving ? 0 : 0.012 * Math.sin(f.time * 1.1 + u.id * 0.7);
      const glance = u.hold && !moving && (f.time + u.id * 1.37) % GLANCE_EVERY < GLANCE_S;
      LOOK.type = u.type;
      LOOK.team = u.team;
      LOOK.s = def.size / FP;
      LOOK.face = (u.face || (u.team === TEAM_BLUE ? 1 : -1)) * (glance ? -1 : 1);
      LOOK.lunge = eng.tick - u.lungeT < LUNGE_TICKS;
      LOOK.bob = Math.abs(step) * 0.06 + idle;
      LOOK.step = step;
      LOOK.phase = ph;
      // a newborn troop is still in the air: birth.ts draws the light carrying it, and hands back
      // the age of the piece itself -- below zero while there is no piece to draw yet
      const age = unitAge(eng.tick, u.bornT, f.alpha);
      // the orb leaves the barracks door, so the fly needs the door. `live`, not `ent`: a barracks
      // that has just been destroyed has no doorway for anything to come out of
      const bar = u.bar ? eng.live(u.bar) : null;
      LOOK.age = age < BIRTH_MAX ? this.birth.step(u, age, p, bar && cam.view(bar.x, bar.y)) : age;
      if (LOOK.age < 0) {
        uv.root.visible = false;
        continue;
      }
      LOOK.ranged = !!def.ranged;
      LOOK.cd = u.cd;
      LOOK.flash = Math.max(0, HIT_FLASH - (eng.tick - u.hitT)) / HIT_FLASH;
      LOOK.hp = u.hp / u.maxhp;
      LOOK.own = u.team === f.local;
      LOOK.id = u.id;
      LOOK.rarity = def.rarity;
      LOOK.time = f.time;
      uv.update(LOOK);
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
        if (gv) {                       // it goes over where it stood, then waits out of sight
          // the topple is timed, not drawn on demand: `down` runs even while the guard is off
          // screen, or one that fell out of sight would still be standing when the camera
          // arrived and would go over again, long after the sim had it dead
          const live = gv.down(f.time);
          const p = cam.lerpPos(g, f.alpha);
          gv.root.position.set(p.x, p.y);
          gv.root.zIndex = p.y + 0.01;
          gv.root.visible = live && inView(vis, p.x, p.y);
        }
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
    this.birth.destroy();
    this.root.destroy();
  }
}
