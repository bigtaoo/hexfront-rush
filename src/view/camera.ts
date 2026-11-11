// The camera: screen layout (HUD bands, play area), the zoom, and the view point it glides to.
// Two zooms: play (about VIEW_HEXES x VIEW_ROWS on screen, the camera pans) and the overview (the
// whole map, nothing pans); `zoomK` glides between them. Where the whole map fits at play zoom
// there is only the one.
// View units: one hex radius = 1, y flipped for the red side so forward is always up.

import type { Engine } from '../sim/engine';
import { FP, ticks } from '../sim/fixed';
import { baseTile } from '../sim/map';
import { enemyOf, INTRO_TICKS, PHASE_INTRO, TEAM_BLUE, TEAM_RED } from '../sim/rules';
import { LOOK_B, LOOKB_VIEW } from './lookB';
import { MAP_X0, MAP_X1, MAP_Y0, MAP_Y1, SQRT3, VIEW_FLIP_Y, VIEW_HEXES, VIEW_ROWS, type Pt } from './viewConst';

/** The menu's match: between play zoom (0) and the whole map (1); lookB's toys want a closer look. */
const DEMO_ZOOM = LOOK_B ? 0.45 : 1;
/** The menu backdrop: the board covers this much of the screen, the table frames the rest, and the
 *  zoom never goes further than COVER_MAX times the play zoom (very wide screens keep more table). */
const COVER_W = 0.8;
const COVER_H = 0.92;
const COVER_MAX = 1.8;
/** The two HUD bars are sized for a phone or bigger. On a screen too short for them they shrink
 *  together to this share of it, so there is always a play area left between them. */
const BAR_SHARE = 0.45;

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
  /** The whole map is on screen: no camera motion, no edge markers. */
  fitAll = true;
  /** The player asked for the whole map (the overview button, Space, a pinch). */
  overview = false;
  /** 0 = play zoom .. 1 = overview, gliding towards `overview`. */
  zoomK = 0;
  /** The scale at which the board fills the menu's screen, table.ts framing it (COVER_W / COVER_H). */
  coverScale = 1;
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
    this.overview = false;
    this.zoomK = 0;
  }

  /** The overview is worth having: the play zoom leaves part of the map off screen. */
  get canZoom(): boolean {
    return !this.demo && this.playScale > this.fitScale * 1.05;
  }
  /** Zoom out to the whole map, or back in (centred on `at`, a view point, when given). */
  setOverview(on: boolean, at?: Pt): void {
    if (on && !this.canZoom) return;
    this.overview = on;
    if (!on && at) {
      const c = this.clamp(this.playScale, at.x, at.y);
      this.camGoal = c;
    }
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
    const top = Math.max(58, Math.min(78, H * 0.085)), bot = Math.max(64, Math.min(92, H * 0.1));
    // A thumbnail-sized frame (a portal's preview panel, a window dragged nearly shut) is shorter
    // than the two bars together. Taken as they are, the play area between them comes out negative
    // and so does every scale drawn from it: the board would be drawn mirrored and inside out, and
    // the camera clamp would collapse. The bars give way instead. Above about 270 px tall they
    // never do, so this changes nothing on a phone or a monitor.
    const squeeze = Math.min(1, (H * BAR_SHARE) / (top + bot));
    this.hudTop = top * squeeze;
    this.hudBot = bot * squeeze;
    const availH = Math.max(1, H - this.hudTop - this.hudBot - 8);
    const availW = Math.max(1, W - 12);
    const fit = Math.min(availW / (MAP_X1 - MAP_X0), availH / (MAP_Y1 - MAP_Y0));
    const vh = LOOK_B ? LOOKB_VIEW.hexes : VIEW_HEXES, vr = LOOK_B ? LOOKB_VIEW.rows : VIEW_ROWS;
    const zoom = Math.min(availW / (SQRT3 * vh), availH / (1.5 * vr + 1.5));
    this.fitScale = fit;
    this.playScale = Math.max(fit, zoom);
    this.availH = availH;
    this.viewCY = this.hudTop + 4 + availH / 2;
    this.coverScale = Math.max((W * COVER_W) / (MAP_X1 - MAP_X0), (H * COVER_H) / (MAP_Y1 - MAP_Y0));
    this.setScale(this.zoomScale());
  }
  /** The scale for the current zoomK (eased, geometric between the two zooms). The menu's backdrop
   *  also fills its screen: the map is a tall column, so at the demo zoom alone the table took half
   *  of a 16:9 opening frame. */
  private zoomScale(): number {
    const k = this.zoomK, e = k * k * (3 - 2 * k);
    const s = this.playScale * Math.pow(this.fitScale / this.playScale, e);
    return this.demo ? Math.max(s, Math.min(this.coverScale, this.playScale * COVER_MAX)) : s;
  }
  private setScale(sc: number): void {
    this.scale = sc;
    this.fitAll = sc <= this.fitScale * 1.02;
    if (this.cam) this.placeCamera(this.cam.x, this.cam.y);
  }

  /** A camera centre kept on the map at a given scale. */
  private clamp(scale: number, x: number, y: number): Pt {
    const hw = this.W / 2 / scale, hh = this.bandH / 2 / scale;
    x = MAP_X1 - MAP_X0 <= 2 * hw ? (MAP_X0 + MAP_X1) / 2 : Math.max(MAP_X0 + hw, Math.min(MAP_X1 - hw, x));
    y = MAP_Y1 - MAP_Y0 <= 2 * hh ? (MAP_Y0 + MAP_Y1) / 2 : Math.max(MAP_Y0 + hh, Math.min(MAP_Y1 - hh, y));
    return { x, y };
  }
  /** The band the map is drawn in: a match keeps it between the HUD bars, the menu's backdrop has
   *  the whole screen (the menu draws its own buttons over it). */
  private get bandH(): number {
    return this.demo ? this.H : this.availH;
  }
  private get bandCY(): number {
    return this.demo ? this.H / 2 : this.viewCY;
  }
  /** Clamp a camera centre to the map and derive the screen offsets from it. */
  placeCamera(x: number, y: number): void {
    ({ x, y } = this.clamp(this.scale, x, y));
    this.cam = { x, y };
    this.ox = this.W / 2 - x * this.scale;
    this.oy = this.bandCY - y * this.scale;
  }
  /** The enemy castle for the first beat of the intro, then a little ahead of the own castle
   *  (forward is always up), then wherever the player dragged it or jumped to (an edge marker, a
   *  tap in the overview). */
  private goal(eng: Engine): Pt {
    const me = this.local;
    if (eng.phase === PHASE_INTRO && eng.introT > INTRO_TICKS - ticks(1.3)) return this.tv[baseTile(enemyOf(me))]!;
    if (eng.phase === PHASE_INTRO || !this.camGoal) {
      const b = this.tv[baseTile(me)]!;
      if (LOOK_B && eng.phase !== PHASE_INTRO) {
        // lookB: the middle of the own buildings (the castle counts thrice), a little ahead
        let sx = b.x * 3, sy = b.y * 3, n = 3;
        for (const bd of eng.blds) {
          if (bd.team !== me || bd.hp <= 0) continue;
          const v = this.tv[bd.tile]!;
          sx += v.x;
          sy += v.y;
          n++;
        }
        return { x: sx / n, y: sy / n - 1.6 };
      }
      return { x: b.x, y: b.y - 2.2 };
    }
    return this.camGoal;
  }
  /** The menu's match: where the troops are (their middle), drifting slowly; the map's middle
   *  while there are none. */
  private demoGoal(eng: Engine): Pt {
    let sx = 0, sy = 0, n = 0;
    for (const u of eng.units) {
      if (u.hp <= 0) continue;
      sx += u.x;
      sy += u.y;
      n++;
    }
    if (!n) return { x: (MAP_X0 + MAP_X1) / 2, y: (MAP_Y0 + MAP_Y1) / 2 };
    return this.view(sx / n, sy / n);
  }
  /** Drag the map by a screen-pixel delta: the camera follows the finger 1:1. */
  panBy(dx: number, dy: number): void {
    if (!this.cam || this.fitAll) return;
    this.placeCamera(this.cam.x - dx / this.scale, this.cam.y - dy / this.scale);
    this.camGoal = { x: this.cam.x, y: this.cam.y };
  }
  /** Glide to a view point at play zoom (an edge marker tap). */
  lookAt(vx: number, vy: number): void {
    if (!this.cam) return;
    this.overview = false;
    this.camGoal = this.clamp(this.playScale, vx, vy);
  }
  update(eng: Engine, dt: number, demo: boolean): void {
    if (demo !== this.demo) {
      this.demo = demo;
      this.overview = false;
      this.zoomK = demo ? DEMO_ZOOM : 0;
      this.setScale(this.zoomScale());
    }
    if (!demo) {
      const want = this.overview ? 1 : 0;
      if (this.zoomK !== want) {
        const k = this.zoomK + (want - this.zoomK) * (1 - Math.exp(-dt * 9));
        this.zoomK = Math.abs(want - k) < 0.003 ? want : k;
        this.setScale(this.zoomScale());
      }
    }
    const g = demo ? this.demoGoal(eng) : this.goal(eng);
    if (!this.cam) {
      this.placeCamera(g.x, g.y);
      return;
    }
    const k = 1 - Math.exp(-dt * (demo ? 0.6 : eng.phase === PHASE_INTRO ? 2.2 : 5));
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
