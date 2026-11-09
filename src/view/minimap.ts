// The minimap in the top right corner: the whole map's tiles and buildings (redrawn when the ground
// changed, at most five times a second), every troop and guard, and the frame of what is on
// screen. A tap on it jumps the camera (minimapWorld). Hidden while the whole map fits the screen.

import { Container, Graphics } from 'pixi.js';
import type { Engine } from '../sim/engine';
import { FP } from '../sim/fixed';
import { TEAM_BLUE, TEAM_RED, TEAMS } from '../sim/rules';
import type { Frame } from './frame';
import { liveGraphics } from './pen';
import { COL, MAP_X0, MAP_X1, MAP_Y0, MAP_Y1, teamCol, VIEW_FLIP_Y, teamDark, teamLight, type Pt } from './viewConst';

export interface MiniRect {
  x: number;
  y: number;
  w: number;
  h: number;
  k: number;
}

export class Minimap {
  readonly root = new Container();
  /** Where the minimap is on screen this frame; null while hidden. */
  rect: MiniRect | null = null;
  private back = liveGraphics();
  private inner = new Container();
  private tiles = liveGraphics();
  private dyn = liveGraphics();
  private frameG = liveGraphics();
  private clip = new Graphics();
  private flip = false;
  // what the tile layer was drawn for
  private drawn = { k: 0, eng: null as Engine | null, ver: -1, t: -1 };

  constructor() {
    this.inner.addChild(this.tiles.g, this.dyn.g, this.frameG.g, this.clip);
    this.frameG.g.mask = this.clip;
    this.root.addChild(this.back.g, this.inner);
  }

  reset(): void {
    this.drawn.eng = null;
  }

  draw(f: Frame, groundVer: number): void {
    const cam = f.cam, eng = f.eng;
    this.flip = cam.flip;
    if (cam.fitAll || f.ui.demo) {
      this.rect = null;
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    const mw = MAP_X1 - MAP_X0, mh = MAP_Y1 - MAP_Y0;
    const h = Math.max(110, Math.min(190, cam.availH * 0.3));
    const k = h / mh, w = mw * k;
    const x = cam.W - w - 8, y = cam.hudTop + 8;
    const r = this.rect;
    const moved = !r || r.x !== x || r.y !== y || r.k !== k;
    this.rect = { x, y, w, h, k };
    if (moved) {
      this.back.p.clear().rrect(x - 3, y - 3, w + 6, h + 6, 6, 'rgba(15,23,42,0.6)');
      this.clip.clear();
      this.clip.rect(0, 0, w, h).fill('#ffffff');
    }
    this.inner.position.set(x, y);
    const qx = (vx: number) => (vx - MAP_X0) * k, qy = (vy: number) => (vy - MAP_Y0) * k;
    // tiles and buildings
    const D = this.drawn;
    if (D.k !== k || D.eng !== eng || (D.ver !== groundVer && f.time - D.t > 0.2)) {
      D.k = k;
      D.eng = eng;
      D.ver = groundVer;
      D.t = f.time;
      const p = this.tiles.p.clear();
      const g0 = eng.theme.ground[0]!;
      for (const t of eng.tiles) {
        const v = cam.tv[t.i]!;
        const c = t.obst ? 'rgba(0,0,0,0.45)' : t.owner === TEAM_BLUE ? COL.blue : t.owner === TEAM_RED ? COL.red : g0;
        p.rect(qx(v.x) - k * 0.9, qy(v.y) - k * 0.8, k * 1.8, k * 1.6, c);
      }
      for (const b of eng.blds) {
        if (!b.alive) continue;
        const v = cam.tv[b.tile]!;
        const s = b.type === 'base' ? k * 1.5 : k * 0.85;
        p.rect(qx(v.x) - s, qy(v.y) - s, s * 2, s * 2, teamDark(b.team), '#ffffff', 1);
      }
    }
    // troops and guards
    const p = this.dyn.p.clear();
    for (const tm of TEAMS) {
      let any = false;
      p.g.beginPath();
      for (const u of eng.units) {
        if (!u.alive || u.team !== tm) continue;
        const v = cam.lerpPos(u, f.alpha);
        p.g.rect(qx(v.x) - 1.2, qy(v.y) - 1.2, 2.4, 2.4);
        any = true;
      }
      if (any) p.fill(teamLight(tm));
    }
    for (const tm of TEAMS) {
      const g = eng.guards[tm]!;
      if (g.dead) continue;
      const v = cam.lerpPos(g, f.alpha);
      p.circle(qx(v.x), qy(v.y), Math.max(2.5, k * 0.6), teamCol(tm), '#ffffff', 1);
    }
    // the part of the map on screen
    const vx0 = (0 - cam.ox) / cam.scale, vy0 = (cam.hudTop - cam.oy) / cam.scale;
    const vx1 = (cam.W - cam.ox) / cam.scale, vy1 = (cam.H - cam.hudBot - cam.oy) / cam.scale;
    this.frameG.p.clear().rect(qx(vx0), qy(vy0), (vx1 - vx0) * k, (vy1 - vy0) * k, null, 'rgba(255,255,255,0.9)', 1.5);
  }

  /** A tap on the minimap: the world point under it (fixed point), or null. */
  worldAt(sx: number, sy: number): Pt | null {
    const m = this.rect;
    if (!m || sx < m.x - 4 || sy < m.y - 4 || sx > m.x + m.w + 4 || sy > m.y + m.h + 4) return null;
    const vx = MAP_X0 + (sx - m.x) / m.k, vyy = MAP_Y0 + (sy - m.y) / m.k;
    return { x: Math.round(vx * FP), y: Math.round((this.flip ? VIEW_FLIP_Y - vyy : vyy) * FP) };
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
