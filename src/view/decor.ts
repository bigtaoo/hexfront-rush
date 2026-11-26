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
// the decor pieces are modelled flat, patchless and shadowless and are drawn at a quarter to a
// half of a tile across (tools/art3d/props.py, tools/art/sprites.py) -- a pebble cluster is 0.26 of
// a hex, a tuft 0.42.
//
// AND THEY CARRY HALF THE INK. That line read "carry a thinner outline" for ten versions and it was
// not true of the pipeline: one OUTLINE_PX dilated every sprite in the game, and on a piece a third
// of an oak's size whose body is blades and sticks the ink ran along both sides of every blade and
// took it over -- 71% of a tuft's pixels and 80% of a twig's sat at the ink floor, against 36% of an
// oak's. That is what "sixty copies of the same little chevron" (below) actually was, and the two
// cuts that answered it by taking pieces away were both treating the symptom. sprite.py DECOR now
// gives this tier half the ink and sizes it by TARGET instead of by the area match. D103.
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
import { SQUASH } from './viewConst';

/** How many of the tiles that can take a decoration get one. 0.22 of 281 open tiles is about 60
 *  pieces: roughly one in five hexes, and bare patches four and five tiles across in between --
 *  which a cut of this treated as the fault to fix and the reference treats as the board. See the
 *  note at the top for why half was the wrong number. */
const DENSITY = 0.22;
/** A theme that needs a different number puts it here. None does: the `meadow: 0` that sat here
 *  from D97 to D101 is gone. It was put there because the reference's forest frames (D:/new/ref
 *  IMG_3707, IMG_3717) carry nothing on their open ground, and on our own board the pieces read as
 *  "sixty copies of the same little chevron in the ground's own hue". The second half of that was
 *  true and the diagnosis was wrong: a tuft is toned BELOW the board on purpose (sprite.py
 *  SCENERY), and what put it back into the ground's own hue was this layer's own alpha, which at
 *  0.62 over a dark teal board mixes a dark piece 38% of the way back to the tile it stands on.
 *  Turning the whole theme off was treating a transparency bug as a density problem, and it left
 *  270 of 325 hexes with nothing in them at all. The alpha is fixed below instead. D101. */
const THEME_DENSITY: Record<string, number> = {};
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
/** lookB sinks the scenery into the board -- a little. 0.62 was the number here for five versions
 *  and it was too much by far on the dark boards: alpha mixes a piece toward the tile under it in
 *  BOTH directions, so a tuft whose body sprite.py already toned down to 0.28 of value lands at
 *  0.62*0.28 + 0.38*0.47 = 0.352 over a meadow -- a tenth of a step off the ground it stands on,
 *  which is no picture at all. That is the same mistake the obstacle group's own 0.62 was
 *  (obstacleView.ts D100), one tier down. Where a piece sits in value is the material's question
 *  and the tone pass answers it; this is only here to keep the litter under the props, which a
 *  tenth does.
 *
 *  No warm tint, which is the one lookB treatment of the obstacle props this tier does not take.
 *  That tint (0xf2e6cc) is there to sit a *toy* on the board, and it costs a piece its own hue: it
 *  turned the snow drift's #f4f1ea into the snow ground's own #ebdfca and left nothing but an
 *  outline, and it pulled the blue out of the ice. */
const ALPHA = 0.9;

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
    // and it is not the same size twice. Four pieces over sixty tiles, drawn at one size, is sixty
    // copies of four stamps, and the repeat is what the eye finds first -- the same thing the main
    // obstacle piece's jitter answers one tier up (obstacleView.ts D101). A quarter either way is a
    // lot for a piece this small and still nothing next to a unit. D101.
    const k2 = 0.78 + roll(t.deco, t.i, k + 9) * 0.44;
    const room = Math.max(OFF_MIN, SPAN - (artW(tx) * k2) / 2);
    const d = Math.min(room, OFF_MIN + roll(t.deco, t.i, k + 2) * (OFF_MAX - OFF_MIN));
    const v = cam.tv[t.i]!;
    const s = artSprite(tx, 0, flip ? -1 : 1);
    s.scale.set(s.scale.x * k2, s.scale.y * k2);
    // y is squashed with the board's own foreshortening, so a ring of offsets stays a ring
    s.position.set(v.x + Math.cos(a) * d, v.y + Math.sin(a) * d * SQUASH);
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
