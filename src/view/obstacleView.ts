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
// device px -- a WIDE squat cell. Ours is pointy-top and unsquashed, 113 x 131 px at the same
// zoom -- a TALL narrow one. The one length the two boards share is the hex's height, so that is
// what a crown has to be measured against:
//   reference  one crown 135 x 140 px = 0.99 x 1.03 of a hex height; masses of 260 x 285 px
//   ours       one crown  73 x  68 px = 0.56 x 0.52 of a hex height; nothing touching anything
// Ours were half the size, which is why no clump of them ever closed: our diagonal neighbours sit
// 98 px apart vertically and a 68 px crown cannot reach across that, however many we put down.
// That is the whole of what CROWN_K below fixes, and it is why D102's cap on the obstacle count
// (a pacing number, for weak players) never had to move.
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
/** How much over its frame a tree is drawn. The frames are sized for a piece standing in a hex
 *  (oak 154 x 176 texture px), and the note at the top is the measurement that says a wood is not
 *  that: a crown has to reach its diagonal neighbours' crowns, which on this board means spanning
 *  the 98 device px between their centres. It is NOT a licence to grow the rest of the art: a
 *  building at this size is the "buildings look too big" complaint, and stone stays at its frame
 *  size, where the reference's own stone is.
 *
 *  AND WITH THE BAKED GROUND DISC GONE IT NOW CLOSES. This note read "1.45 takes our 68 px crown to
 *  99 px over a 98 px gap -- just closing", and that was measured while every prop carried a baked
 *  disc of ground under it (props.py _ground). The frame is sized to TARGET's height, so the disc
 *  -- whose front edge projected below the trunk at a 32 degree camera -- was eating a tenth of
 *  every frame. Taking it off the three meadow pieces (D108) let the tree itself fill the frame:
 *  the oak's crown went from 112 to 128 device px, 0.86 to 0.98 of a hex height, against the
 *  reference's own 0.99 (D:/new/ref IMG_3717), and 128 over 98 is an overlap and not a graze. The
 *  pine's widest skirt went 104 to 116 px the same way.
 *
 *  It costs nothing in sharpness. A 114-texture-px hex is drawn at 65 CSS px on a phone, so every
 *  sprite on the board is already downsampled about 3.5x; 1.45 of that is still a downsample, and
 *  the atlas needs no re-render. */
const CROWN_K = 1.45;
/** The companions, as (dx, dy, scale) in world units -- a hex is 1.73 across and 2.0 tall. They sit
 *  BEHIND the main piece (negative dy, drawn first), because a crown that overlaps from behind
 *  reads as depth while one in front reads as a second object in the way.
 *
 *  HOW FAR OUT, AND WHY IT IS NOW 0.6 AND NOT 0.47. The old number came with "0.5 of the hex radius
 *  out is as far as a companion can go before its own foot leaves the tile", which is half a hex
 *  short: this hex is pointy-top, so its own half-width is 0.866 and a foot at 0.6 is still well
 *  inside it.
 *
 *  AND IT DOES NOT MAKE THE WOOD ONE MASS. That is what the extra tenth was tried for and the
 *  screenshots say it is not what happened: with CROWN_K the main crown is wider than a tile, so a
 *  companion 0.6 of a radius out (39 px) still stands behind it and all the tenth reveals is a
 *  sliver. Nor can it be fixed by going further without standing the foot on the grid line. The
 *  board's own geometry is why: the reference packs its rows 68 device px apart against a 140 px
 *  crown, so every crown there overlaps the two ABOVE it as well as the two beside it; our diagonal
 *  neighbours sit 98 px apart, which one crown now spans (128 px, see CROWN_K) but our rows do not
 *  stack the way its do. To get its canopy the board would have to be squashed flat-top like the
 *  reference's. So this tier gets what it can honestly get, and our woods still read as a clump of
 *  crowns where the reference's read as one canopy -- a thinner gap than the "can only ever graze"
 *  this note used to claim, but the same kind. */
const PAIR: readonly (readonly [number, number, number])[] = [
  [-0.60, -0.17, 0.82], [0.57, -0.21, 0.78], [-0.52, -0.30, 0.72], [0.50, -0.27, 0.86],
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
  // 0.5, not 0.5 * k: the container this hangs in is scaled by k below, so a k in here is applied
  // twice. At the old jitter (0.93-1.07) that was a 7% error nobody could see; at CROWN_K it would
  // put a 1.05-radius patch of shade under a tree whose own hex is 0.87 across.
  const sh = new Graphics(shadowCtx(0.5));
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
  const kk = GROVE.has(t.obst) ? CROWN_K : 1;
  if (GROVE.has(t.obst)) {
    // one companion always, a second on a third of the tiles: a wood wants uneven clumps, and
    // three crowns on every single tree tile is the one-per-cell rhythm again at three times the ink
    const n = roll(t.deco, t.i, 3) < 0.34 ? 2 : 1;
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
