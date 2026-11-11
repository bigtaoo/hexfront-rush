// What flies and fades over the field: projectiles (from the sim, interpolated), particle bursts
// and shock rings (fed by sim events), the white hex that marks a tapped tile, and rising labels.
// Effects use Math.random freely: they live in the view and never reach the sim.

import { Container, Text } from 'pixi.js';
import type { Engine } from '../sim/engine';
import { TEAM_BLUE } from '../sim/rules';
import type { Camera } from './camera';
import { inView, type Frame } from './frame';
import { Num, NUM_TEXT } from './digits';
import { label, liveGraphics, setLabel } from './pen';
import { COL } from './viewConst';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
}
interface Ring {
  x: number;
  y: number;
  r: number;
  color: string;
  t: number;
  life: number;
}
interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  life: number;
  view: Text | Num | null;
}

export class EffectLayer {
  /** Above the sprites: projectiles, particles, rings, floaters. */
  readonly root = new Container();
  /** Below the sprites: the tapped-tile marker. */
  readonly under = new Container();
  private fx = liveGraphics();
  private mark = liveGraphics();
  private labels = new Container();
  private parts: Particle[] = [];
  private rings: Ring[] = [];
  private floaters: Floater[] = [];
  private marker: { x: number; y: number; t: number } | null = null;

  constructor() {
    this.root.addChild(this.fx.g, this.labels);
    this.under.addChild(this.mark.g);
  }

  reset(): void {
    this.parts = [];
    this.rings = [];
    for (const f of this.floaters) f.view?.destroy();
    this.floaters = [];
    this.marker = null;
    this.mark.p.clear();
    this.fx.p.clear();
  }

  burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, t: 0,
        life: 0.5 + Math.random() * 0.4, color, size: 0.08 + Math.random() * 0.08,
      });
    }
  }
  ring(x: number, y: number, r: number, color: string): void {
    this.rings.push({ x, y, r, color, t: 0, life: 0.35 });
  }
  floater(x: number, y: number, text: string, color: string): void {
    this.floaters.push({ x, y, text, color, t: 0, life: 1.1, view: null });
  }
  /** The white hex over a tile the player tapped. */
  markAt(x: number, y: number): void {
    this.marker = { x, y, t: 0.6 };
  }

  draw(f: Frame): void {
    const dt = f.dt;
    // marker (under the sprites)
    const mp = this.mark.p.clear();
    const m = this.marker;
    if (m && m.t > 0) {
      m.t -= dt;
      mp.a = Math.max(0, Math.min(1, m.t * 2));
      mp.hex(m.x, m.y, 0.55 + (1 - m.t) * 0.2, null, '#ffffff', 0.08);
      mp.a = 1;
    }
    const p = this.fx.p.clear();
    this.projectiles(f.eng, f.cam, f.alpha, f);
    for (const e of this.parts) {
      e.t += dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vy += 6 * dt;
    }
    for (const e of this.rings) e.t += dt;
    this.parts = this.parts.filter((e) => e.t < e.life);
    this.rings = this.rings.filter((e) => e.t < e.life);
    for (const e of this.parts) {
      if (!inView(f.vis, e.x, e.y)) continue;
      p.a = 1 - e.t / e.life;
      p.circle(e.x, e.y, e.size, e.color);
    }
    for (const e of this.rings) {
      const k = 1 - e.t / e.life;
      p.a = k;
      p.circle(e.x, e.y, e.r * (1 - k * 0.5), null, e.color, 0.1);
    }
    p.a = 1;
    // rising labels
    const zoom = f.cam.scale;
    for (const fl of this.floaters) {
      fl.t += dt;
      fl.y -= 0.8 * dt;
    }
    this.floaters = this.floaters.filter((fl) => {
      if (fl.t < fl.life) return true;
      fl.view?.destroy();
      return false;
    });
    for (const fl of this.floaters) {
      // a number (gold taken) is a picture number on the board; words stay a Text at screen size
      if (!fl.view) {
        fl.view = NUM_TEXT.test(fl.text) ? new Num() : label(fl.text, { size: 10, color: fl.color });
        this.labels.addChild(fl.view);
      }
      if (fl.view instanceof Text) {
        setLabel(fl.view, fl.text, { size: 0.42 * zoom, color: fl.color, weight: 900, stroke: 'rgba(0,0,0,0.6)' });
        fl.view.scale.set(1 / zoom);
      } else fl.view.set(fl.text, { h: 0.5, tint: fl.color, screen: zoom });
      fl.view.position.set(fl.x, fl.y);
      fl.view.alpha = Math.min(1, (1 - fl.t / fl.life) * 2);
    }
  }

  private projectiles(eng: Engine, cam: Camera, alpha: number, f: Frame): void {
    const p = this.fx.p;
    for (const pr of eng.projs) {
      if (pr.life <= 0) continue;
      const q = cam.lerpPos(pr, alpha);
      if (!inView(f.vis, q.x, q.y)) continue;
      const from = cam.view(pr.px, pr.py), to = cam.view(pr.x, pr.y);
      const a = Math.atan2(to.y - from.y, to.x - from.x);
      const ca = Math.cos(a), sa = Math.sin(a);
      switch (pr.kind) {
        case 'bolt':
        case 'arrow':
          p.line([q.x - ca * 0.35, q.y - sa * 0.35, q.x, q.y], pr.kind === 'bolt' ? '#fef3c7' : '#d6d3d1', 0.07);
          break;
        case 'tower':
          p.line([q.x - ca * 0.4, q.y - sa * 0.4, q.x, q.y], pr.team === TEAM_BLUE ? '#bfdbfe' : '#fecaca', 0.1);
          break;
        case 'stone':
          p.circle(q.x, q.y, 0.08, '#a8a29e');
          break;
        case 'orb':
          p.circle(q.x, q.y, 0.14, COL.coin);
          p.circle(q.x, q.y, 0.24, 'rgba(253,224,71,0.3)');
          break;
        case 'fire':
          p.circle(q.x, q.y, 0.16, '#fb923c');
          p.circle(q.x, q.y, 0.28, 'rgba(251,146,60,0.35)');
          break;
      }
    }
  }

  destroy(): void {
    this.reset();
    this.root.destroy({ children: true });
    this.under.destroy({ children: true });
  }
}
