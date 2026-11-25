// The litter on open ground: tufts of grass, pebbles, dry brush, drifts of snow.
//
// WHY THIS EXISTS. Our obstacle props cover 7-20% of the tiles (map.ts caps them there: fewer and
// the map has no terrain, more and the pathing closes up), so about 270 of the 325 tiles carried
// nothing at all, and a tile with nothing on it has only its own flat colour to show.
//
// HOW MANY, AND WHY THAT IS NOW A FIFTH AND NOT A HALF. The first cut of this read the reference
// (D:/new/ref) as "bare ground densely covered in small things" and put a piece on 0.55 of the open
// tiles. That reading came off its *sand* frames, and it was wrong twice over. Its sand carries
// tile-sized cacti, obelisks and chests -- obstacle props, the tier above this one, which the note
// below says this tier deliberately is not -- and its bare sand hexes are bare (IMG_3670). On its
// forest boards (IMG_3707, IMG_3717) the open ground carries nothing at all: no litter, no sprigs,
// one flat hex after another, and the tree that is there is a dark mass you cannot miss. Over the
// deep greens the meadow boards now wear (skins.ts D91) a piece on every other tile is 200 small
// scribbles in the ground's own hue, which at a phone's zoom is a fuzz over the whole field -- the
// "cluttered and tiring" complaint by a third route. A fifth of the tiles keeps what the tier was
// for (a bare hex has something to find in it now and then) at a density the eye reads as ground
// rather than as a texture.
//
// WHY IT IS A SECOND TIER AND NOT MORE OBSTACLE PROPS. A decoration sits on a tile the troops walk
// straight through, so the one thing it must never do is read as terrain. Our obstacle props are
// tall, silhouetted, ground-patched and shadowed, and on this board that IS the word for "you
// cannot go here"; scattering them on open ground would make the player path around nothing. So
// the decor pieces are modelled flat, patchless and shadowless, carry a thinner outline, and are
// drawn at a sixth to a quarter of a tile across (tools/art3d/props.py, tools/art/sprites.py).
// They also live in the lowest layer in the scene, under the offers and under every unit: nothing
// here can ever cover something the player has to read or click.
//
// It costs no simulation change. Every tile already carries `deco`, a per-match roll from the seed
// (map.ts), which until now only picked which tree an obstacle tile shows. One roll has to answer
// three questions -- whether, which, where -- so it is hashed with the tile index: using the roll
// directly put the same piece in the same corner of every tile that shared a roll, which at a
// glance is a repeating pattern, and a pattern is exactly what a scatter must not be.
//
// See DECISIONS.md D90, D92.
import { Container, type Sprite } from 'pixi.js';
import type { Engine } from '../sim/engine';
import type { Tile } from '../sim/map';
import { artSprite, artW, decorTex } from './art';
import type { Camera } from './camera';
import { LOOK_B } from './lookB';

/** How many of the tiles that can take a decoration get one. 0.22 of 281 open tiles is about 60
 *  pieces: roughly one in five hexes, and bare patches four and five tiles across in between --
 *  which a cut of this treated as the fault to fix and the reference treats as the board. See the
 *  note at the top for why half was the wrong number. */
const DENSITY = 0.22;
/** ...except on the meadow boards, where it is none at all (D97). The note above already read the
 *  reference's forest frames correctly -- "the open ground carries nothing at all: no litter, no
 *  sprigs, one flat hex after another" -- and then kept a fifth of the tiles decorated on every
 *  theme anyway. Looking at our own board next to IMG_3717 the sprigs are the most pattern-like
 *  thing on it: sixty copies of the same little chevron, all in the ground's own hue now that the
 *  foliage turned teal (D96), spaced about every fifth hex. On sand it works and the reference does
 *  it too (IMG_3660 scatters small cacti over its bare sand); on a dark green field the same pieces
 *  are scribbles on a surface that is supposed to be quiet. */
const THEME_DENSITY: Record<string, number> = { meadow: 0 };
/** Where in the tile a piece lands, as a fraction of the hex radius: never the centre (a unit
 *  stands there and a building goes there), and the far end is then pulled in by the piece's own
 *  width, below -- a dry bush is three times as wide as a pebble and cannot be pushed as far. */
const OFF_MIN = 0.20, OFF_MAX = 0.52;
/** How many of the decorated tiles get a second piece, across the tile from the first. The reference
 *  (D:/new/ref) does not scatter one thing per cell: what it puts on the ground comes in little
 *  *clusters*, two or three cacti and a sprig leaning on each other. One piece per tile at any
 *  density still reads as a grid with a dot in each cell, which is the pattern a scatter must not
 *  be; a pair on some of the tiles is what breaks the one-per-cell rhythm without touching the
 *  sizes. It matters more now that there are a third as many pieces: a fifth of a fifth is a
 *  cluster you come across twice a board, which is the right number of times. */
const PAIR = 0.26;
/** How far from the centre the far edge of a piece may reach, in hex radii. 0.78, not the apothem's
 *  0.866: a piece whose edge touches the grid line reads as part of the line. */
const SPAN = 0.78;
/** lookB sinks the scenery into the board: a good deal of the ground shows through, because there
 *  are five times as many of these as there are props and they must stay quieter than anything the
 *  player has to read.
 *
 *  No warm tint, which is the one lookB treatment of the obstacle props this tier does not take.
 *  That tint (0xf2e6cc) is there to sit a *toy* on the board, and it costs a piece its own hue: it
 *  turned the snow drift's #f4f1ea into the snow ground's own #ebdfca and left nothing but an
 *  outline, and it pulled the blue out of the ice. Alpha alone sinks these in far enough. */
const ALPHA = 0.62;

/** How many of a theme's tiles get a piece. */
export function density(theme: string): number {
  return THEME_DENSITY[theme] ?? DENSITY;
}

/** A fraction in [0, 1) from a tile's deco roll and a question number. Hashing the pair is what
 *  stops two tiles with the same roll from looking alike. */
function roll(deco: number, i: number, k: number): number {
  let x = Math.imul((deco * 1021 + i * 7919 + k * 104729) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Open ground only: no obstacle, no building standing or fallen, no map event marker. */
function bare(t: Tile): boolean {
  return !t.obst && !t.bld && !t.rubble && !t.event;
}

export class DecorLayer {
  readonly root = new Container({ isRenderGroup: true });
  /** The pieces on each tile (none, one, or a pair), so a building going up can take its tile's
   *  decoration away again. */
  private piece: Sprite[][] = [];

  build(eng: Engine, cam: Camera): void {
    this.root.removeChildren();
    this.piece = eng.tiles.map((t) => {
      if (!bare(t) || roll(t.deco, t.i, 0) >= density(eng.themeKey)) return [];
      const on = [this.put(t, cam, eng.themeKey, 1, 0)];
      // the second piece goes on the far side of the tile's centre (+pi, turned a little), so a
      // pair reads as two things standing together and not as one thing drawn twice
      if (roll(t.deco, t.i, 8) < PAIR) on.push(this.put(t, cam, eng.themeKey, 5, Math.PI * 0.82));
      return on;
    });
  }

  /** One piece on `t`, with the four rolls starting at `k` and its angle turned by `turn`. */
  private put(t: Tile, cam: Camera, theme: string, k: number, turn: number): Sprite {
    const { t: tx, flip } = decorTex(theme, Math.floor(roll(t.deco, t.i, k) * 4096));
    const a = roll(t.deco, t.i, k + 1) * Math.PI * 2 + turn;
    const room = Math.max(OFF_MIN, SPAN - artW(tx) / 2);
    const d = Math.min(room, OFF_MIN + roll(t.deco, t.i, k + 2) * (OFF_MAX - OFF_MIN));
    const v = cam.tv[t.i]!;
    const s = artSprite(tx, 0, flip ? -1 : 1);
    // y is squashed with the board's own foreshortening, so a ring of offsets stays a ring
    s.position.set(v.x + Math.cos(a) * d, v.y + Math.sin(a) * d * 0.72);
    if (LOOK_B) s.alpha = ALPHA;
    this.root.addChild(s);
    return s;
  }

  /** A building, a ruin or an event marker on a tile takes that tile's decoration away: two
   *  pictures on one tile is the only way a piece this small can be mistaken for something. */
  update(eng: Engine): void {
    for (const t of eng.tiles) {
      const on = this.piece[t.i];
      if (!on?.length) continue;
      const show = bare(t);
      for (const s of on) s.visible = show;
    }
  }

  /** Whether this tile was given a piece when the board was built (tests, and the layer's own
   *  update). */
  pieceOn(i: number): boolean {
    return !!this.piece[i]?.length;
  }
  /** Whether this tile's decoration is being drawn right now. */
  shown(i: number): boolean {
    return !!this.piece[i]?.[0]?.visible;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
