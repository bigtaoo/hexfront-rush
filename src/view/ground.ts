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
import { hexPts, Pen, sharedCtx } from './pen';
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
 *  it is felt and not seen. The hex grid does NOT stop at the border, though -- the first cut of
 *  this dropped it inside a territory and the owned land read as one shapeless blob you could not
 *  count tiles in. The reference draws the edge there too, at about a fiftieth of a value, which is
 *  invisible at our tile size; `grid` here is 6% down instead -- still far quieter than the 14% on
 *  open ground, loud enough to see a cell.
 *
 *  `stamp` is the mark struck on every tile of a territory, the one piece of the reference's board
 *  this had nothing at all for: it stamps a crest on each tile of its fields, #bb2421 on #ef6845 --
 *  saturation up a sixth, value down a fifth. Both of these are that ratio off their own field, so
 *  the enemy's stamp is as loud as its field is and yours stays as quiet as yours. A flat wash over
 *  twenty hexes is a shape on the map; a stamped one is twenty tiles you can count.
 *  See DECISIONS.md D85, D86, D87, D88. */
export const TEAM_HUE: Record<number, { top: readonly [string, string]; grid: string; line: string; stamp: string }> = LOOK_B
  ? {
      // lookB: enemy red lifted off the sand, own blue sunk below it, both lines near-pure
      [TEAM_BLUE]: { top: ['#7897ad', '#7695ab'], grid: '#6d8da2', line: '#3399ff', stamp: '#577387' },
      [TEAM_RED]: { top: ['#ee6745', '#ed6745'], grid: '#e05937', line: '#ff3333', stamp: '#ba4021' },
    }
  : {
      [TEAM_BLUE]: { top: ['#8eaed6', '#88a8d1'], grid: '#8098bb', line: '#2c55a0', stamp: '#6683a7' },
      [TEAM_RED]: { top: ['#eaa292', '#e69a89'], grid: '#d18e7e', line: '#b13a2a', stamp: '#b77667' },
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

/** One tile: a flat fill plus a line of its own colour a shade darker around it, so the board reads
 *  as a honeycomb of cells and not as a painted field. Two neighbours stroke their shared edge in
 *  the same place, so the grid stays one line wide.
 *
 *  GRID_W is measured, not chosen: in the reference (D:/new/ref) the line on bare sand is 5-8 px
 *  against a tile radius of 78, so a fifteenth of the radius, and it is only a thirtieth down in
 *  value from the fill it edges (0.855 -> 0.827). The first cut drew it at 0.03 and 5% down -- a
 *  quarter of the ink, and at a phone's zoom the honeycomb simply was not there; the second went to
 *  14% down off a shadowed patch, which inked an outline on every hex. What actually closes a cell
 *  in the reference is the rim below. See DECISIONS.md D88, D89. */
const GRID_W = LOOK_B ? 0.07 : 0.035;

/** The same colour, value scaled by f (1.04 is 4% lighter), clamped. Only #rrggbb goes in. */
export function vUp(hex: string, f: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.min(255, Math.round(x * f)));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** The lit lip inside a tile's edge. Measured off the reference (D:/new/ref, IMG_3660), scanning
 *  straight down the middle of a clean column of sand at x=860 and again at x=900, both the same:
 *
 *    0.855 flat for two thirds of the tile, then a slow climb to 0.882 at the bottom edge, then
 *    five pixels of 0.827 line, then 0.855 flat again -- no climb on the far side of the line.
 *
 *  So the tile's inside is one constant colour (every pixel of it), and everything that makes it
 *  read as a *plate* rather than as an area filled with paint sits in the bottom ~0.3 of a radius:
 *  a 3% lift along the two lower edges only, with the dark line above it. It is directional, which
 *  is why a symmetric ring -- the first cut of this -- still looked painted: a ring is an outline,
 *  a lit bottom rim is a thickness. The side edges get a sixth of it, the weak lift a scan across
 *  the tile shows, so the cell still closes on all six sides.
 *
 *  D87 was right to delete the bevel it found -- a hard lit edge on three sides and a shaded groove
 *  on the other three, plus wood grain and two dome highlights -- and wrong to leave nothing in its
 *  place. This is a tenth of that ink: three value steps, no texture, no second hue.
 *  See DECISIONS.md D87, D89. */
const RIM_W = 0.3, RIM_V = 1.035, SIDE_LIP_V = 1.015;

/** The band along a hex's two lower edges, `w` radii deep: the outer three vertices, then the same
 *  three pulled in toward the centre. Scaling a regular polygon moves every edge in by the same
 *  distance, so the band keeps an even depth. */
function lowerRim(p: Pen, r: number, w: number, col: string): void {
  const o = hexPts(0, 0, r), i = hexPts(0, 0, r - w);
  p.poly([o[6]!, o[7]!, o[4]!, o[5]!, o[2]!, o[3]!, i[2]!, i[3]!, i[4]!, i[5]!, i[6]!, i[7]!], col);
}
function tileCtx(side: string, top: string, obst: boolean, grid: string | null, water: boolean, stamp: string | null) {
  return sharedCtx(`tile|${side}|${top}|${obst ? 1 : 0}|${grid ?? '-'}|${water ? 1 : 0}|${stamp ?? '-'}`, (p) => {
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
    if (grid) {
      // two steps, not a ramp: the far half of the lip at a third of the lift, the near half at all
      // of it. Three steps were not worth the stroke; one read as a drawn ring.
      p.hex(0, 0, TILE_R * 0.89, null, vUp(top, SIDE_LIP_V), TILE_R * 0.22);
      lowerRim(p, TILE_R, TILE_R * RIM_W, vUp(top, 1 + (RIM_V - 1) * 0.55));
      lowerRim(p, TILE_R, TILE_R * RIM_W * 0.5, vUp(top, RIM_V));
      p.hex(0, 0, TILE_R, null, grid, GRID_W);
    }
    if (stamp) {
      // the territory's crest: a lozenge, struck a little low on the tile so a unit standing on it
      // leaves the bottom of the mark showing. It was a pair of chevrons first, which at a phone's
      // zoom read as arrows pointing up the board -- a mark that looks like a movement hint is
      // worse than no mark, so the shape it settled on is the one with no direction in it.
      p.poly([0, -0.14, 0.24, 0.14, 0, 0.42, -0.24, 0.14], null, stamp, 0.11);
    }
    if (obst) p.hex(0, 0, TILE_R * 0.94, 'rgba(60,40,20,0.05)');
  });
}

/** Border width and how far inside its tile a team's border line runs, view units. The reference
 *  draws the front as a bright, nearly pure line sitting on the edge itself -- the one fully
 *  saturated mark on the board. Ours was a dark line tucked well inside the tile, which reads as a
 *  seam between two fills rather than as a front between two countries. 0.10 is the reference's
 *  own width (11 px against a tile radius of 117); 0.16, where this started, drew a front thicker
 *  than the reference's and started to eat the corner tiles. */
const LINE_W = LOOK_B ? 0.1 : 0.1;
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
    return tileCtx(wet ? wet[1] : sk.side, top, !!t.obst, wet ? null : th ? th.grid : sk.grid, !!wet,
      wet || t.obst || !th ? null : th.stamp);
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
