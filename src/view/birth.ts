// How a troop comes into the world. The sim has it the instant it is trained, standing at its full
// size beside the barracks; the view used to draw exactly that, so troops popped out of nothing and
// then stood still until the next wave. Here the same moment is told in four beats:
//
//   1. gather   a warm light pools at the barracks door over the last BIRTH.glow seconds of training
//   2. toss     the light leaves as an orb, the pool fades
//   3. fly      the orb rides a short arc to where the sim put the troop, with its shadow under it
//   4. settle   the orb opens, a ring and a few sparks go out, and the piece sets into the board
//
// The sim is not touched for any of it (src/sim/** and the engine version carry the golden hashes,
// the campaign calibration and online determinism). So the troop is alive and can be shot while the
// orb is still in the air: the arc is kept to BIRTH_TOTAL = 0.55 s for that reason, and the hit
// flash and the health bar ride the orb rather than a piece nobody can see. Nothing here is unfair,
// it only looks as though the light took the arrow.
//
// The light is the warm gold of a lantern, not a cold beam: the whole cast is painted wood under one
// warm lamp (art/STYLE.md), and a blue-white glow would be the one science-fiction object on the table.

import { Container, Sprite, Texture } from 'pixi.js';
import { TICK_RATE, ticks } from '../sim/fixed';
import { UNITS } from '../sim/rules';
import type { Building, Unit } from '../sim/types';
import type { Frame } from './frame';
import { type Live, liveGraphics } from './pen';
import { COL, type Pt, teamSpark } from './viewConst';

export const BIRTH = {
  /** The gathering light shows over the last seconds of a barracks' training. */
  glow: 1.2,
  /** A troop with no barracks (a mystery tile's squad, a map event) is announced this long first. */
  sky: 0.3,
  /** The arc, from the barracks door to the ground. */
  fly: 0.42,
  /** The piece sets into the board: the one beat unitView.ts draws. */
  settle: 0.13,
};
export const BIRTH_TOTAL = BIRTH.fly + BIRTH.settle;
/** The three troops of a squad are staggered by this, so they do not land as one. */
const STAGGER = 0.08;
/** The longest a birth can run: the sky wait, the last troop's stagger, and the arc. */
export const BIRTH_MAX = BIRTH.sky + 2 * STAGGER + BIRTH_TOTAL + 0.01;
/** How high a troop with no barracks falls from, view units. */
const SKY_H = 1.2;
/** How high the arc goes over a troop's own height, view units. */
const ARC_H = 0.55, ARC_SIZE = 0.25;
/** At most this many births animate at once; past it a troop simply sets into the board where it
 *  stands. A wave of training rarely finishes together, so this is a ceiling, not a working number. */
export const MAX_LIVE = 12;

export type BirthPhase = 'wait' | 'fly' | 'settle' | 'done';
export interface BirthAt {
  phase: BirthPhase;
  /** 0..1 through the current beat. */
  t: number;
  /** Height along the arc, 0 at both ends — a piece may never land hanging in the air. */
  arc: number;
}

/** Where a birth `age` seconds old (`delay` of which is the wait before it starts) has got to. */
export function birthAt(age: number, delay = 0): BirthAt {
  const a = age - delay;
  if (a < 0) return { phase: 'wait', t: delay > 0 ? Math.max(0, 1 + a / delay) : 0, arc: 0 };
  if (a < BIRTH.fly) {
    const t = a / BIRTH.fly;
    return { phase: 'fly', t, arc: 4 * t * (1 - t) };
  }
  if (a < BIRTH_TOTAL) return { phase: 'settle', t: (a - BIRTH.fly) / BIRTH.settle, arc: 0 };
  return { phase: 'done', t: 1, arc: 0 };
}

let TEX: Texture | null = null;
/** One soft warm disc, stretched to whatever size a glow needs: a gradient survives any stretch
 *  (the same trick light.ts uses for the grain and the falloff). */
function glowTex(): Texture {
  if (TEX) return TEX;
  const N = 128, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(253,224,71,0.55)');
  g.addColorStop(0.45, 'rgba(253,200,90,0.26)');
  g.addColorStop(1, 'rgba(253,190,96,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, N, N);
  return (TEX = Texture.from(cv));
}

interface Live1 {
  /** Where the light comes from, view units. */
  x0: number;
  y0: number;
  /** The wait before the arc starts (0 out of a barracks). */
  delay: number;
  /** How high this one's arc goes. */
  h: number;
  landed: boolean;
  seen: number;
}

/** The lights of every birth on screen: the pools at the barracks doors and the orbs in the air. */
export class BirthFx {
  /** Below the sprites: the pool of light at a door, and the shadow running under an orb. */
  readonly under = new Container();
  /** Above the sprites: the orb, its trail, and the flash it opens into. */
  readonly root = new Container();
  /** Called the moment a troop reaches the board — when its orb lands, or at once for one past the
   *  ceiling, which never left the ground. The renderer spends its ring and sparks on it, and the
   *  app sounds the spawn cue, so the cue lands with the piece instead of with the sim's tick. */
  land: ((x: number, y: number, team: number) => void) | null = null;
  private groundPen: Live = liveGraphics();
  private airPen: Live = liveGraphics();
  private live = new Map<number, Live1>();
  /** Troops past the ceiling, which are announced without animating: ids only, so each is announced
   *  once. It only fills during a flood of births and goes with the match (`reset`). */
  private shown = new Set<number>();
  private pools: Sprite[][] = [[], []];
  private used = [0, 0];
  private n = 0;

  constructor() {
    this.under.addChild(this.groundPen.g);
    this.root.addChild(this.airPen.g);
  }

  /** Clears last frame's drawing and retires the sprites it no longer needs. */
  begin(): void {
    this.n++;
    this.groundPen.p.clear();
    this.airPen.p.clear();
    for (let L = 0; L < 2; L++) {
      const pool = this.pools[L]!;
      for (let i = this.used[L]!; i < pool.length; i++) pool[i]!.visible = false;
      this.used[L] = 0;
    }
    for (const [id, b] of this.live) if (b.seen < this.n - 1) this.live.delete(id);
  }

  /** The light pooling at a barracks that is about to finish a troop. `v` is its foot. */
  gather(b: Building, v: Pt, f: Frame): void {
    if (b.type !== 'barracks' || !b.unit) return;
    const lead = ticks(BIRTH.glow);
    if (b.spawnT <= 0 || b.spawnT > lead || UNITS[b.unit].spawn <= lead) return;
    const k = 1 - b.spawnT / lead;
    // it widens and brightens as the troop comes on, then draws itself in over the last breath
    const near = Math.max(0, (k - 0.875) / 0.125);
    let r = 0.25 + 0.3 * k, a = 0.85 * k;
    r += (0.3 - r) * near;
    a += (1 - a) * near;
    this.glow(0, v.x, v.y, r, a * (0.92 + 0.08 * Math.sin(f.time * Math.PI * 3.2)));
  }

  /** Draws the birth of `u`, `age` seconds old, whose sim position this frame is `p`.
   *  Returns the age to draw the piece itself at: below zero while the light is still in the air
   *  (the sprite layer hides the piece), otherwise the seconds since it landed. */
  step(u: Unit, age: number, p: Pt): number {
    let b = this.live.get(u.id);
    if (!b) {
      // a troop that already set into the board is never pulled back into the air: without this a
      // birth that missed the ceiling would animate the moment a slot freed, and the piece would
      // vanish into an orb a breath after the player saw it stand there
      if (this.shown.has(u.id)) return age;
      // past the ceiling it simply appears where it stands, as it always did — and because it is
      // already on the board, that is the moment it has arrived
      if (this.live.size >= MAX_LIVE) {
        this.shown.add(u.id);
        this.land?.(p.x, p.y, u.team);
        return age;
      }
      b = this.born(u, p);
      this.live.set(u.id, b);
    }
    b.seen = this.n;
    const st = birthAt(age, b.delay);
    if (st.phase === 'done') {
      this.live.delete(u.id);
      return age - b.delay - BIRTH.fly;
    }
    if (st.phase === 'wait') {
      // nothing to throw it yet: the ground where it will land says it is coming
      this.glow(0, p.x, p.y, 0.2 + 0.2 * st.t, 0.75 * st.t);
      return -1;
    }
    if (st.phase === 'settle') {
      if (!b.landed) {
        b.landed = true;
        this.land?.(p.x, p.y, u.team);
      }
      // the light opens and goes; the piece inside it is drawn by unitView
      const o = 1 - st.t;
      this.glow(1, p.x, p.y - 0.3, 0.3 * (1.4 + 0.8 * st.t), o * 0.9);
      this.airPen.p.circle(p.x, p.y - 0.3, 0.12 + 0.3 * st.t, null, teamSpark(u.team), 0.05 * o);
      return age - b.delay - BIRTH.fly;
    }
    const x = b.x0 + (p.x - b.x0) * st.t, y = b.y0 + (p.y - b.y0) * st.t - b.h * st.arc;
    // the shadow stays on the ground and shrinks with the height: the board's way of saying "up"
    const gp = this.groundPen.p;
    const sh = 1 - 0.45 * st.arc;
    gp.ellipse(b.x0 + (p.x - b.x0) * st.t, b.y0 + (p.y - b.y0) * st.t, 0.22 * sh, 0.11 * sh, `rgba(58,38,18,${(0.2 * sh).toFixed(3)})`);
    // a short trail of where the orb just was
    const pen = this.airPen.p;
    const tr: number[] = [];
    for (let i = 3; i >= 0; i--) {
      const tt = Math.max(0, st.t - i * 0.05);
      tr.push(b.x0 + (p.x - b.x0) * tt, b.y0 + (p.y - b.y0) * tt - b.h * 4 * tt * (1 - tt));
    }
    pen.a = 0.25;
    pen.line(tr, COL.coin, 0.07, 'round');
    pen.a = 1;
    const g = 1 + 0.4 * st.t;
    this.glow(1, x, y, 0.3 * g, Math.min(1, st.t * 6));
    pen.circle(x, y, 0.2 * g, null, teamSpark(u.team), 0.07);
    pen.circle(x, y, 0.1 * g, COL.coin);
    return -1;
  }

  reset(): void {
    this.live.clear();
    this.shown.clear();
    this.groundPen.p.clear();
    this.airPen.p.clear();
    for (const pool of this.pools) for (const s of pool) s.visible = false;
    this.used = [0, 0];
  }

  destroy(): void {
    this.under.destroy({ children: true });
    this.root.destroy({ children: true });
  }

  /** Where this troop's light comes from: its barracks' door, or the sky if it has no barracks. */
  private born(u: Unit, p: Pt): Live1 {
    const h = ARC_H + ARC_SIZE * (UNITS[u.type].size / 1000);
    if (u.bar) return { x0: p.x, y0: p.y, delay: 0, h, landed: false, seen: this.n };
    // a mystery tile's squad was never trained: it falls out of the sky, the three of them in turn
    return { x0: p.x, y0: p.y - SKY_H, delay: BIRTH.sky + (u.id % 3) * STAGGER, h: 0.12, landed: false, seen: this.n };
  }

  private glow(layer: 0 | 1, x: number, y: number, r: number, a: number): void {
    const pool = this.pools[layer]!, i = this.used[layer]!++;
    let s = pool[i];
    if (!s) {
      s = new Sprite(glowTex());
      s.anchor.set(0.5);
      s.blendMode = 'add';
      pool.push(s);
      (layer ? this.root : this.under).addChildAt(s, 0);
    }
    s.visible = true;
    s.position.set(x, y);
    s.width = s.height = r * 4;
    s.alpha = Math.max(0, Math.min(1, a));
  }
}

/** Seconds since a unit was born, as the view counts them. */
export const unitAge = (tick: number, bornT: number, alpha: number): number => (tick - bornT + alpha) / TICK_RATE;
