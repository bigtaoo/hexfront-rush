// The map's skins: twelve painted versions of the three themes the sim generates, four per theme.
// A match picks one from its seed, so two matches on the same theme do not look alike.
//
// Each skin paints a tile by its *zone*: the ground near a castle is the cultivated home country,
// the middle of the map is wilder, and the contested middle row is wilder still. A single flat
// green over the whole board was the complaint these answer.
//
// Water is painted on the rock tiles the sim already laid (ice in the snow themes), never on open
// ground: the pond is exactly as impassable as the rock it replaces, so nothing here tells the
// player a lie about where troops can walk. A skin with `water: null` keeps its rocks.
//
// Blue on the map means the blue team (art/STYLE.md), so every water is a green-teal, well off the
// team's periwinkle, and no snow skin drifts toward that blue -- not even the glacier, whose first
// cut was a pale teal: a teal board under a periwinkle team field left the whole map one cool hue,
// and the blue team's own country had nothing to be blue against. Ice is cool only where it is
// actually ice: the ponds and the crystals, which now read as the one cool thing on a warm board,
// the way the reference's water reads against its sand. The four snow skins fan from rosy ivory
// through gold and olive to green, all bright, none of them blue.
//
// Every ground tile carries a hue. Measured against art/ref/screen_gen_b.png, whose board averages
// saturation 0.55, the first cut of these skins sat at 0.25: the snow themes were 0.02-0.09, i.e.
// concrete, and the desert themes about half of the reference's sand (0.40-0.47). The whole board
// then read as grey, and the cream card plaques -- at 0.33 the most saturated thing on screen --
// read as the ground while the ground read as a backdrop. So each theme now holds its own hue at a
// floor of its own: desert at the reference's own 0.38-0.49, meadow (already there) at 0.30-0.51,
// snow at 0.12-0.22, bright but unmistakably warm. Snow stays the lightest board of the three; it
// is the saturation, not the value, that tells the themes apart. See DECISIONS.md D85.

import type { ThemeKey } from '../sim/map';

/** Two shades, the per-tile checker the sim rolls (Tile.shade). */
export type Shades = readonly [string, string];

export interface MapSkin {
  key: string;
  theme: ThemeKey;
  /** Tile tops by zone: 0 home country, 1 the open field, 2 the contested middle. */
  top: readonly [Shades, Shades, Shades];
  side: string;
  /** Around the map. */
  bg: string;
  /** Pond top and side, or null for a skin with no water. */
  water: Shades | null;
}

export const SKINS: readonly MapSkin[] = [
  {
    key: 'meadow-spring', theme: 'meadow',
    top: [['#b2d98a', '#aad282'], ['#a3cc78', '#9bc570'], ['#8fba66', '#88b35f']],
    side: '#5d8a3e', bg: '#2f4a2b', water: ['#6fb3a8', '#3d7a72'],
  },
  {
    key: 'meadow-summer', theme: 'meadow',
    top: [['#9ec873', '#96c16b'], ['#8cbb66', '#85b45f'], ['#76a455', '#6f9d4f']],
    side: '#4c7733', bg: '#274024', water: null,
  },
  {
    key: 'meadow-autumn', theme: 'meadow',
    top: [['#d8c178', '#d1ba70'], ['#c4ab63', '#bda45c'], ['#a98f52', '#a2884c']],
    side: '#846233', bg: '#44331f', water: ['#6ea89c', '#3c7067'],
  },
  {
    key: 'meadow-marsh', theme: 'meadow',
    top: [['#a6cc8a', '#9ec582'], ['#8fbd84', '#87b67c'], ['#79a876', '#72a16f']],
    side: '#4f7b4d', bg: '#263d31', water: ['#62a9a4', '#36756f'],
  },
  {
    key: 'desert-pale', theme: 'desert',
    top: [['#ecce93', '#e3c68d'], ['#e3c384', '#dabc7f'], ['#ceac6f', '#c6a56b']],
    side: '#ad8b5a', bg: '#5f4936', water: null,
  },
  {
    key: 'desert-red', theme: 'desert',
    top: [['#e5b485', '#dcad80'], ['#d29e6e', '#ca986a'], ['#bd8460', '#b67f5c']],
    side: '#96643c', bg: '#4e3326', water: null,
  },
  {
    key: 'desert-canyon', theme: 'desert',
    top: [['#dfae8a', '#d7a785'], ['#c9906b', '#c18b67'], ['#ad7a5a', '#a67557']],
    side: '#8a5540', bg: '#472b22', water: ['#5f9e92', '#346b63'],
  },
  {
    key: 'desert-oasis', theme: 'desert',
    top: [['#cdd48f', '#c5cc8a'], ['#ddc987', '#d5c182'], ['#c9ae72', '#c1a76e']],
    side: '#9b8150', bg: '#53432f', water: ['#5aab9a', '#2f7368'],
  },
  {
    key: 'snow-field', theme: 'snow',
    top: [['#f3e3d2', '#eadbca'], ['#e9d6c1', '#e0ceba'], ['#d7c4ad', '#cfbda6']],
    side: '#a28e76', bg: '#473a2d', water: null,
  },
  {
    key: 'snow-tundra', theme: 'snow',
    top: [['#e2dcc0', '#d9d4b9'], ['#cfc9a8', '#c7c1a2'], ['#b9b291', '#b2ab8b']],
    side: '#8a7f5e', bg: '#3e3827', water: null,
  },
  {
    key: 'snow-glacier', theme: 'snow',
    top: [['#f4ead1', '#ebe1c9'], ['#e9dcbe', '#e0d4b7'], ['#d9cbab', '#d1c3a5']],
    side: '#a19176', bg: '#46392b', water: ['#6aa6a2', '#3a6f6c'],
  },
  {
    key: 'snow-thaw', theme: 'snow',
    top: [['#dde0bd', '#d5d7b6'], ['#c7cfa9', '#bfc7a3'], ['#afba93', '#a8b38d']],
    side: '#7f8a62', bg: '#39412c', water: ['#67a8a0', '#376f69'],
  },
];

/** The skin a match wears: one of its theme's four, from the seed. */
export function skinFor(theme: ThemeKey, seed: number): MapSkin {
  const of = SKINS.filter((s) => s.theme === theme);
  const h = Math.abs(Math.imul(seed ^ 0x5f356495, 2654435761)) >>> 0;
  return of[h % of.length]!;
}
