// The picture on an impassable tile: a tree, a rock pile, an arch, a crystal.
//
// WHY A TILE CARRIES MORE THAN ONE PIECE. The sim puts an obstacle on 7-20% of the tiles and
// cannot put one on more (map.ts: past a fifth the pathing closes up), so a board has about 27
// of them on 325 tiles. Drawn one piece per tile that is a scatter of single objects standing in
// their own hexes with four tiles of bare ground between them, which is not what the reference
// game's (D:/new/ref) forest looks like at all: its crowns come two, three and four deep,
// overlapping each other and running over the grid lines, so a wooded stretch reads as ONE MASS
// with hexes showing through it rather than as objects placed on hexes.
//
// AND THE SIZE WAS ALSO THE GAP. This note read "the sizes were never the gap; the count was" for
// ten versions, off a measurement of IMG_3717 that put a crown there at "about 0.6 of a hex across
// and 1.0 of a hex tall -- almost exactly the size of ours". Measured again, by masking the dark
// green (hue 130-205, S >= 0.70, V < 0.55) and taking connected components, that is wrong in both
// halves, and it is wrong because it compared two boards whose hexes are not the same shape. The
// reference's grid is FLAT-TOP (a 5 px horizontal top edge 100 px long, column pitch 271 px for
// two columns, so a hex radius of 90) and squashed to 0.87 of its height, giving a hex 181 x 136
// device px -- a WIDE squat cell. Ours was pointy-top and unsquashed, 113 x 131 px at the same
// zoom -- a TALL narrow one. (D126 took the SQUASH, which is the same 0.87: our rows now sit 0.754
// of a hex width apart against its 0.753. The orientation stays ours, so the cell is still the
// taller of the two -- see viewConst.ts SQUASH.)
//
// AND THE COMPARISON ITSELF WAS IN TWO DIFFERENT UNITS (D127). Every "px" above is a DEVICE pixel,
// and the two phones are not the same: the reference's screenshots are dpr 3, our captures dpr 2.
// So "181 x 136 against our 113 x 131 at the same zoom" is really 60.3 x 45.3 LOGICAL px against
// 56.5 x 65.5 -- the two boards draw a hex at nearly the same WIDTH, and the whole of the shape
// difference is the height. Redone in logical px, which is the unit both boards share:
//   reference  one crown 45.0 x 46.7 logical, on a hex 60.3 wide
//   ours, raw frame      47.3 x 44.0 logical, on a hex 58.3 wide
//   ours, x CROWN_K 1.45 68.6 x 64.0 logical  -- half as big again as the reference's
// The frames were already the right size. What was wrong was the number below, which was solved
// for "a crown must reach its diagonal neighbour" and paid for it by growing every tree 45%.
// D102's cap on the obstacle count (a pacing number, for weak players) still never has to move.
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
import { SQUASH } from './viewConst';

/** Obstacle kinds that grow in company. Stone does not. */
const GROVE = new Set(['tree', 'pine']);
/** How much over its frame a tree is drawn. The frames are sized for a piece standing in a hex
 *  (oak 154 x 176 texture px), and that size is RIGHT: at k = 1 the oak's crown is 47.3 x 44.0
 *  logical px against the reference's own 45.0 x 46.7 (header above), on hexes of nearly the same
 *  width. 1.05 is the last 5% of the height, and that is all this number is for now.
 *
 *  IT USED TO BE 1.45, AND THAT WAS SOLVING THE WRONG EQUATION (D127). The target was "a crown
 *  must span the gap to its diagonal neighbour's crown", which on our board is 44 logical px where
 *  the reference's is 23 -- its flat-top grid puts a diagonal neighbour HALF a row up, ours puts it
 *  a whole row up, and D126's squash cannot change that. Solving it with size made every tree in
 *  the game half as big again as the reference's, which is what you actually see: smooth chunky
 *  blobs where the reference has small, separately readable trees. A canopy is made of MANY RIGHT-
 *  SIZED trees, not of few oversized ones, so the mass is bought below instead -- more companions,
 *  set back further -- and what is left over is left over, honestly: see DECISIONS.md D127.
 *
 *  (The 1.45 note also carried a measurement worth keeping. Every prop used to have a disc of
 *  ground baked under it (props.py _ground); the frame is sized to TARGET's height, so the disc's
 *  front edge was eating a tenth of every frame. D108 took it off the three meadow pieces and the
 *  tree itself filled the frame -- the oak's crown 112 -> 128 device px, the pine's widest skirt
 *  104 -> 116. The numbers in this file are all post-D108.) */
const CROWN_K = 1.05;
/** The companions, as (dx, dy, scale) in world units -- a hex is 1.73 across and 2.0 tall. They sit
 *  BEHIND the main piece (negative dy, drawn first), because a crown that overlaps from behind
 *  reads as depth while one in front reads as a second object in the way.
 *
 *  HOW FAR OUT, AND WHY IT IS NOW 0.6 AND NOT 0.47. The old number came with "0.5 of the hex radius
 *  out is as far as a companion can go before its own foot leaves the tile", which is half a hex
 *  short: this hex is pointy-top, so its own half-width is 0.866 and a foot at 0.6 is still well
 *  inside it.
 *
 *  AND THIS IS NOW WHERE THE MASS COMES FROM, NOT CROWN_K (D127). Giving the trees back their
 *  real size (1.45 -> 1.05) took 45% off every crown, so the room the old table could not use is
 *  suddenly there: six places instead of four, two companions always and a third on nearly half
 *  the tiles, and -- the part that does the work -- set-backs out to 0.62 of a radius instead of
 *  0.30. A foot that far back is still inside its own cell (a pointy-top hex reaches 1.0 back and
 *  0.658 across at that depth, and obstacleView.test.ts checks the table against that) and it is
 *  only 18 logical px back on screen, because dy is foreshortened with the board. Three small
 *  crowns at three depths is what the reference's own tile looks like up close; one crown blown up
 *  to 1.45 is not.
 *
 *  WHAT IT STILL DOES NOT BUY. The reference's rows sit 23 logical px apart and ours 44 (viewConst
 *  SQUASH took that from 50; the rest is the flat-top orientation the sim owns), so there its
 *  crowns overlap the two tiles ABOVE as well as the two beside, and here a clump closes on the
 *  diagonal and only grazes up the board. The deepest companion plus its own half-crown reaches
 *  about 41 logical px back, which arrives AT the next centre rather than past it. The honest rest
 *  of the gap is that the reference simply wooded more tiles, and how many tiles carry an obstacle
 *  is the sim's call (map.ts), not this file's. */
export const PAIR: readonly (readonly [number, number, number])[] = [
  [-0.62, -0.30, 0.86], [0.60, -0.26, 0.82], [-0.40, -0.58, 0.74],
  [0.44, -0.62, 0.78], [-0.70, -0.14, 0.78], [0.68, -0.18, 0.88],
];
/** A companion goes a shade under the piece in front of it, so the grove has a front to it. This is
 *  the ONLY alpha left on an obstacle: the group used to run at 0.62 as well, "sinking the scenery
 *  into the board", and that was the wrong tool for the job (D100). Alpha mixes a piece toward the
 *  ground in BOTH directions -- an oak's darkest pixel, 0.20 of value, lands at 0.62*0.20 + 0.38*0.47
 *  = 0.303 over a meadow -- so it does not just quiet the crown, it throws away the dark end of the
 *  whole board. That is measurable: our board region's 5th percentile of value sat at 0.318 against
 *  the reference's 0.271 (D:/new/ref IMG_3717), and 0.303 is where that number comes from. The
 *  reference's own trees are a DENSE OPAQUE MASS with hard outlines and real contrast inside them,
 *  not a wash. Where a tree sits in value is a question for the material, and sprite.py's tone pass
 *  already answers it -- floor 0.22, body compressed to 0.36 of its range, key faces lifted back
 *  0.30 -- so doing it a second time in alpha was both double and lossy. */
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
  // The contact ellipse, in the old look only. lookB grounds a piece the way the reference does --
  // with the sprite's own baked outline and its cast shadow -- and the reference draws no ground
  // shadow under its scenery at all (bodies.ts D114). 0.5, not 0.5 * k, for the old look: the
  // container this hangs in is scaled by k below, so a k in here is applied twice, and at CROWN_K
  // that would put a 1.05-radius patch of shade under a tree whose own hex is 0.87 across.
  if (!LOOK_B) {
    const sh = new Graphics(shadowCtx(0.5));
    sh.position.set(0, TILE_FOOT - 0.08);
    part.addChild(sh);
  }
  // No warm tint. 0xf2e6cc was here to sit a *toy* on the board, and decor.ts already found what
  // it costs: a piece's own hue. With the foliage moved onto the board's teal family on purpose
  // (prim.py D96) that cost is the whole point of the change -- the tint was pulling the crown
  // 15 degrees back toward yellow on screen and taking a tenth of its saturation with it.
  const sp = artSprite(tx, TILE_FOOT, flip ? -1 : 1);
  part.addChild(sp);
  // scenery throws only the bottom of its picture: sixty crowns flattened onto the grass were an
  // eighth of the board in haze (lookB.ts CAST_PROP, DECISIONS.md D123)
  if (LOOK_B) part.addChildAt(castSprite(tx, TILE_FOOT, true), 0);
  // dy is a step BACK ACROSS THE GROUND, so it is foreshortened with the board (viewConst SQUASH)
  part.position.set(dx, dy * SQUASH);
  part.scale.set(k);
  part.alpha = alpha;
  g.addChild(part);
}

/** The container for `t`'s obstacle, unpositioned: the caller sets it on the tile. */
export function obstacleGroup(t: Tile, theme: ThemeKey): Container {
  const g = new Container();
  const kk = GROVE.has(t.obst) ? CROWN_K : 1;
  if (GROVE.has(t.obst)) {
    // two companions always, a third on nearly half the tiles: a wood wants uneven clumps, and
    // three crowns on every single tree tile is the one-per-cell rhythm again at three times the ink
    const n = roll(t.deco, t.i, 3) < 0.45 ? 3 : 2;
    // The two are never the same entry. Drawing each from the whole table put both companions on
    // exactly the same spot on one tile in four -- same offset, same scale, the back one invisible
    // behind the front one -- which is a third of this tile's ink spent on nothing. The second
    // steps 1 to 3 places on from the first instead, so it is always a different side or depth.
    const first = Math.floor(roll(t.deco, t.i, 11) * PAIR.length) % PAIR.length;
    const step = 1 + Math.floor(roll(t.deco, t.i, 14) * (PAIR.length - 1));
    for (let j = 0; j < n; j++) {
      const p = PAIR[(first + j * step) % PAIR.length]!;
      const d = Math.floor(roll(t.deco, t.i, 12 + j * 3) * 1000);
      piece(g, t.obst, d, theme, p[0], p[1], kk * p[2], BACK_ALPHA);
    }
  }
  // The piece that marks the tile is jittered a little in size and in where it stands. Every main
  // piece used to be exactly full size on exactly the tile's centre, and eight pines in a row came
  // out eight identical pines on eight evenly spaced dots -- the one-per-cell rhythm again, this
  // time inside a wood. The reference's crowns (D:/new/ref IMG_3717) are all different sizes and
  // none of them is centred on anything. The amounts are small on purpose: the tile under this
  // piece is impassable and the player reads that from the piece, so it may lean, not wander. The
  // foot stays inside the hex at 0.10 of a hex width out. D100.
  const jx = (roll(t.deco, t.i, 21) - 0.5) * 0.20;
  const jy = (roll(t.deco, t.i, 22) - 0.5) * 0.12;
  piece(g, t.obst, t.deco, theme, jx, jy, kk * (0.93 + roll(t.deco, t.i, 23) * 0.14), 1);
  return g;
}
