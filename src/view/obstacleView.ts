// The picture on an impassable tile: a tree, a rock pile, an arch, a crystal.
//
// WHY A TILE CARRIES MORE THAN ONE PIECE. The sim puts an obstacle on 7-20% of the tiles and
// cannot put one on more (map.ts: past a fifth the pathing closes up), so a board has about 27
// of them on 325 tiles. Drawn one piece per tile that is a scatter of single objects standing in
// their own hexes with four tiles of bare ground between them, which is not what the reference
// game's (D:/new/ref) forest looks like at all: measured on IMG_3717, a single crown there is
// about 0.6 of a hex across and 1.0 of a hex tall -- almost exactly the size of ours -- but they
// come two, three and four deep, crowns overlapping each other and running over the grid lines, so
// a wooded stretch reads as ONE MASS with hexes showing through it rather than as objects placed
// on hexes. The sizes were never the gap; the count was.
//
// So a tree tile draws a little grove: the piece the sim put there, plus one or two companions
// set back and to the sides, a little smaller, from the same theme's pool. The tile is exactly as
// impassable as it was -- nothing here is read by the sim -- and the companions lean out over
// their own tile's edges on purpose, because an edge a crown crosses is what joins two tiles into
// a wood. Rock, arch and crystal tiles stay single: a boulder field is not a thing that grows
// into its neighbours, and the reference's own stone stands alone.
//
// See DECISIONS.md D90, D93, D95.
import { Container, Graphics } from 'pixi.js';
import type { ThemeKey } from '../sim/map';
import type { Tile } from '../sim/map';
import { artSprite, castSprite, obstacleTex, TILE_FOOT } from './art';
import { shadowCtx } from './bodies';
import { LOOK_B } from './lookB';

/** Obstacle kinds that grow in company. Stone does not. */
const GROVE = new Set(['tree', 'pine']);
/** The companions, as (dx, dy, scale) in world units -- a hex is 1.73 across and 2.0 tall. They sit
 *  BEHIND the main piece (negative dy, drawn first), because a crown that overlaps from behind
 *  reads as depth while one in front reads as a second object in the way. 0.5 of the hex radius
 *  out is as far as a companion can go before its own foot leaves the tile. */
const PAIR: readonly (readonly [number, number, number])[] = [
  [-0.47, -0.17, 0.82], [0.44, -0.21, 0.78], [-0.40, -0.30, 0.72], [0.38, -0.27, 0.86],
];
/** lookB sinks the scenery into the board (sprites.ts): the same treatment, and a companion goes a
 *  shade further under so the grove has a front to it. */
const BACK_ALPHA = 0.86;

/** A fraction in [0, 1) from a tile's deco roll and a question number: which companions, and which
 *  piece each one is. The same hash decor.ts uses, for the same reason -- using the roll straight
 *  puts the same arrangement on every tile that shares one. */
function roll(deco: number, i: number, k: number): number {
  let x = Math.imul((deco * 1021 + i * 7919 + k * 104729) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** One piece on its foot at (dx, dy), `k` of full size, with its shadow and its cast shadow. */
function piece(g: Container, kind: string, deco: number, theme: ThemeKey,
               dx: number, dy: number, k: number, alpha: number): void {
  const { t: tx, flip } = obstacleTex(kind as Parameters<typeof obstacleTex>[0], deco, theme);
  const part = new Container();
  const sh = new Graphics(shadowCtx(0.5 * k));
  sh.position.set(0, TILE_FOOT - 0.08);
  // No warm tint. 0xf2e6cc was here to sit a *toy* on the board, and decor.ts already found what
  // it costs: a piece's own hue. With the foliage moved onto the board's teal family on purpose
  // (prim.py D96) that cost is the whole point of the change -- the tint was pulling the crown
  // 15 degrees back toward yellow on screen and taking a tenth of its saturation with it.
  const sp = artSprite(tx, TILE_FOOT, flip ? -1 : 1);
  part.addChild(sh, sp);
  if (LOOK_B) part.addChildAt(castSprite(tx, TILE_FOOT), 0);
  part.position.set(dx, dy);
  part.scale.set(k);
  part.alpha = alpha;
  g.addChild(part);
}

/** The container for `t`'s obstacle, unpositioned: the caller sets it on the tile. */
export function obstacleGroup(t: Tile, theme: ThemeKey): Container {
  const g = new Container();
  if (LOOK_B) g.alpha = 0.62;
  if (GROVE.has(t.obst)) {
    // one companion always, a second on a third of the tiles: a wood wants uneven clumps, and
    // three crowns on every single tree tile is the one-per-cell rhythm again at three times the ink
    const n = roll(t.deco, t.i, 3) < 0.34 ? 2 : 1;
    for (let j = 0; j < n; j++) {
      const p = PAIR[Math.floor(roll(t.deco, t.i, 11 + j * 3) * PAIR.length) % PAIR.length]!;
      const d = Math.floor(roll(t.deco, t.i, 12 + j * 3) * 1000);
      piece(g, t.obst, d, theme, p[0], p[1], p[2], BACK_ALPHA);
    }
  }
  piece(g, t.obst, t.deco, theme, 0, 0, 1, 1);
  return g;
}
