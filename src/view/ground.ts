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
import { hexDist } from '../sim/hex';
import { baseTile, type ThemeKey, type Tile } from '../sim/map';
import { GUARD, TEAM_BLUE, TEAM_RED, TEAMS } from '../sim/rules';
import type { Camera } from './camera';
import { Pen, sharedCtx } from './pen';
import { LOOK_B } from './lookB';
import { SKINS, skinFor, type MapSkin } from './skins';

/** Hexes from a castle: the home country, then the open field; past that is the contested middle. */
const HOME_BAND = 4, FIELD_BAND = 8;
import type { Pt } from './viewConst';

/** The backdrop around the map, for the renderer's clear colour. */
export const groundBg = (theme: ThemeKey, seed: number): string => skinFor(theme, seed).bg;

/** A team's ground, and the line along its front. The reference (D:/new/ref) makes the two sides
 *  deliberately *unequal*, and that is the whole idea: the enemy's land is the alarm -- louder and
 *  lighter than the bare ground (saturation 0.71 at value 0.93 over sand at 0.58/0.86) -- while
 *  your own land is calm, cool and *darker* than the ground (0.31 at 0.71). You glance at the board
 *  and the only thing shouting is the half you are losing. Matched washes, which is what we had,
 *  make the player read two equally loud fields and work out which one is theirs.
 *
 *  The line is the loudest mark anywhere in the game and the only near-pure colour in it: #3399ff
 *  and #ff3333, sitting on the edge itself (LINE_IN), not tucked inside the tile. A dark border is
 *  a seam between two fills; a bright one is a front. Everything else on the board is a tint by
 *  comparison, which is what lets one hairline do the work sixty bevels were doing before.
 *
 *  The two shades are all but the same colour now: the sim's per-tile checker is still there, but
 *  a territory in the reference is one unbroken field, so inside it the checker is felt and not
 *  seen (the grid stops at the border too, ground.ts tileCtx).
 *  See DECISIONS.md D85, D86, D87. */
export const TEAM_HUE: Record<number, { top: readonly [string, string]; line: string }> = LOOK_B
  ? {
      // lookB: enemy red lifted off the sand, own blue sunk below it, both lines near-pure
      [TEAM_BLUE]: { top: ['#7e9fb6', '#7c9db4'], line: '#3399ff' },
      [TEAM_RED]: { top: ['#ee6745', '#ed6745'], line: '#ff3333' },
    }
  : {
      [TEAM_BLUE]: { top: ['#8eaed6', '#88a8d1'], line: '#2c55a0' },
      [TEAM_RED]: { top: ['#eaa292', '#e69a89'], line: '#b13a2a' },
    };

/** How thick a tile is: what shows below it along the map's rim (view units). Only the rim shows
 *  it now -- the tiles meet edge to edge, so a lower row's top covers the side of the row above. */
const SIDE_H = LOOK_B ? 0.26 : 0.16;
/** The tiles tile exactly: no gap, no carved block, one continuous plane. A board of separate
 *  blocks -- each with a lit bevel, a shaded groove and wood grain under its paint -- is sixty
 *  drawn lines and a texture on every hex on screen. The reference board (D:/new/ref) is a flat
 *  plane with a hairline grid, and reads quiet at far *higher* chroma for it: it is the texture and
 *  the value noise that tire the eye, not the colour. See DECISIONS.md D87. */
const TILE_R = LOOK_B ? 1.0 : 1.01;

/** One tile: a flat fill, plus on unowned ground a hairline of the ground a shade darker, so the
 *  hex grid is still legible. Two neighbours stroke their shared edge with the same hairline in the
 *  same place, so the grid stays one line wide. Inside a territory `grid` is null: a team's land is
 *  one unbroken field of colour, which is what makes its border the thing the eye lands on. */
function tileCtx(side: string, top: string, obst: boolean, grid: string | null, water: boolean) {
  return sharedCtx(`tile|${side}|${top}|${obst ? 1 : 0}|${grid ?? '-'}|${water ? 1 : 0}`, (p) => {
    p.hex(0, SIDE_H, TILE_R, side);
    p.hex(0, 0, TILE_R, top);
    if (water) {
      // a pond sunk into the board: a pale rim where it meets the bank, and two ripples, so it
      // reads as water and not as a flat blue-green hex
      p.hex(0, 0, TILE_R * 0.9, null, 'rgba(255,255,255,0.3)', 0.07);
      p.hex(0.06, 0.1, TILE_R * 0.52, 'rgba(255,255,255,0.1)');
      p.line([-0.4, -0.18, 0.1, -0.24], 'rgba(255,255,255,0.4)', 0.07, 'round');
      p.line([-0.16, 0.26, 0.36, 0.2], 'rgba(255,255,255,0.28)', 0.06, 'round');
      return;
    }
    if (grid) p.hex(0, 0, TILE_R, null, grid, LOOK_B ? 0.03 : 0.035);
    if (obst) p.hex(0, 0, TILE_R * 0.94, 'rgba(60,40,20,0.05)');
  });
}

/** Border width and how far inside its tile a team's border line runs, view units. The reference
 *  draws the front as a bright, nearly pure line sitting on the edge itself -- the one fully
 *  saturated mark on the board. Ours was a dark line tucked well inside the tile, which reads as a
 *  seam between two fills rather than as a front between two countries. */
const LINE_W = LOOK_B ? 0.16 : 0.1;
const LINE_IN = LOOK_B ? 0.95 : 0.91;

export class GroundLayer {
  readonly root = new Container({ isRenderGroup: true });
  private tiles: Graphics[] = [];
  private borders = new Graphics();
  private borderPen = new Pen(this.borders.context);
  private rings = new Graphics();
  private ringPen = new Pen(this.rings.context);
  private owner = new Int8Array(0);
  /** Per tile: which band of the map it is in (0 home, 1 field, 2 the contested middle), and
   *  whether this skin paints it as water. Both static for the match. */
  private zone = new Int8Array(0);
  private water = new Uint8Array(0);
  private skin: MapSkin = SKINS[0]!;
  /** Per tile, its neighbours' tile indexes and the shared edge's two corners (view units). */
  private edges: { j: number; a: Pt; b: Pt }[][] = [];

  /** New match or new side: one Graphics per tile, in view-y order. */
  build(eng: Engine, cam: Camera): void {
    for (const g of this.tiles) g.destroy();
    this.root.removeChildren();
    const order = eng.tiles.map((t) => t.i).sort((a, b) => cam.tv[a]!.y - cam.tv[b]!.y || a - b);
    this.tiles = new Array<Graphics>(eng.tiles.length);
    this.owner = new Int8Array(eng.tiles.length).fill(-2);
    this.skin = skinFor(eng.themeKey, eng.config.seed);
    const homes = TEAMS.map((tm) => eng.tiles[baseTile(tm)]!);
    this.zone = new Int8Array(eng.tiles.length);
    this.water = new Uint8Array(eng.tiles.length);
    for (const t of eng.tiles) {
      const d = Math.min(...homes.map((h) => hexDist(t.c, t.r, h.c, h.r)));
      this.zone[t.i] = d <= HOME_BAND ? 0 : d <= FIELD_BAND ? 1 : 2;
      // ponds take the place of the rocks (ice in the snow), never of open ground
      this.water[t.i] = this.skin.water && (t.obst === 'rock' || t.obst === 'ice') ? 1 : 0;
    }
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
      // One dark dash, not a dark rim under a bright one. A white dash is a line that only exists
      // on a dark board -- at 0.42 over the snow themes' home band (#f4ead1) it lifts the luminance
      // by 9/255, under 4% Weber contrast -- and every board is lighter now (skins.ts), so the dark
      // pass is the one that carries. Two passes on a ring that crosses most of the map was a
      // second honeycomb drawn over the first (D86).
      p.dashedCircle(v.x, v.y, GUARD.leash / FP, 0.3, 0.25, 'rgba(36,24,10,0.26)', 0.085);
    }
    this.update(eng);
  }

  /** Swaps the look of every tile that changed hands, then redraws the borders. */
  update(eng: Engine): void {
    let dirty = false;
    for (const t of eng.tiles) {
      if (this.owner[t.i] === t.owner) continue;
      this.owner[t.i] = t.owner;
      this.tiles[t.i]!.context = this.lookOf(t);
      dirty = true;
    }
    if (dirty) this.drawBorders(eng);
  }

  private lookOf(t: Tile) {
    const sk = this.skin;
    const k = t.shade ? 1 : 0;
    const wet = this.water[t.i] ? sk.water : null;
    const th = wet ? undefined : TEAM_HUE[t.owner];
    const top = wet ? wet[0] : th ? th.top[k]! : sk.top[this.zone[t.i]!]![k]!;
    return tileCtx(wet ? wet[1] : sk.side, top, !!t.obst, th || wet ? null : sk.grid, !!wet);
  }

  /** Along every edge where an owned tile meets a tile its team does not own, a line in the
   *  team's colour just inside the owned tile (two rivals' borders run side by side). */
  private drawBorders(eng: Engine): void {
    const p = this.borderPen.clear();
    for (const t of eng.tiles) {
      const th = TEAM_HUE[t.owner];
      if (!th) continue;
      for (const e of this.edges[t.i]!) {
        if (e.j >= 0 && eng.tiles[e.j]!.owner === t.owner) continue;
        p.line([e.a.x, e.a.y, e.b.x, e.b.y], th.line, LINE_W, 'round');
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
