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
// The board is the LIGHTEST large surface in the game and very nearly the only colourless one.
// Three value bands -- light board, mid cast and cards, dark chrome -- and one saturation budget,
// nearly all of which is spent on the two territories (ground.ts TEAM_HUE), because who owns what
// is the thing a player has to read first. The first cut of these skins sat at saturation 0.25,
// which read as concrete (D85), and the answer then was to push every theme back up -- meadow to
// 0.30-0.51, desert to 0.38-0.49. Measured against art/ref that went far the other way: the whole
// frame came to saturation 0.54 against the reference's 0.33, a plain tile, a tree standing on it
// and the card lying on it all measured value 0.74-0.80 -- one band where there should be two --
// and the pale team tint of the day had no chance of standing out from a ground as colourful as
// itself. So a theme now keeps its hue and almost none of its chroma: meadow 0.12, desert 0.14,
// snow 0.055, all at value 0.82-0.91, stepping down 0.014 a shade so the three zones (home, field,
// contested) still read. At that chroma a theme is a tint of the table rather than a colour of its
// own, which is exactly what lets a red or blue field laid over it be the loudest thing on screen.
// Snow stays the lightest board of the three; it is still the saturation, not the value, that tells
// the themes apart. The sides stay dark and keep more of their chroma than the tops: a block is
// carved by its edge, not by its top. The ponds keep their chroma too and now sit *darker* than
// the board, which is what a hole in the ground should do: a pond covers a few tiles, so colour
// there is cheap, and it stays the one cool mark on a warm board.
// See DECISIONS.md D85, D86.

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
    top: [['#d7e4c9', '#d3e1c6'], ['#d0ddc3', '#ccdabf'], ['#c9d6bc', '#c6d2b9']],
    side: '#7d8f70', bg: '#2f4a2b', water: ['#6fb3a8', '#3d7a72'],
  },
  {
    key: 'meadow-summer', theme: 'meadow',
    top: [['#d6e4c9', '#d3e1c6'], ['#ceddc3', '#cbdabf'], ['#c8d6bc', '#c4d2b9']],
    side: '#718366', bg: '#274024', water: null,
  },
  {
    key: 'meadow-autumn', theme: 'meadow',
    top: [['#e4dec9', '#e1dbc6'], ['#ddd6c3', '#dad2bf'], ['#d6cebc', '#d2cab9']],
    side: '#8b7e6c', bg: '#44331f', water: ['#6ea89c', '#3c7067'],
  },
  {
    key: 'meadow-marsh', theme: 'meadow',
    top: [['#d4e4c9', '#d1e1c6'], ['#c7ddc3', '#c4dabf'], ['#bed6bc', '#bbd2b9']],
    side: '#698669', bg: '#263d31', water: ['#62a9a4', '#36756f'],
  },
  {
    key: 'desert-pale', theme: 'desert',
    top: [['#e6dac5', '#e2d7c2'], ['#ded4bf', '#dbd1bc'], ['#d7cdb9', '#d4c9b6']],
    side: '#ad9c83', bg: '#5f4936', water: null,
  },
  {
    key: 'desert-red', theme: 'desert',
    top: [['#e6d5c5', '#e2d2c2'], ['#decebf', '#dbcbbc'], ['#d7c5b9', '#d4c1b6']],
    side: '#978373', bg: '#4e3326', water: null,
  },
  {
    key: 'desert-canyon', theme: 'desert',
    top: [['#e6d3c5', '#e2cfc2'], ['#deccbf', '#dbc9bc'], ['#d7c5b9', '#d4c1b6']],
    side: '#8f776d', bg: '#472b22', water: ['#5f9e92', '#346b63'],
  },
  {
    key: 'desert-oasis', theme: 'desert',
    top: [['#e2e6c5', '#dfe2c2'], ['#ded7bf', '#dbd4bc'], ['#d7ceb9', '#d4cbb6']],
    side: '#9b8e76', bg: '#53432f', water: ['#5aab9a', '#2f7368'],
  },
  {
    key: 'snow-field', theme: 'snow',
    top: [['#e9e3dc', '#e6dfd9'], ['#e2dcd6', '#dfd8d2'], ['#dbd5cf', '#d7d2cc']],
    side: '#a2998f', bg: '#473a2d', water: null,
  },
  {
    key: 'snow-tundra', theme: 'snow',
    top: [['#e9e7dc', '#e6e3d9'], ['#e2e0d6', '#dfddd2'], ['#dbd9cf', '#d7d5cc']],
    side: '#8f8b7e', bg: '#3e3827', water: null,
  },
  {
    key: 'snow-glacier', theme: 'snow',
    top: [['#e9e5dc', '#e6e1d9'], ['#e2ded6', '#dfdbd2'], ['#dbd7cf', '#d7d4cc']],
    side: '#a19a8e', bg: '#46392b', water: ['#6aa6a2', '#3a6f6c'],
  },
  {
    key: 'snow-thaw', theme: 'snow',
    top: [['#e8e9dc', '#e4e6d9'], ['#dfe2d6', '#dcdfd2'], ['#d8dbcf', '#d4d7cc']],
    side: '#8a8f7e', bg: '#39412c', water: ['#67a8a0', '#376f69'],
  },
];

/** The skin a match wears: one of its theme's four, from the seed. */
export function skinFor(theme: ThemeKey, seed: number): MapSkin {
  const of = SKINS.filter((s) => s.theme === theme);
  const h = Math.abs(Math.imul(seed ^ 0x5f356495, 2654435761)) >>> 0;
  return of[h % of.length]!;
}
