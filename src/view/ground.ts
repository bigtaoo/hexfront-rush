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

/** A team's ground, and the line along its front. BOTH ARE DERIVED FROM THE GROUND THEY SIT ON,
 *  and that is the one thing a hand-written pair of colours cannot do. The reference (D:/new/ref)
 *  was read again, this time on all 122 frames instead of the one sand board, and its territories
 *  turn out to be a single rule applied to whatever the ground happens to be: the bare tile mixed
 *  about 55% toward that team's own front-line colour. Four measurements, two grounds, one mix:
 *
 *    sand   #daa75c -> red #ee6745, blue #7e9fb6
 *    forest #357167 -> red #a4544f, blue #338cbf
 *
 *  and `mix(ground, '#ff3333', 0.55)` / `mix(ground, '#3399ff', 0.55)` lands within a few units of
 *  each of those four. It also reproduces the pair this replaces, which was measured off the sand
 *  board and is therefore right there and nowhere else: on a dark board a fixed #7897ad is *paler*
 *  than the ground, and a player's own country stops reading as blue and reads as fog.
 *
 *  What looked like a deliberate inequality -- the enemy's land loud and lighter than the ground,
 *  your own calm and darker -- is this rule plus hue arithmetic, not an authored asymmetry. Both
 *  line colours are value 1.0; mixing one into warm sand raises its value (0.855 -> 0.93) and the
 *  other lowers it (-> 0.71), because sand has little blue in it to begin with. The effect is real
 *  and worth keeping, which is why it is still described here -- but it comes out of the mix for
 *  free on every skin, instead of holding only on the one the numbers were taken from.
 *
 *  The line is the loudest mark anywhere in the game and the only near-pure colour in it: #3399ff
 *  and #ff3333, sitting on the edge itself (LINE_IN), not tucked inside the tile. A dark border is
 *  a seam between two fills; a bright one is a front.
 *
 *  The hex grid does NOT stop at the border: the first cut of this dropped it inside a territory
 *  and the owned land read as one shapeless blob you could not count tiles in. `grid` is 6% down in
 *  value from the field it edges -- quieter than the line on open ground, loud enough to see a cell.
 *
 *  THERE IS NO STAMP ON A TERRITORY TILE ANY MORE. There used to be one -- a lozenge struck on
 *  every owned hex, the field pulled a third further toward the line colour and a fifth down in
 *  value -- put there so a wash over twenty hexes would read as twenty tiles you can count instead
 *  of as one shape. The reference does the same job with the grid line and nothing else: zoom its
 *  own territory (IMG_3717, the offer cluster at 1.6x) and the blue hexes are a flat #348cbf with
 *  one line between them at #2e82b7, 0.031 of value down, and not a mark inside any of them. Our
 *  grid already runs inside a territory for exactly that reason (below), so the lozenge was the
 *  same statement a second time, on up to a hundred and ten hexes at once -- and it is the kind of
 *  repeated small mark that the board was called cluttered for.
 *  See DECISIONS.md D85, D86, D87, D88, D91, D94. */
export const TEAM_LINE: Record<number, string> = LOOK_B
  ? { [TEAM_BLUE]: '#3399ff', [TEAM_RED]: '#ff3333' }
  : { [TEAM_BLUE]: '#2c55a0', [TEAM_RED]: '#b13a2a' };

/** How far a team's ground is pulled toward its own line colour: the reference's own 0.55. The
 *  legacy look (?looka) keeps its softer wash. */
const TERRITORY_MIX = LOOK_B ? 0.55 : 0.4;

export interface TeamLook {
  top: readonly [string, string];
  grid: string;
  line: string;
}
const teamLooks = new Map<string, TeamLook>();

/** A team's look on one skin's ground. Cached: a board has two of these, and a tile that changes
 *  hands asks for one every time. The field is mixed off the skin's *open field* zone, not the
 *  tile's own zone, so a territory is one colour from end to end (the reference's is). */
export function teamLook(sk: MapSkin, team: number): TeamLook {
  const key = `${sk.key}|${team}`;
  const had = teamLooks.get(key);
  if (had) return had;
  const line = TEAM_LINE[team]!;
  const top = [mix(sk.top[1][0], line, TERRITORY_MIX), mix(sk.top[1][1], line, TERRITORY_MIX)] as const;
  const look: TeamLook = {
    top,
    grid: vUp(top[0], 0.94),
    line,
  };
  teamLooks.set(key, look);
  return look;
}

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

/** A colour's value (its brightest channel, 0..1). Only #rrggbb goes in. */
export function val(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return Math.max((n >> 16) & 255, (n >> 8) & 255, n & 255) / 255;
}

/** `t` of the way from one #rrggbb colour to another. Only #rrggbb goes in. */
export function mix(a: string, b: string, t: number): string {
  const pick = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const x = pick(a), y = pick(b);
  const c = x.map((v, i) => Math.round(v + (y[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The lit lip inside a tile's edge, and THE ONLY SHADING A TILE HAS. Measured off the reference
 *  twice, on two different biomes, and the second reading is what the numbers now say.
 *
 *  On its sand (IMG_3660), scanning straight down the middle of a clean column at x=860 and again
 *  at x=900: 0.855 flat for two thirds of the tile, then a slow climb to 0.882 at the bottom edge,
 *  then five pixels of 0.827 line, then 0.855 flat again -- no climb on the far side of the line.
 *  On its forest (IMG_3717), folding ten bare hexes together, a hex 136 px tall: 0.4392 flat from
 *  the top edge down to 0.75 of the height (every sample of it, to within JPEG noise), then 0.451
 *  at 0.84, 0.467 at 0.93, then the 0.322 line.
 *
 *  Two things come out of that. The tile's inside is one constant colour -- D92 recorded a vertical
 *  gradient here, top lit and bottom shaded, and there is none; the reading was off a board-wide
 *  vignette and the gradient is in the opposite direction anyway. And the lift at the bottom edge
 *  is +0.027 of value on sand and +0.028 on forest: THE SAME ABSOLUTE STEP on a board 0.42 of value
 *  brighter, which is the grid line's rule (skins.ts) a second time. A 3.5% multiplier, which is
 *  what this was, is +0.030 on sand and +0.015 on the meadow -- half the lift on the boards that
 *  have the least light to spend and need the plate read most.
 *
 *  So it is an absolute lift now, 0.027 of value along the two lower edges in the bottom 0.3 of a
 *  radius, with the dark line above it. It is directional, which is why a symmetric ring -- the
 *  first cut of this -- still looked painted: a ring is an outline, a lit bottom rim is a
 *  thickness. The side edges get 0.012, the weak lift a scan across the tile shows, so the cell
 *  still closes on all six sides.
 *
 *  D87 was right to delete the bevel it found -- a hard lit edge on three sides and a shaded groove
 *  on the other three, plus wood grain and two dome highlights -- and wrong to leave nothing in its
 *  place. This is a tenth of that ink: three value steps, no texture, no second hue.
 *  See DECISIONS.md D87, D89, D94. */
const RIM_W = 0.3, RIM_D = 0.027, SIDE_LIP_D = 0.012;

/** The same colour, `d` of value brighter, hue and saturation untouched: scaling every channel by
 *  (v + d) / v is what adds value without adding grey. */
function vAdd(hex: string, d: number): string {
  return vUp(hex, 1 + d / Math.max(val(hex), 1e-6));
}

/** The band along a hex's two lower edges, `w` radii deep: the outer three vertices, then the same
 *  three pulled in toward the centre. Scaling a regular polygon moves every edge in by the same
 *  distance, so the band keeps an even depth. */
function lowerRim(p: Pen, r: number, w: number, col: string): void {
  const o = hexPts(0, 0, r), i = hexPts(0, 0, r - w);
  p.poly([o[6]!, o[7]!, o[4]!, o[5]!, o[2]!, o[3]!, i[2]!, i[3]!, i[4]!, i[5]!, i[6]!, i[7]!], col);
}
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
    if (grid) {
      // two steps, not a ramp: the far half of the lip at a third of the lift, the near half at all
      // of it. Three steps were not worth the stroke; one read as a drawn ring.
      p.hex(0, 0, TILE_R * 0.89, null, vAdd(top, SIDE_LIP_D), TILE_R * 0.22);
      lowerRim(p, TILE_R, TILE_R * RIM_W, vAdd(top, RIM_D * 0.55));
      lowerRim(p, TILE_R, TILE_R * RIM_W * 0.5, vAdd(top, RIM_D));
      p.hex(0, 0, TILE_R, null, grid, GRID_W);
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
      // One dash, not a dark rim under a bright one: two passes on a ring that crosses most of the
      // map was a second honeycomb drawn over the first (D86). Which way the one dash leans is the
      // board's to decide, not a constant. A dark dash was picked when every board was light, and
      // it is still right on sand; on the reference's own forest green (value 0.44, D91) it is a
      // dark line on a dark field and simply is not there. So it takes the home band's value and
      // goes the other way -- a pale dash over a dark board, a dark one over a light board.
      const pale = val(this.skin.top[0][0]) < 0.6;
      const ink = pale ? 'rgba(226,236,230,0.30)' : 'rgba(36,24,10,0.26)';
      p.dashedCircle(v.x, v.y, GUARD.leash / FP, 0.3, 0.25, ink, 0.085);
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
    const th = wet || !TEAM_LINE[t.owner] ? undefined : teamLook(sk, t.owner);
    const top = wet ? wet[0] : th ? th.top[k]! : sk.top[this.zone[t.i]!]![k]!;
    return tileCtx(wet ? wet[1] : sk.side, top, !!t.obst, wet ? null : th ? th.grid : sk.grid, !!wet);
  }

  /** Along every edge where an owned tile meets a tile its team does not own, a line in the
   *  team's colour just inside the owned tile (two rivals' borders run side by side). */
  private drawBorders(eng: Engine): void {
    const p = this.borderPen.clear();
    for (const t of eng.tiles) {
      const line = TEAM_LINE[t.owner];
      if (!line) continue;
      for (const e of this.edges[t.i]!) {
        if (e.j >= 0 && eng.tiles[e.j]!.owner === t.owner) continue;
        p.line([e.a.x, e.a.y, e.b.x, e.b.y], line, LINE_W, 'round');
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
