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
import { SQUASH, type Pt } from './viewConst';

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
 *  GRID_W IS MEASURED, AND IT IS A HAIRLINE. Counted properly this time: every column of two of the
 *  reference's forest boards (D:/new/ref IMG_3717 rows 1700-2300, IMG_3707 rows 1500-2200) is walked
 *  and every dark run that closes a prop-free 136 px cell is measured -- 292 and 229 cells, and both
 *  frames put the line at a MEDIAN OF 5 PIXELS, 0.122 of value under the interior it edges. Its
 *  board is squashed to 0.87, so 5 px across a horizontal edge is 5.75 px of real depth against a
 *  hex radius of 90.5: 0.064 of a radius, which on ours (radius 65.4 device px at a phone's zoom) is
 *  4.2 px. This number went to 0.11 once, off a single scan that read "11 px of line" -- that scan
 *  crossed a corner where three hexes meet and their strokes join, which is the widest the line ever
 *  is and not the line. One scan is not a measurement; 521 cells are.
 *
 *  So the honeycomb is a hairline a tenth down, and what closes a cell is the lit rim below as much
 *  as the line. The first cut drew it at 0.03 and 5% down -- a quarter of the ink, and at a phone's
 *  zoom the honeycomb simply was not there; the second went to 14% down off a shadowed patch of the
 *  reference's sand, which inked an outline on every hex. See DECISIONS.md D88, D89, D110. */
const GRID_W = LOOK_B ? 0.064 : 0.035;

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

/** The lit lip along a tile's two LOWER edges, and THE ONLY SHADING A TILE HAS. Measured three
 *  times now, and this is the first reading taken off enough of the reference to trust.
 *
 *  HOW IT WAS MEASURED THIS TIME. One scan down one column is worth nothing: D92 found a vertical
 *  gradient that is not there, D94 read +0.027 off two columns, and the third read +0.010 off a
 *  column of ours crossing the guard leash's dashed ring -- 0.13 of white, a +0.07 band across the
 *  scan, taken for the lip. So: in the reference's open forest field (D:/new/ref IMG_3717, rows
 *  1700-2300) every column is walked, its dark grid runs found, and every pair of runs 132-140 px
 *  apart with no prop between them is resampled to 69 samples and folded -- 148 cells, median, each
 *  normalised by its own interior so the patches below cannot tilt the result.
 *
 *  WHAT 148 CELLS SAY. The interior is FLAT to within 0.002 for the first 0.78 of the cell -- no
 *  gradient, and no lift at all on the upper edges, which is why the ring this used to stroke around
 *  the whole hex at +0.012 is gone. Then a RAMP over the last 0.23: +0.006, +0.012, +0.018, +0.024,
 *  peaking at +0.025 four px before the line and easing back to +0.017 at it. So the lift is +0.025
 *  of value, absolute (the grid line's own step, skins.ts), directional -- a lit bottom rim is a
 *  thickness where a ring is an outline -- and a RAMP, not a step.
 *  A step is what one band draws, and at this depth the eye reads a single band as a drawn plate.
 *  Hence RIM_N: four bands, each one deeper and a quarter dimmer, which is 0.42 of a radius of ramp
 *  (the measured 0.23 of a cell's height, turned back into a depth perpendicular to a 30-degree
 *  edge) for four polygon fills in a context that is cached per colour.
 *
 *  D87 was right to delete the bevel it found -- a hard lit edge on three sides, a shaded groove on
 *  the other three, wood grain and two dome highlights -- and wrong to leave nothing in its place.
 *  This is a tenth of that ink: one colour, no texture, no second hue. DECISIONS.md D87, D89, D94,
 *  D110. */
const RIM_W = 0.42, RIM_D = 0.025, RIM_N = 4;

/** The ground's patches, and the one thing a flat fill cannot fake.
 *
 *  MEASURED, not chosen (D98). Scanning the reference's open forest field (D:/new/ref, IMG_3717)
 *  along four horizontal lines and reading the plateaus between its grid lines, its bare tiles sit
 *  at four levels -- 0.441, 0.456, 0.487, 0.505 of value -- in RUNS OF THREE TO FIVE TILES: y=2030
 *  reads 488 488 488 488, then 454 454 454, then 441 441 441. Ours had a per-tile checker whose two
 *  shades are one 255th of value apart (skins.ts, which is no checker at all) over a smooth
 *  three-band zone gradient, so twenty tiles at a stretch came out one flat colour -- which is the
 *  whole of "our tiles look like pure colour painted on".
 *
 *  So seeded spots are scattered over the board and every tile takes its nearest spot's level as an
 *  absolute step of value -- a Voronoi, not a block grid, because the reference's patches have
 *  ragged hex outlines where a block grid draws rectangles.
 *
 *  AND THE STEP IS HALF WHAT IT WAS, over patches two-thirds the size (D134). Fifteen spots over
 *  325 tiles is twenty-odd tiles a patch and the extremes were 0.048 of value apart, so a top patch
 *  meeting a bottom one drew one straight boundary twenty tiles long with a 5% step across it: in
 *  the open field beside the home castle that reads as a seam, and it is the one thing on the board
 *  a player asked about. The reference's own runs are three to five tiles, so the spots go to 24
 *  and the span to 0.026, inside the 0.015-to-0.031 its adjacent tiers sit at. More edges at half
 *  the step is texture; fewer at twice the step is a join.
 *
 *  AND THEY ARE CENTRED ON THE SKIN, NOT STACKED ON IT (D115). This note held for ten versions that
 *  the skins' green was the reference's FLOOR, so the steps only went up. Read by the MODAL colour
 *  of each bare cell at FULL resolution (a resize blends the extremes in, which is how the old
 *  reading went wrong), the reference's forest is two populations, 0.486 (#347c72) and 0.443
 *  (#357167), over a dark tier at 0.396 and 0.322: 0.441 is its MIDDLE, and skins.ts's zones --
 *  0.478, 0.439, 0.396 -- sit on those tiers already. A ramp that only went up lifted the board
 *  0.022 clear of its own skin. So the three keep their measured shape, shifted down by their own
 *  mean: the skin is their CENTRE.
 *
 *  And the levels are dealt out k % 3, not rolled: rolling them put eleven of the then sixteen
 *  spots on the brightest level on seed 2 -- 237 of 325 tiles, which is not patchiness but the
 *  whole board lifted, with a few dark corners. Dealing holds the mean at zero while the spots'
 *  positions, which are rolled, still make every board different.
 *
 *  Territory tiles are left flat: the reference's own are one colour end to end (teamLook). */
export const PATCH_N = 24, PATCH_D = [-0.012, -0.002, 0.014] as const;

/** Which patch each tile fell in: nearest of PATCH_N spots scattered over the board from the map
 *  seed, so both clients of one match lay the same patches (nothing here is networked). */
export function groundPatches(tiles: readonly Tile[], seed: number): Int8Array<ArrayBuffer> {
  const out = new Int8Array(tiles.length);
  // murmur3's finalizer, not one multiply: one multiply left the top bits unmixed and on seed 2
  // all sixteen spots drew a level from the outer thirds, so the board came out with two levels
  // and not three (163 tiles / 0 / 162).
  const rnd = (n: number) => {
    let h = seed ^ Math.imul(n, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
  };
  const xs = tiles.map((t) => t.x), ys = tiles.map((t) => t.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const spots = Array.from({ length: PATCH_N }, (_, k) => ({
    x: x0 + rnd(k * 3 + 1) * (x1 - x0),
    y: y0 + rnd(k * 3 + 2) * (y1 - y0),
    lv: k % PATCH_D.length,
  }));
  for (const t of tiles) {
    let lv = 1, best = Infinity;
    for (const s of spots) {
      const d = (t.x - s.x) ** 2 + (t.y - s.y) ** 2;
      if (d < best) {
        best = d;
        lv = s.lv;
      }
    }
    out[t.i] = lv;
  }
  return out;
}

/** The same colour, `d` of value brighter, hue and saturation untouched: scaling every channel by
 *  (v + d) / v is what adds value without adding grey. */
function vAdd(hex: string, d: number): string {
  return vUp(hex, 1 + d / Math.max(val(hex), 1e-6));
}

/** Saturation up by a factor: the max channel stays where it is and the others are pushed away
 *  from it, which is the one move that changes a colour's saturation and nothing else about it. */
export function vSat(hex: string, f: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const m = Math.max(...c);
  const out = c.map((x) => Math.max(0, Math.min(255, Math.round(m - (m - x) * f))));
  return `#${out.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** What a skin's grid line says, read off the one zone it was written against. A skin writes the
 *  line as a COLOUR beside its home zone's top (skins.ts), and a colour beside one zone is two
 *  numbers about every zone: how far under its tile the line sits, and how much more saturated it
 *  is than the ground it cuts. Both are re-applied per tile in lookOf, so the line keeps saying
 *  the same thing over ground the skin never wrote a colour for.
 *
 *  The saturation half is not decoration, and deriving the line by value alone drops it: scaling
 *  a colour's channels together moves its value and leaves its saturation exactly where it was.
 *  The reference's own line is a touch more saturated than its ground -- #2e82b7 against #348cbf
 *  in the territory it edges (D:/new/ref IMG_3717), 0.749 of saturation against 0.728, a
 *  thirty-fifth up -- and that is the difference between a line that reads as the ground's own
 *  seam and one that reads as a shadow lying on it. The meadow boards take a fiftieth, desert and
 *  snow an eighth (skins.ts).
 *
 *  Cached per skin: a board asks for this once per tile per repaint and the answer never moves. */
const gridSay = new Map<string, { drop: number; sat: number }>();
function dropOf(sk: MapSkin): { drop: number; sat: number } {
  let d = gridSay.get(sk.key);
  if (!d) {
    const t = sk.top[0][0]!;
    d = { drop: val(t) - val(sk.grid), sat: satOf(sk.grid) / Math.max(satOf(t), 1e-6) };
    gridSay.set(sk.key, d);
  }
  return d;
}

/** A colour's saturation (HSV's), 0..1. Only #rrggbb goes in. */
function satOf(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const m = Math.max(...c);
  return m === 0 ? 0 : (m - Math.min(...c)) / m;
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
      // outermost band last, so each one is drawn over the shallower one under it
      for (let k = RIM_N; k >= 1; k--) {
        lowerRim(p, TILE_R, (TILE_R * RIM_W * k) / RIM_N, vAdd(top, (RIM_D * (RIM_N + 1 - k)) / RIM_N));
      }
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
/** How fast a guard's leash ring comes up and goes away, in alpha per second.
 *
 *  THE RING IS NOT ON ALL MATCH ANY MORE. Two of these, 2.8 tiles in radius, are 632 device px
 *  across on an 840 px canvas -- the longest lines in the picture, drawn over half the board from
 *  the first frame to the last, where the reference (D:/new/ref) has no such ring at all. D97 cut
 *  them to a sixth of an alpha and kept them, "because it is the only drawing of where a castle
 *  guard will walk back to", and that reason is sound but it is not a reason to draw them while
 *  nothing is happening: the leash only tells the player anything at the moment a guard is
 *  chasing somebody, and that is the one moment the sim already knows about (guard.ts sets
 *  `aim` to the intruder it found inside leash + range). So each team's ring is its own Graphics
 *  and comes up only then. In goes fast enough to be there before the chase reads as a chase, out
 *  is slow enough not to blink when the guard loses its target for a tick. D112. */
const RING_IN = 4, RING_OUT = 1.2;
const LINE_IN = LOOK_B ? 0.95 : 0.91;

export class GroundLayer {
  readonly root = new Container({ isRenderGroup: true });
  private tiles: Graphics[] = [];
  private borders = new Graphics();
  private borderPen = new Pen(this.borders.context);
  /** The guard leashes, one Graphics per team: each shows only while its own guard is chasing. */
  private rings: { g: Graphics; team: number; on: number }[] = [];
  private owner = new Int8Array(0);
  /** Per tile: which band of the map it is in (0 home, 1 field, 2 the contested middle), and
   *  whether this skin paints it as water. Both static for the match. */
  private zone = new Int8Array(0);
  private water = new Uint8Array(0);
  /** Per tile, which of the three ground patches it fell in (PATCH_D). Static for the match. */
  private patch = new Int8Array(0);
  private skin: MapSkin = SKINS[0]!;
  /** Per tile, its neighbours' tile indexes and the shared edge's two corners (view units). */
  private edges: { j: number; a: Pt; b: Pt }[][] = [];

  /** New match or new side: one Graphics per tile, in view-y order. */
  build(eng: Engine, cam: Camera): void {
    for (const g of this.tiles) g.destroy();
    for (const r of this.rings) r.g.destroy();
    this.root.removeChildren();
    const order = eng.tiles.map((t) => t.i).sort((a, b) => cam.tv[a]!.y - cam.tv[b]!.y || a - b);
    this.tiles = new Array<Graphics>(eng.tiles.length);
    this.owner = new Int8Array(eng.tiles.length).fill(-2);
    this.skin = skinFor(eng.themeKey, eng.config.seed);
    const homes = TEAMS.map((tm) => eng.tiles[baseTile(tm)]!);
    this.zone = new Int8Array(eng.tiles.length);
    this.water = new Uint8Array(eng.tiles.length);
    this.patch = groundPatches(eng.tiles, eng.config.seed);
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
        const mx = v.x + Math.cos(ang) * 0.866, my = v.y + Math.sin(ang) * 0.866 * SQUASH;
        const j = t.nb.find((n) => {
          const w = cam.tv[n]!;
          return Math.abs(w.x - (2 * mx - v.x)) < 0.05 && Math.abs(w.y - (2 * my - v.y)) < 0.05;
        }) ?? -1;
        const a0 = ang - Math.PI / 6, a1 = ang + Math.PI / 6;
        out.push({
          j,
          a: { x: v.x + Math.cos(a0) * LINE_IN, y: v.y + Math.sin(a0) * LINE_IN * SQUASH },
          b: { x: v.x + Math.cos(a1) * LINE_IN, y: v.y + Math.sin(a1) * LINE_IN * SQUASH },
        });
      }
      return out;
    });
    this.root.addChild(this.borders);
    // One dash, not a dark rim under a bright one: two passes on a ring that crosses most of the
    // map was a second honeycomb drawn over the first (D86). Which way the one dash leans is the
    // board's to decide, not a constant. A dark dash was picked when every board was light, and
    // it is still right on sand; on the reference's own forest green (value 0.44, D91) it is a
    // dark line on a dark field and simply is not there. So it takes the home band's value and
    // goes the other way -- a pale dash over a dark board, a dark one over a light board.
    const pale = val(this.skin.top[0][0]) < 0.6;
    const ink = pale ? 'rgba(226,236,230,0.17)' : 'rgba(36,24,10,0.15)';
    this.rings = TEAMS.map((tm) => {
      const g = new Graphics();
      const v = cam.tv[baseTile(tm)]!;
      new Pen(g.context).dashedCircle(v.x, v.y, GUARD.leash / FP, 0.3, 0.25, ink, 0.085);
      g.alpha = 0;
      this.root.addChild(g);
      return { g, team: tm as number, on: 0 };
    });
    this.update(eng);
  }

  /** Swaps the look of every tile that changed hands, redraws the borders, and fades each guard's
   *  leash in or out. */
  update(eng: Engine, dt = 0): void {
    for (const r of this.rings) {
      const g = eng.guards[r.team]!;
      const want = !g.dead && g.aim !== 0 ? 1 : 0;
      r.on = want > r.on ? Math.min(1, r.on + dt * RING_IN) : Math.max(0, r.on - dt * RING_OUT);
      r.g.alpha = r.on;
    }
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
    const base = wet ? wet[0] : th ? th.top[k]! : sk.top[this.zone[t.i]!]![k]!;
    const lift = wet || th ? 0 : PATCH_D[this.patch[t.i]!]!;
    const top = vAdd(base, lift);
    // The grid line is a DISTANCE under the tile it edges, not a colour: it is mixed off this
    // tile's own top, zone and ground patch and all. A skin writes the number as a colour
    // against its home zone (skins.ts), which is only that zone's answer -- read back as a drop
    // and re-applied here it holds over the whole board. Measured on the rendered seed-2 frame,
    // a fixed `sk.grid` put the line 0.113 of value under the home country and 0.078 under the
    // middle of the map, against the 0.120 the reference holds everywhere; by the skins' own
    // arithmetic the contested middle, whose top is 0.082 lower than home's, got 0.039 -- a line
    // the eye cannot find, which is the board with no honeycomb in the middle of it. D110.
    const say = dropOf(sk);
    const grid = wet ? null : th ? th.grid : vSat(vAdd(base, lift - say.drop), say.sat);
    return tileCtx(wet ? wet[1] : sk.side, top, !!t.obst, grid, !!wet);
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
