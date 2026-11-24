// The map's skins: twelve painted versions of the three themes the sim generates, four per theme.
// A match picks one from its seed, so two matches on the same theme do not look alike.
//
// Each skin paints a tile by its *zone*: the ground near a castle is the cultivated home country,
// the middle of the map is wilder, and the contested middle row is wilder still. A single flat
// green over the whole board was the complaint these answer. The zone steps are deliberately tiny
// now -- one hundredth of saturation and value apart -- because the board has to read as one
// surface; they are there to be felt, not seen.
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
// no reference changes that. Value stays in one narrow band across the whole board -- it is the
// saturation, not the value, that tells the themes apart -- and every skin keeps a `grid`, the same
// colour about 5% darker, which is the only line drawn on open ground.
// See DECISIONS.md D85, D86, D87.

import type { ThemeKey } from '../sim/map';

/** Two shades, the per-tile checker the sim rolls (Tile.shade). */
export type Shades = readonly [string, string];

export interface MapSkin {
  key: string;
  theme: ThemeKey;
  /** Tile tops by zone: 0 home country, 1 the open field, 2 the contested middle. */
  top: readonly [Shades, Shades, Shades];
  /** The hairline hex grid on open ground: this skin's colour, a shade darker. */
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
    top: [['#b3d77d', '#b2d57c'], ['#b0d579', '#afd378'], ['#add276', '#acd075']],
    grid: '#a7cc6f', side: '#6d8648', bg: '#3b4729', water: ['#5fa99e', '#397067'],
  },
  {
    key: 'meadow-summer', theme: 'meadow',
    top: [['#b5d575', '#b3d374'], ['#b2d272', '#b0d071'], ['#afd06e', '#aece6d']],
    grid: '#a9c967', side: '#6e8443', bg: '#3c4627', water: null,
  },
  {
    key: 'meadow-autumn', theme: 'meadow',
    top: [['#dfd870', '#ddd66f'], ['#ddd56c', '#dbd36b'], ['#dad269', '#d8d068']],
    grid: '#d3cb61', side: '#8a853e', bg: '#4a4725', water: ['#6ca89a', '#436f65'],
  },
  {
    key: 'meadow-marsh', theme: 'meadow',
    top: [['#9fd074', '#9dce73'], ['#9ccd71', '#9acb70'], ['#99cb6d', '#97c96c']],
    grid: '#93c467', side: '#608142', bg: '#344526', water: ['#58a596', '#346d62'],
  },
  {
    key: 'desert-pale', theme: 'desert',
    top: [['#e2b871', '#e0b770'], ['#dfb56d', '#ddb46c'], ['#ddb36a', '#dbb169']],
    grid: '#d5ab62', side: '#8c703f', bg: '#4a3d25', water: null,
  },
  {
    key: 'desert-red', theme: 'desert',
    top: [['#d78c5a', '#d58b5a'], ['#d58a57', '#d38856'], ['#d28754', '#d08553']],
    grid: '#cc7f4c', side: '#865230', bg: '#472e1e', water: null,
  },
  {
    key: 'desert-canyon', theme: 'desert',
    top: [['#d29354', '#d09253'], ['#d09051', '#ce8f50'], ['#cd8e4e', '#cb8c4d']],
    grid: '#c78646', side: '#82572c', bg: '#45311c', water: ['#5f9e92', '#3a685f'],
  },
  {
    key: 'desert-oasis', theme: 'desert',
    top: [['#ddbc63', '#dbba62'], ['#dab960', '#d8b85f'], ['#d7b75d', '#d5b55c']],
    grid: '#d0af55', side: '#897336', bg: '#493e21', water: ['#5aab9a', '#357164'],
  },
  {
    key: 'snow-field', theme: 'snow',
    top: [['#ebdfca', '#e9ddc8'], ['#e8dbc5', '#e6d9c4'], ['#e6d8c1', '#e3d6bf']],
    grid: '#ded1bc', side: '#91897b', bg: '#4d4943', water: null,
  },
  {
    key: 'snow-tundra', theme: 'snow',
    top: [['#e9e2c4', '#e7e0c2'], ['#e7dfc0', '#e5ddbe'], ['#e4dcbb', '#e2dab9']],
    grid: '#dcd5b6', side: '#918c77', bg: '#4d4b41', water: null,
  },
  {
    key: 'snow-glacier', theme: 'snow',
    top: [['#ebddcc', '#e9dbca'], ['#e8dac8', '#e6d8c6'], ['#e6d7c3', '#e3d5c1']],
    grid: '#ded0bf', side: '#91887d', bg: '#4d4943', water: ['#66a698', '#3e6e63'],
  },
  {
    key: 'snow-thaw', theme: 'snow',
    top: [['#e3e7bd', '#e1e5bc'], ['#e0e4b9', '#dee2b7'], ['#dde2b5', '#dbe0b3']],
    grid: '#d6dab0', side: '#8c8f73', bg: '#4b4c3e', water: ['#67a8a0', '#3f6f69'],
  },
];

/** The skin a match wears: one of its theme's four, from the seed. */
export function skinFor(theme: ThemeKey, seed: number): MapSkin {
  const of = SKINS.filter((s) => s.theme === theme);
  const h = Math.abs(Math.imul(seed ^ 0x5f356495, 2654435761)) >>> 0;
  return of[h % of.length]!;
}
