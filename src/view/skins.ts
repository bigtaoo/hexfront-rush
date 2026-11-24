// The map's skins: twelve painted versions of the three themes the sim generates, four per theme.
// A match picks one from its seed, so two matches on the same theme do not look alike.
//
// Each skin paints a tile by its *zone*: the ground near a castle is the cultivated home country,
// the middle of the map is wilder, and the contested middle row is wilder still. A single flat
// green over the whole board was the complaint these answer, and the zone step is how they answer
// it: about 0.095 of value and 0.032 of saturation from the home country to the contested middle,
// in two equal steps (half that on the snow boards, which have less value to spend).
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
// team's colour, and no snow skin drifts toward that blue -- not even the glacier, whose first cut
// was a pale teal: a teal board under a blue team field left the whole map one cool hue, and the
// blue team's own country had nothing to be blue against. Ice is cool only where it is actually
// ice: the ponds and the crystals.
//
// THE CHROMA HERE CAME OFF THE REFERENCE GAME ITSELF (D:/new/ref, measured on IMG_3660). Its bare
// ground is #daa75c -- saturation 0.578 at value 0.855 -- which is *more* saturated than anything
// this game has ever shipped, and its board still reads calm. Twice now these skins were tuned
// against the wrong material: first up to 0.30-0.51 off an AI mock (D85), then back down to a
// 0.12-0.14 "budget" off another one (D86), on the theory that colour was what made the board
// tiring. It was not. What tires the eye is texture and value noise -- wood grain under every hex,
// a lit bevel and a shaded groove on all six edges, two dome highlights on every top, a strong
// corner vignette. Flatten all of that (ground.ts, light.ts) and the same board carries the
// reference's chroma without a murmur.
//
// So: desert is the reference's own sand, 0.50-0.62 at value 0.82-0.89; meadow is a real grass
// green at the same strength; snow stays white-with-a-tint at 0.13-0.20, because snow is white and
// no reference changes that. Saturation is what tells the themes apart; value is what tells the
// zones apart, and nothing at all is spent on per-tile noise.
//
// Every skin keeps a `grid`, its own colour 14% down in value and a sixth up in saturation, which
// is the reference's grid exactly (#b27e4b edged in #996535) and the only line drawn on open
// ground. A cut of this had it at 5%, a quarter of the ink, and at a phone's zoom there was no
// honeycomb on the board to see -- which is where the board stopped looking like the reference's
// and started looking like a wash. See DECISIONS.md D85, D86, D87, D88.

import type { ThemeKey } from '../sim/map';

/** Two shades, the per-tile checker the sim rolls (Tile.shade). */
export type Shades = readonly [string, string];

export interface MapSkin {
  key: string;
  theme: ThemeKey;
  /** Tile tops by zone: 0 home country, 1 the open field, 2 the contested middle. */
  top: readonly [Shades, Shades, Shades];
  /** The hex grid: this skin's colour, 14% down in value and a sixth up in saturation. */
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
    top: [['#b3d77d', '#b1d57c'], ['#a8cb73', '#a6c971'], ['#9cbf69', '#9bbc68']],
    grid: '#8caf58', side: '#6d8648', bg: '#3b4729', water: ['#5fa99e', '#397067'],
  },
  {
    key: 'meadow-summer', theme: 'meadow',
    top: [['#b5d575', '#b3d374'], ['#aac96b', '#a8c76a'], ['#9ebd62', '#9cba60']],
    grid: '#8ead51', side: '#6e8443', bg: '#3c4627', water: null,
  },
  {
    key: 'meadow-autumn', theme: 'meadow',
    top: [['#dfd870', '#ddd66f'], ['#d3cc66', '#d1ca65'], ['#c7c05d', '#c4be5c']],
    grid: '#b5af4b', side: '#8a853e', bg: '#4a4725', water: ['#6ca89a', '#436f65'],
  },
  {
    key: 'meadow-marsh', theme: 'meadow',
    top: [['#9fd074', '#9dce73'], ['#94c46a', '#92c269'], ['#89b860', '#88b55f']],
    grid: '#7aa950', side: '#608142', bg: '#344526', water: ['#58a596', '#346d62'],
  },
  {
    key: 'desert-pale', theme: 'desert',
    top: [['#e2b871', '#e0b670'], ['#d6ad67', '#d4ab66'], ['#caa25e', '#c7a05d']],
    grid: '#b8904b', side: '#8c703f', bg: '#4a3d25', water: null,
  },
  {
    key: 'desert-red', theme: 'desert',
    top: [['#d78c5a', '#d58b59'], ['#cb8252', '#c98151'], ['#bf784a', '#bc7749']],
    grid: '#af6738', side: '#865230', bg: '#472e1e', water: null,
  },
  {
    key: 'desert-canyon', theme: 'desert',
    top: [['#d29354', '#d09253'], ['#c6894c', '#c4874b'], ['#ba7f44', '#b77e44']],
    grid: '#aa6e33', side: '#82572c', bg: '#45311c', water: ['#5f9e92', '#3a685f'],
  },
  {
    key: 'desert-oasis', theme: 'desert',
    top: [['#ddbc63', '#dbba62'], ['#d1b15a', '#cfaf59'], ['#c5a552', '#c2a451']],
    grid: '#b4943f', side: '#897336', bg: '#493e21', water: ['#5aab9a', '#357164'],
  },
  {
    key: 'snow-field', theme: 'snow',
    top: [['#ebdfca', '#e9ddc8'], ['#e3d7c1', '#e1d5bf'], ['#dccfb8', '#dacdb7']],
    grid: '#c3b7a2', side: '#91897b', bg: '#4d4943', water: null,
  },
  {
    key: 'snow-tundra', theme: 'snow',
    top: [['#e9e2c4', '#e7e0c2'], ['#e1dabb', '#dfd8ba'], ['#dad2b3', '#d8d0b1']],
    grid: '#c2bb9c', side: '#918c77', bg: '#4d4b41', water: null,
  },
  {
    key: 'snow-glacier', theme: 'snow',
    top: [['#ebddcc', '#e9dbca'], ['#e3d5c3', '#e1d3c1'], ['#dccdba', '#dacbb9']],
    grid: '#c3b5a4', side: '#91887d', bg: '#4d4943', water: ['#66a698', '#3e6e63'],
  },
  {
    key: 'snow-thaw', theme: 'snow',
    top: [['#e3e7bd', '#e1e5bb'], ['#dbdfb5', '#d9ddb3'], ['#d4d8ac', '#d2d6ab']],
    grid: '#bcc097', side: '#8c8f73', bg: '#4b4c3e', water: ['#67a8a0', '#3f6f69'],
  },
];

/** The skin a match wears: one of its theme's four, from the seed. */
export function skinFor(theme: ThemeKey, seed: number): MapSkin {
  const of = SKINS.filter((s) => s.theme === theme);
  const h = Math.abs(Math.imul(seed ^ 0x5f356495, 2654435761)) >>> 0;
  return of[h % of.length]!;
}
