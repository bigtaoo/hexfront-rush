// The camera: screen layout (HUD bands, play area), the zoom, and the view point it glides to.
// View units: one hex radius = 1, y flipped for the red side so forward is always up.

import type { Engine } from '../sim/engine';
import { FP, ticks } from '../sim/fixed';
import { baseTile } from '../sim/map';
import { enemyOf, INTRO_TICKS, PHASE_INTRO, TEAM_BLUE, TEAM_RED } from '../sim/rules';
import { MAP_X0, MAP_X1, MAP_Y0, MAP_Y1, SQRT3, VIEW_FLIP_Y, VIEW_HEXES, VIEW_ROWS, type Pt } from './viewConst';

/** Something that moves in the sim: its position now and a tick ago (FP). */
export interface Mobile {
  x: number;
  y: number;
  px: number;
  py: number;
}

export class Camera {
  W = 1;
  H = 1;
  hudTop = 58;
  hudBot = 64;
  availH = 1;
  viewCY = 0;
  fitScale = 1;
  playScale = 1;
  /** Screen pixels per view unit. */
  scale = 30;
  /** Screen position of the view origin (before shake). */
  ox = 0;
  oy = 0;
  /** The whole map is on screen: no camera motion, no minimap. */
  fitAll = true;
  /** Camera centre in view units; null = snap on the next frame. */
  cam: Pt | null = null;
  /** Where the player dragged or jumped to; null = follow the own castle. */
  camGoal: Pt | null = null;
  demo = false;
  local = TEAM_BLUE;
  flip = false;
  /** Per tile view position. */
  tv: Pt[] = [];

  setView(eng: Engine, local: number): void {
    this.local = local || TEAM_BLUE;
    this.flip = this.local === TEAM_RED;
    this.tv = eng.tiles.map((t) => ({ x: t.x / FP, y: this.vy(t.y / FP) }));
    this.cam = null;
    this.camGoal = null;
  }

  vy(y: number): number {
    return this.flip ? VIEW_FLIP_Y - y : y;
  }
  /** World fixed point -> view units. */
  view(x: number, y: number): Pt {
    return { x: x / FP, y: this.vy(y / FP) };
  }
  /** Interpolated view position of a mobile (px/py = last tick, x/y = this tick). */
  lerpPos(e: Mobile, alpha: number): Pt {
    return { x: (e.px + (e.x - e.px) * alpha) / FP, y: this.vy((e.py + (e.y - e.py) * alpha) / FP) };
  }

  resize(W: number, H: number): void {
    this.W = W;
    this.H = H;
    this.hudTop = Math.max(58, Math.min(78, H * 0.085));
    this.hudBot = Math.max(64, Math.min(92, H * 0.1));
    const availH = H - this.hudTop - this.hudBot - 8;
    const fit = Math.min((W - 12) / (MAP_X1 - MAP_X0), availH / (MAP_Y1 - MAP_Y0));
    const zoom = Math.min((W - 12) / (SQRT3 * VIEW_HEXES), availH / (1.5 * VIEW_ROWS + 1.5));
    this.fitScale = fit;
    this.playScale = Math.max(fit, zoom);
    this.availH = availH;
    this.viewCY = this.hudTop + 4 + availH / 2;
    this.setScale(this.demo ? fit : this.playScale);
  }
  private setScale(sc: number): void {
    this.scale = sc;
    this.fitAll = sc <= this.fitScale * 1.02;
    if (this.cam) this.placeCamera(this.cam.x, this.cam.y);
  }

  /** Clamp a camera centre to the map and derive the screen offsets from it. */
  placeCamera(x: number, y: number): void {
    const hw = this.W / 2 / this.scale, hh = this.availH / 2 / this.scale;
    x = MAP_X1 - MAP_X0 <= 2 * hw ? (MAP_X0 + MAP_X1) / 2 : Math.max(MAP_X0 + hw, Math.min(MAP_X1 - hw, x));
    y = MAP_Y1 - MAP_Y0 <= 2 * hh ? (MAP_Y0 + MAP_Y1) / 2 : Math.max(MAP_Y0 + hh, Math.min(MAP_Y1 - hh, y));
    this.cam = { x, y };
    this.ox = this.W / 2 - x * this.scale;
    this.oy = this.viewCY - y * this.scale;
  }
  /** The enemy castle for the first beat of the intro, then a little ahead of the own castle
   *  (forward is always up), then wherever the player dragged it or jumped to on the minimap. */
  private goal(eng: Engine): Pt {
    const me = this.local;
    if (eng.phase === PHASE_INTRO && eng.introT > INTRO_TICKS - ticks(1.3)) return this.tv[baseTile(enemyOf(me))]!;
    if (eng.phase === PHASE_INTRO || !this.camGoal) {
      const b = this.tv[baseTile(me)]!;
      return { x: b.x, y: b.y - 2.2 };
    }
    return this.camGoal;
  }
  /** Drag the map by a screen-pixel delta: the camera follows the finger 1:1. */
  panBy(dx: number, dy: number): void {
    if (!this.cam || this.fitAll) return;
    this.placeCamera(this.cam.x - dx / this.scale, this.cam.y - dy / this.scale);
    this.camGoal = { x: this.cam.x, y: this.cam.y };
  }
  /** Glide to a view point (a minimap tap, a key press). */
  lookAt(vx: number, vy: number): void {
    if (!this.cam) return;
    const keep = this.cam;
    this.placeCamera(vx, vy); // clamp the goal the way the camera is clamped
    this.camGoal = { x: this.cam.x, y: this.cam.y };
    this.placeCamera(keep.x, keep.y);
  }
  update(eng: Engine, dt: number, demo: boolean): void {
    if (demo !== this.demo) {
      this.demo = demo;
      this.setScale(demo ? this.fitScale : this.playScale);
    }
    const g = demo ? { x: (MAP_X0 + MAP_X1) / 2, y: (MAP_Y0 + MAP_Y1) / 2 } : this.goal(eng);
    if (!this.cam) {
      this.placeCamera(g.x, g.y);
      return;
    }
    const k = 1 - Math.exp(-dt * (eng.phase === PHASE_INTRO ? 2.2 : 5));
    this.placeCamera(this.cam.x + (g.x - this.cam.x) * k, this.cam.y + (g.y - this.cam.y) * k);
  }

  /** Screen pixel -> world fixed point (what the sim and worldToHex take). */
  screenToWorld(sx: number, sy: number): Pt {
    const vx = (sx - this.ox) / this.scale, vyy = (sy - this.oy) / this.scale;
    return { x: Math.round(vx * FP), y: Math.round(this.vy(vyy) * FP) };
  }
  /** View point -> screen pixel. */
  worldToScreen(x: number, y: number): Pt {
    return { x: this.ox + x * this.scale, y: this.oy + y * this.scale };
  }
}
