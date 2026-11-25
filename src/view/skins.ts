// The map's skins: twelve painted versions of the three themes the sim generates, four per theme.
// A match picks one from its seed, so two matches on the same theme do not look alike.
//
// Each skin paints a tile by its *zone*: the ground near a castle is the cultivated home country,
// the middle of the map is wilder, and the contested middle row is wilder still. A single flat
// green over the whole board was the complaint these answer, and the zone step is how they answer
// it: 0.076 to 0.095 of value from the home country to the contested middle, in two equal steps,
// and about 0.056 on the snow boards, which are a near-white with less value to spend.
//
// That step is measured, not chosen. The reference's own bare ground (D:/new/ref, IMG_3660) is two
// patches of sand 0.155 of value apart -- #daa75c at 0.855 against #b27d4c at 0.702 -- and it is
// that banding, far more than the colour, that makes it read as land rather than as a painted
// table. A cut of these made the step one hundredth 'to be felt, not seen', which in practice meant
// a board with no patches in it at all; the eye had nothing to rest on and the whole field read as
// one surface, which was the original complaint again by another route. Ours is six tenths of the
// reference's step: a full sixth of value across three zones would put the contested middle in
// shadow, and the middle is where the fighting is.
//
// Water is painted on the rock tiles the sim already laid (ice in the snow themes), never on open
// ground: the pond is exactly as impassable as the rock it replaces, so nothing here tells the
// player a lie about where troops can walk. A skin with `water: null` keeps its rocks.
//
// Blue on the map means the blue team (art/STYLE.md), so every water is a green-teal, well off the
// team's colour: a pond is the one cool thing on a board, and if it were blue the player's own
// country would have nothing to be blue against. Ice is cool where it is actually ice -- the ponds
// and the crystals -- and the snow ground itself is a near-colourless white, saturation 0.06-0.09,
// which carries no hue to clash with.
//
// THE WHOLE PALETTE CAME OFF THE REFERENCE GAME (D:/new/ref). Three earlier rounds measured only
// its *sand* -- #daa75c, saturation 0.578 at value 0.855 -- and then extrapolated the other two
// themes from it, so the meadow became a bright lawn at value 0.84 and the snow a warm cream.
// Reading all 122 frames shows that is not what the reference does. Its four biomes are:
//
//    sand    #daa75c   H36  S0.58 V0.85     snow   #d9e3e4  H185 S0.05 V0.89
//    forest  #357167   H170 S0.53 V0.44     night  #152947  H216 S0.70 V0.28
//
// Three of the four are DARK, and there is no bright yellow-green anywhere in it. That is the whole
// answer to "the board is cluttered and tiring". Our own atlas has a median value of 0.26-0.54 on
// every sprite -- militia 0.42, guard 0.26, oak 0.53, tower 0.48 -- so on a value-0.84 ground the
// board itself was the brightest thing on screen and every single piece could only depart from it
// downward, all inside one hue family (ours ran H71-89). Nothing separated from anything. Put the
// ground at the reference's own value and the pieces have somewhere to go in both directions.
//
// So: desert stays exactly as it was -- it is the one theme that was measured off the right
// material. Meadow is re-pitched to the reference's deep biome green, value 0.45-0.54 at saturation
// 0.45-0.52, which is a forest seen from above and not a lawn. Snow is cooled from cream to the
// reference's white-with-a-breath-of-blue. Value is what tells the themes apart now; the zone step
// is what tells the zones apart, and nothing at all is spent on per-tile noise.
//
// Every skin keeps a `grid`, its own colour a tenth down in value and an eighth up in saturation,
// and it is the only line drawn on open ground. Two cuts of this missed either way: 5% was a
// quarter of the ink and at a phone's zoom there was no honeycomb on the board at all, and 14% --
// measured off a *shadowed* patch of the reference's sand -- inked an outline round every hex,
// which is what made the board look drawn rather than made of anything. On bright sand the
// reference's own line is a thirtieth of value, and what closes the cell there is the lit rim along
// each tile's lower edges (ground.ts), not the line.
//
// The two territories are no longer painted here at all: they are mixed off whichever ground they
// sit on, 0.55 of the way to the team's line colour (ground.ts teamLook), which is the rule the
// reference's own four territory patches fit. See DECISIONS.md D85, D86, D87, D88, D89, D91.

import type { ThemeKey } from '../sim/map';

/** Two shades, the per-tile checker the sim rolls (Tile.shade). */
export type Shades = readonly [string, string];

export interface MapSkin {
  key: string;
  theme: ThemeKey;
  /** Tile tops by zone: 0 home country, 1 the open field, 2 the contested middle. */
  top: readonly [Shades, Shades, Shades];
  /** The hex grid: this skin's colour, a tenth down in value and an eighth up in saturation. */
  grid: string;
  /** Below the tile, so only the map's rim shows it. */
  side: string;
  /** Around the map. */
  bg: string;
  /** Pond top and side, or null for a skin with no water. */
  water: Shades | null;
}

export const SKINS: readonly MapSkin[] = [
  {
    key: 'meadow-spring', theme: 'meadow',
    top: [['#418275', '#408174'], ['#3b786c', '#3a776b'], ['#356f63', '#346d62']],
    grid: '#2e6c60', side: '#245249', bg: '#152c28', water: ['#5fa99e', '#397067'],
  },
  {
    key: 'meadow-summer', theme: 'meadow',
    top: [['#3b7a5d', '#3a795c'], ['#357155', '#346f54'], ['#2f674d', '#2e654c']],
    grid: '#296649', side: '#204d38', bg: '#132a1f', water: null,
  },
  {
    key: 'meadow-autumn', theme: 'meadow',
    top: [['#778a4c', '#76884b'], ['#6e8045', '#6d7e44'], ['#65763e', '#64753d']],
    grid: '#617337', side: '#4a572b', bg: '#282f19', water: ['#6ca89a', '#436f65'],
  },
  {
    key: 'meadow-marsh', theme: 'meadow',
    top: [['#3e736f', '#3d716e'], ['#386a67', '#376965'], ['#32615e', '#32605d']],
    grid: '#2d5f5c', side: '#234846', bg: '#142726', water: ['#58a596', '#346d62'],
  },
  {
    key: 'desert-pale', theme: 'desert',
    top: [['#e2b871', '#e0b670'], ['#d6ad67', '#d4ab66'], ['#caa25e', '#c7a05d']],
    grid: '#c19751', side: '#8c703f', bg: '#4a3d25', water: null,
  },
  {
    key: 'desert-red', theme: 'desert',
    top: [['#d78c5a', '#d58b59'], ['#cb8252', '#c98151'], ['#bf784a', '#bc7749']],
    grid: '#b76d3d', side: '#865230', bg: '#472e1e', water: null,
  },
  {
    key: 'desert-canyon', theme: 'desert',
    top: [['#d29354', '#d09253'], ['#c6894c', '#c4874b'], ['#ba7f44', '#b77e44']],
    grid: '#b27537', side: '#82572c', bg: '#45311c', water: ['#5f9e92', '#3a685f'],
  },
  {
    key: 'desert-oasis', theme: 'desert',
    top: [['#ddbc63', '#dbba62'], ['#d1b15a', '#cfaf59'], ['#c5a552', '#c2a451']],
    grid: '#bc9c44', side: '#897336', bg: '#493e21', water: ['#5aab9a', '#357164'],
  },
  {
    key: 'snow-field', theme: 'snow',
    top: [['#dfeced', '#ddeaec'], ['#d6e5e6', '#d5e3e4'], ['#cddddf', '#ccdcdd']],
    grid: '#bfcecf', side: '#8b9595', bg: '#4c5051', water: null,
  },
  {
    key: 'snow-tundra', theme: 'snow',
    top: [['#d8e4e8', '#d6e2e7'], ['#cfdce1', '#cedbdf'], ['#c7d5da', '#c5d3d8']],
    grid: '#b8c5ca', side: '#878f92', bg: '#494d4f', water: null,
  },
  {
    key: 'snow-glacier', theme: 'snow',
    top: [['#d5e8eb', '#d4e6e9'], ['#cde0e3', '#ccdfe2'], ['#c4d9dc', '#c3d8db']],
    grid: '#b6c9cc', side: '#859294', bg: '#484f50', water: ['#66a698', '#3e6e63'],
  },
  {
    key: 'snow-thaw', theme: 'snow',
    top: [['#dff2f0', '#ddf1ee'], ['#d6ebe8', '#d5eae7'], ['#cee4e1', '#cce2df']],
    grid: '#bed3d0', side: '#8b9997', bg: '#4b5251', water: ['#67a8a0', '#3f6f69'],
  },
];

/** The skin a match wears: one of its theme's four, from the seed. */
export function skinFor(theme: ThemeKey, seed: number): MapSkin {
  const of = SKINS.filter((s) => s.theme === theme);
  const h = Math.abs(Math.imul(seed ^ 0x5f356495, 2654435761)) >>> 0;
  return of[h % of.length]!;
}
