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
import { grain, GRAIN_VARIANTS } from './grain';
import { hexPts, Pen, sharedCtx } from './pen';
import { LOOK_B } from './lookB';
import { SKINS, skinFor, type MapSkin } from './skins';

/** Hexes from a castle: the home country, then the open field; past that is the contested middle. */
const HOME_BAND = 4, FIELD_BAND = 8;
import type { Pt } from './viewConst';

/** The backdrop around the map, for the renderer's clear colour. */
export const groundBg = (theme: ThemeKey, seed: number): string => skinFor(theme, seed).bg;

/** A team's ground: mid-tone tops (two shades) and the border line in the full hue. A full team
 *  fill turned the map into a sheet of blue that swallowed the blue roofs, and a pale pastel left
 *  the white offer symbols with nothing to stand out against; mixing the hue into the theme's
 *  ground turned blue on sand grey, so the tone is the same on every theme.
 *
 *  Held high and light, not pale: saturation 0.42-0.44 at value 0.90, against the 0.24-0.31 these
 *  were first set to, which was half of what the reference board (art/ref/screen_gen_b.png) gives
 *  its two territories. The old pair was the failure the comment above warns about, from the other
 *  side: territory that is the player's own half of the board stopped reading as blue land at all.
 *  Value is what keeps the roofs and the troops on top of it -- the field stays lighter than
 *  anything standing on it -- so the hue can go up without the field swallowing them. */
export const TEAM_HUE: Record<number, { top: readonly [string, string]; line: string }> = LOOK_B
  ? {
      // lookB: a clear team field (the buildings stand on their pale yard and the troops on their
      // bases, so the field no longer swallows them), the border carries the darker colour
      [TEAM_BLUE]: { top: ['#86b2e6', '#81abdd'], line: '#2c55a0' },
      [TEAM_RED]: { top: ['#eea286', '#e59c81'], line: '#b13a2a' },
    }
  : {
      [TEAM_BLUE]: { top: ['#8eaed6', '#88a8d1'], line: '#2c55a0' },
      [TEAM_RED]: { top: ['#eaa292', '#e69a89'], line: '#b13a2a' },
    };

/** How thick a tile is: what shows below it along the map's rim (view units). The old 0.16 read as
 *  a drawn outline rather than as a board with a side to it. */
const SIDE_H = LOOK_B ? 0.26 : 0.16;
/** A tile's bevel, the one thing that makes it a block and not a fill: the light stands upper left
 *  (lookB.ts), so the three edges facing it catch it and the three facing away fall into shade.
 *  Corner k sits at 60k - 30 degrees, so 5 is the top and 2 the bottom: 3-4-5-0 faces the light. */
const TILE_R = LOOK_B ? 0.975 : 1.01;
const BEVEL_R = LOOK_B ? 0.915 : 0.945;
function bevel(ks: readonly number[]): number[] {
  const c = hexPts(0, 0, BEVEL_R), out: number[] = [];
  for (const k of ks) out.push(c[k * 2]!, c[k * 2 + 1]!);
  return out;
}
const LIT_EDGE = bevel([3, 4, 5, 0]), SHADE_EDGE = bevel([0, 1, 2, 3]);

/** Each tile is its own block set into the board: cut back to TILE_R, so the slab's groove floor
 *  (table.ts SLAB) shows between them. A gap filled with a drawn *line* once made a heavy honeycomb
 *  over the map; a gap that shows a lit side and a shaded groove reads as carved instead. */
function tileCtx(side: string, top: string, obst: boolean, variant: number, water: boolean) {
  return sharedCtx(`tile|${side}|${top}|${obst ? 1 : 0}|${variant}|${water ? 1 : 0}`, (p) => {
    p.hex(0, SIDE_H, TILE_R, side);
    p.hex(0, 0, TILE_R, top);
    if (water) {
      // a pond sunk into the board: no wood grain on it, a pale rim where it meets the bank, and
      // two ripples so it reads as water and not as a flat blue-green hex
      p.hex(0, 0, TILE_R * 0.9, null, 'rgba(255,255,255,0.3)', 0.07);
      p.hex(0.06, 0.1, TILE_R * 0.52, 'rgba(255,255,255,0.1)');
      p.line([-0.4, -0.18, 0.1, -0.24], 'rgba(255,255,255,0.4)', 0.07, 'round');
      p.line([-0.16, 0.26, 0.36, 0.2], 'rgba(255,255,255,0.28)', 0.06, 'round');
      p.line(SHADE_EDGE, 'rgba(20,40,42,0.26)', 0.09, 'round');
      return;
    }
    if (LOOK_B) {
      // the wood under the paint (grain.ts), stretched over the top's bounds
      p.g.poly(hexPts(0, 0, TILE_R), true).fill({ texture: grain(variant), color: 0xffffff });
      // the top is not flat: two translucent passes toward the light stand in for a gradient the
      // Pen cannot fill, so each block reads as slightly domed rather than as a cut-out colour
      p.hex(-0.05, -0.07, TILE_R * 0.78, 'rgba(255,250,232,0.09)');
      p.hex(-0.09, -0.12, TILE_R * 0.5, 'rgba(255,250,232,0.08)');
      // the bevel a step stronger than at first (0.3 / 0.22): with the grain on the top, a faint
      // edge left the blocks soft-cornered, more cushion than carved wood
      p.line(LIT_EDGE, 'rgba(255,250,234,0.42)', 0.075, 'round');
      p.line(SHADE_EDGE, 'rgba(48,32,14,0.3)', 0.09, 'round');
    } else p.hex(0, 0, 0.955, null, 'rgba(60,45,25,0.09)', 0.035);
    if (obst) p.hex(0, 0, TILE_R * 0.94, 'rgba(60,40,20,0.05)');
  });
}

/** Border width and how far inside its tile a team's border line runs, view units. */
const LINE_W = LOOK_B ? 0.15 : 0.1;
const LINE_IN = 0.91;

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
      p.dashedCircle(v.x, v.y, GUARD.leash / FP, 0.3, 0.25, 'rgba(255,255,255,0.42)', 0.06);
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
    // the grain's turn by a hash of the tile, so no row or column repeats it
    const variant = Math.imul(t.i + 1, 2654435761) >>> 0;
    return tileCtx(wet ? wet[1] : sk.side, top, !!t.obst, variant % GRAIN_VARIANTS, !!wet);
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
