// Shared view constants: palette, fonts, the map's extent in view units.
//
// View units: one hex radius = 1 (the sim's FP = 1000). The map is drawn from the local team's
// side: for red the view flips vertically (the grid is mirrored top to bottom, so it maps onto
// itself) and sprites stay upright.

import { systemFont } from '../app/i18n';
import { FP } from '../sim/fixed';
import { COLS, hexY, ROWS } from '../sim/hex';
import { TEAM_BLUE } from '../sim/rules';

export const COL = {
  blue: '#3b82f6', blueDark: '#1d4ed8', blueLight: '#93c5fd', blueTile: 'rgba(59,130,246,0.55)', blueSide: '#1e3a8a',
  red: '#ef4444', redDark: '#b91c1c', redLight: '#fca5a5', redTile: 'rgba(239,68,68,0.55)', redSide: '#7f1d1d',
  gold: '#fbbf24', ink: '#1f2937', white: '#ffffff',
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
