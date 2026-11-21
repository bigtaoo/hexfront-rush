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
// team's periwinkle, and the snow skins stay warm grey rather than drifting blue.

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
    top: [['#ead9b2', '#e6d4ab'], ['#e6d1a4', '#e2cc9e'], ['#d7bd8c', '#d2b785'],
    ],
    side: '#ad8b5a', bg: '#5f4936', water: null,
  },
  {
    key: 'desert-red', theme: 'desert',
    top: [['#e3bd96', '#deb78f'], ['#d6ab84', '#d1a47d'], ['#c2906c', '#bd8965']],
    side: '#96643c', bg: '#4e3326', water: null,
  },
  {
    key: 'desert-canyon', theme: 'desert',
    top: [['#dcb79a', '#d7b193'], ['#c99b7d', '#c49476'], ['#b07f63', '#ab785c']],
    side: '#8a5540', bg: '#472b22', water: ['#5f9e92', '#346b63'],
  },
  {
    key: 'desert-oasis', theme: 'desert',
    top: [['#cfd3a0', '#c9ce99'], ['#dcce9b', '#d7c894'], ['#cdb887', '#c8b280']],
    side: '#9b8150', bg: '#53432f', water: ['#5aab9a', '#2f7368'],
  },
  {
    key: 'snow-field', theme: 'snow',
    top: [['#dcdfda', '#d4d8d2'], ['#d5d9d3', '#cdd2cb'], ['#c3c8c3', '#bbc1bb']],
    side: '#8a9394', bg: '#3c4448', water: null,
  },
  {
    key: 'snow-tundra', theme: 'snow',
    top: [['#d9d6c9', '#d2cfc1'], ['#c8c5b6', '#c1beaf'], ['#b3b0a2', '#acaa9b']],
    side: '#827c6d', bg: '#3e3c34', water: null,
  },
  {
    key: 'snow-glacier', theme: 'snow',
    top: [['#d3dbd7', '#cbd4cf'], ['#c2cdc9', '#bac6c1'], ['#aebbb8', '#a6b4b0']],
    side: '#7c8a8a', bg: '#333d40', water: ['#6aa6a2', '#3a6f6c'],
  },
  {
    key: 'snow-thaw', theme: 'snow',
    top: [['#d8d7c8', '#d0d0c0'], ['#c6cbba', '#bec4b2'], ['#aeb8a8', '#a6b1a0']],
    side: '#7f8673', bg: '#3a4038', water: ['#67a8a0', '#376f69'],
  },
];

/** The skin a match wears: one of its theme's four, from the seed. */
export function skinFor(theme: ThemeKey, seed: number): MapSkin {
  const of = SKINS.filter((s) => s.theme === theme);
  const h = Math.abs(Math.imul(seed ^ 0x5f356495, 2654435761)) >>> 0;
  return of[h % of.length]!;
}
