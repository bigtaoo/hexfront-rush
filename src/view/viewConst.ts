// Shared view constants: palette, fonts, the map's extent in view units.
//
// View units: one hex radius = 1 (the sim's FP = 1000). The map is drawn from the local team's
// side: for red the view flips vertically (the grid is mirrored top to bottom, so it maps onto
// itself) and sprites stay upright.

import { systemFont } from '../app/i18n';
import { FP } from '../sim/fixed';
import { COLS, hexY, ROWS } from '../sim/hex';
import { TEAM_BLUE } from '../sim/rules';

/** The two sides' ramps (500 / 700 / 400 / 300 of the Tailwind hues the art was drawn against),
 *  and the two colours that carry meaning on their own: `coin` is gold and good news, `hurt` is
 *  damage and bad news for the local player. Entries nothing draws with were dropped; add one back
 *  when something uses it. */
export const COL = {
  blue: '#3b82f6', blueDark: '#1d4ed8', blueSpark: '#60a5fa', blueLight: '#93c5fd',
  red: '#ef4444', redDark: '#b91c1c', redSpark: '#f87171', redLight: '#fca5a5',
  coin: '#fde047', hurt: '#fca5a5',
} as const;

/** A card's rarity colour: common, rare, epic, legendary. It used to sit in the sim's rules table,
 *  which has no business naming colours. */
export const RARITY_COLOR = ['#9aa5b1', '#38bdf8', '#c084fc', '#fbbf24'] as const;

/** The chrome drawn in Pixi (the match HUD, the edge markers, the card pop) in the same carved-wood
 *  palette as the DOM panels (index.html :root, art/STYLE.md UI). It used to be slate blue, which is
 *  the cold chrome of a different game: the board is a wooden toy on a table (view/table.ts), so the
 *  bars around it are wooden rails and the discs are wooden tokens. */
export const UI = {
  /** A rail's wood, its lit top face and its shaded underside come from these. */
  rail: 'rgba(67,40,15,0.93)',
  grain: 'rgba(28,15,5,0.22)',
  /** The dark line along a rail's board-facing edge, and the lip that catches the light. */
  rim: '#2e1b0b',
  lip: 'rgba(243,214,164,0.28)',
  /** A groove cut into the rail (the gold pill, the quest sign, the progress bar). */
  groove: 'rgba(28,15,5,0.55)',
  /** A token's wood and the warm rim around it. */
  token: 'rgba(58,35,14,0.86)',
  tokenRim: 'rgba(243,214,164,0.75)',
  /** Text on wood: full strength and quiet. */
  cream: '#f6e7cf',
  dim: '#d4bd96',
} as const;

// Lilita One (SIL OFL 1.1, public/fonts/) has one weight and no CJK or Cyrillic: Latin text uses it
// as is, the languages it cannot write (i18n.ts systemFont) use the system font at a heavy weight.
const SYSTEM_STACK = ['Trebuchet MS', 'Segoe UI', 'system-ui', 'sans-serif'];
export const fontStack = (): string[] => (systemFont() ? SYSTEM_STACK : ['Lilita One', ...SYSTEM_STACK]);
export type Weight = '400' | '800' | '900';
export const fontW = (w: number = 800): Weight => (systemFont() ? (String(w) as Weight) : '400');

export const teamCol = (t: number): string => (t === TEAM_BLUE ? COL.blue : COL.red);
export const teamDark = (t: number): string => (t === TEAM_BLUE ? COL.blueDark : COL.redDark);
export const teamLight = (t: number): string => (t === TEAM_BLUE ? COL.blueLight : COL.redLight);
/** The lighter spark a dying unit throws. */
export const teamSpark = (t: number): string => (t === TEAM_BLUE ? COL.blueSpark : COL.redSpark);

export const SQRT3 = Math.sqrt(3);
/** view y = this - world y, for the red side */
export const VIEW_FLIP_Y = (hexY(0) + hexY(ROWS - 1)) / FP;
// map bounds in view units (the same for both sides: the flip maps the grid onto itself)
export const MAP_X0 = -0.15;
export const MAP_X1 = SQRT3 * (COLS + 0.5) + 0.15;
export const MAP_Y0 = -0.35;
export const MAP_Y1 = 1.5 * (ROWS - 1) + 2.4;
/** How much of the map a play view shows at most: about this many hexes across, rows down. */
export const VIEW_HEXES = 8.5;
export const VIEW_ROWS = 13;

export interface Pt {
  x: number;
  y: number;
}
