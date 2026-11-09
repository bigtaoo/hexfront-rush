// The ground: every tile's side and top, in the theme's shades or its owner's team colour, the
// team-coloured line along each territory's border and each castle guard's dashed home circle.
// One Graphics per tile over a shared context per look, in its own render group: a frame with no
// change costs nothing, and a tile that changes hands swaps its context and redraws the borders.
// Tiles go in view-y order (a lower row's top covers the side of the row above).
//
// The colours are the view's own (art/STYLE.md: muted, warm, no pure primaries); the sim's theme
// only says which theme it is.

import { Container, Graphics } from 'pixi.js';
import type { Engine } from '../sim/engine';
import { FP } from '../sim/fixed';
import { baseTile, type ThemeKey, type Tile } from '../sim/map';
import { GUARD, TEAM_BLUE, TEAM_RED, TEAMS } from '../sim/rules';
import type { Camera } from './camera';
import { Pen, sharedCtx } from './pen';
import type { Pt } from './viewConst';

interface GroundLook {
  /** Tile tops, two shades. */
  top: readonly [string, string];
  side: string;
  /** Around the map. */
  bg: string;
}

export const GROUND: Record<ThemeKey, GroundLook> = {
  meadow: { top: ['#97c76b', '#8dbf62'], side: '#5d8a3e', bg: '#2f4a2b' },
  desert: { top: ['#e6cb92', '#dec287'], side: '#a9844d', bg: '#5e4630' },
  snow: { top: ['#e6edf4', '#dce5ee'], side: '#8fa3b9', bg: '#36485f' },
};

/** A team's ground: tile tops (two shades), side, and the border line. */
const TEAM_GROUND = {
  [TEAM_BLUE]: { top: ['#80a9d9', '#79a2d3'], side: '#45679a', line: '#2c55a0' },
  [TEAM_RED]: { top: ['#e3927f', '#dc8a77'], side: '#a2523f', line: '#b13a2a' },
} as Record<number, { top: [string, string]; side: string; line: string }>;

function tileCtx(side: string, top: string, obst: boolean) {
  return sharedCtx(`tile|${side}|${top}|${obst ? 1 : 0}`, (p) => {
    p.hex(0, 0.16, 0.97, side);
    p.hex(0, 0, 0.95, top);
    if (obst) p.hex(0, 0, 0.95, 'rgba(60,40,20,0.06)');
  });
}

/** Border width and how far inside its tile a team's border line runs, view units. */
const LINE_W = 0.11;
const LINE_IN = 0.9;

export class GroundLayer {
  readonly root = new Container({ isRenderGroup: true });
  private tiles: Graphics[] = [];
  private borders = new Graphics();
  private borderPen = new Pen(this.borders.context);
  private rings = new Graphics();
  private ringPen = new Pen(this.rings.context);
  private owner = new Int8Array(0);
  /** Per tile, its neighbours' tile indexes and the shared edge's two corners (view units). */
  private edges: { j: number; a: Pt; b: Pt }[][] = [];

  /** New match or new side: one Graphics per tile, in view-y order. */
  build(eng: Engine, cam: Camera): void {
    for (const g of this.tiles) g.destroy();
    this.root.removeChildren();
    const order = eng.tiles.map((t) => t.i).sort((a, b) => cam.tv[a]!.y - cam.tv[b]!.y || a - b);
    this.tiles = new Array<Graphics>(eng.tiles.length);
    this.owner = new Int8Array(eng.tiles.length).fill(-2);
    for (const i of order) {
      const v = cam.tv[i]!;
      const g = new Graphics();
      g.position.set(v.x, v.y);
      this.tiles[i] = g;
      this.root.addChild(g);
    }
    // the edge a tile shares with each neighbour, and the map's own rim (no neighbour: j = -1)
    this.edges = eng.tiles.map((t) => {
      const v = cam.tv[t.i]!;
      const out: { j: number; a: Pt; b: Pt }[] = [];
      for (let k = 0; k < 6; k++) {
        // pointy-top hex (corners at 60k - 30 degrees): edge k faces 60k degrees
        const ang = (60 * k * Math.PI) / 180;
        const mx = v.x + Math.cos(ang) * 0.866, my = v.y + Math.sin(ang) * 0.866;
        const j = t.nb.find((n) => {
          const w = cam.tv[n]!;
          return Math.abs(w.x - (2 * mx - v.x)) < 0.05 && Math.abs(w.y - (2 * my - v.y)) < 0.05;
        }) ?? -1;
        const a0 = ang - Math.PI / 6, a1 = ang + Math.PI / 6;
        out.push({
          j,
          a: { x: v.x + Math.cos(a0) * LINE_IN, y: v.y + Math.sin(a0) * LINE_IN },
          b: { x: v.x + Math.cos(a1) * LINE_IN, y: v.y + Math.sin(a1) * LINE_IN },
        });
      }
      return out;
    });
    this.root.addChild(this.borders, this.rings);
    const p = this.ringPen.clear();
    for (const tm of TEAMS) {
      const v = cam.tv[baseTile(tm)]!;
      p.dashedCircle(v.x, v.y, GUARD.leash / FP, 0.3, 0.25, 'rgba(255,255,255,0.42)', 0.06);
    }
    this.update(eng);
  }

  /** Swaps the look of every tile that changed hands, then redraws the borders. */
  update(eng: Engine): void {
    const look = GROUND[eng.themeKey];
    let dirty = false;
    for (const t of eng.tiles) {
      if (this.owner[t.i] === t.owner) continue;
      this.owner[t.i] = t.owner;
      this.tiles[t.i]!.context = this.lookOf(t, look);
      dirty = true;
    }
    if (dirty) this.drawBorders(eng);
  }

  private lookOf(t: Tile, look: GroundLook) {
    const tg = TEAM_GROUND[t.owner];
    const shade = t.shade ? 1 : 0;
    return tg ? tileCtx(tg.side, tg.top[shade]!, !!t.obst) : tileCtx(look.side, look.top[shade]!, !!t.obst);
  }

  /** Along every edge where an owned tile meets a tile its team does not own, a line in the
   *  team's colour just inside the owned tile (two rivals' borders run side by side). */
  private drawBorders(eng: Engine): void {
    const p = this.borderPen.clear();
    for (const t of eng.tiles) {
      const tg = TEAM_GROUND[t.owner];
      if (!tg) continue;
      for (const e of this.edges[t.i]!) {
        if (e.j >= 0 && eng.tiles[e.j]!.owner === t.owner) continue;
        p.line([e.a.x, e.a.y, e.b.x, e.b.y], tg.line, LINE_W, 'round');
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
