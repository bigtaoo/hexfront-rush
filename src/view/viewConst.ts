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
  // the trailing side's two outlets: a cut price and a mine paying over the odds
  rebate: '#86efac', surge: '#4ade80',
} as const;

/** A card's rarity colour: common, rare, epic, legendary. It used to sit in the sim's rules table,
 *  which has no business naming colours. */
export const RARITY_COLOR = ['#9aa5b1', '#38bdf8', '#c084fc', '#fbbf24'] as const;

/** The light wood of the page's buttons (index.html --wood-hi, --wood, --wood-rim): the HUD's slots
 *  sit in frames of it, so the canvas HUD and the HTML buttons beside it read as one carved set
 *  (the slots were dark grooves alone, a second style next to the raised wooden buttons). */
export const WOOD = { hi: 'rgba(243,214,164,0.8)', face: '#d9a865', rim: '#6e4320', ink: '#4a2c12' } as const;
/** The chrome drawn in Pixi (the match HUD, the overview button, the card pop) in the same carved-wood
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
  /** A slot inside a light wooden frame (hud.ts bezel): darker and solid, so the light frame
   *  does not show through it and its numbers stand out. */
  slot: 'rgba(40,23,9,0.92)',
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
/** The board's vertical foreshortening: a view-unit step across the ground is drawn this much
 *  shorter in y than the same step across it in x.
 *
 *  MEASURED, NOT CHOSEN (D126). The reference (D:/new/ref) packs its rows at 0.753 of one hex
 *  WIDTH; ours packed them at 0.866, which is simply what an unforeshortened pointy-top grid does.
 *  That one number is why our cells read tall and narrow where its read wide and squat, and it is
 *  also why our woods never closed: its crowns overlap the two rows ABOVE them, ours could only
 *  reach their diagonal neighbours. The reference gets its ratio from a FLAT-TOP grid squashed to
 *  0.87 of its height (obstacleView.ts carries that measurement). The ORIENTATION we cannot copy
 *  -- pointy-top odd-r is baked into the sim's world coordinates (sim/hex.ts hexX / hexY /
 *  nearest), so flipping it would change pathing, ranges and how far apart two troops stand -- but
 *  the squash we can, and 0.753 / 0.866 = 0.87 says it is the very same number. After it our rows
 *  sit 43.95 logical px apart against the reference's 45.2, and pitch over width is 0.754 against
 *  its 0.753. What still differs is the CELL's own aspect, and that is the orientation: ours is
 *  58.3 x 58.6 logical where the reference's is 60 x 45.2.
 *
 *  WHAT TAKES IT AND WHAT DOES NOT. It is a camera tilt, so everything measured ALONG THE GROUND
 *  is drawn shorter: tile centres (camera.vy, with wy its inverse), every hex outline anywhere in
 *  the game (pen.hexPts), the map's own bounds below, a prop's set-back from its tile centre
 *  (decor.ts, obstacleView.ts), where a picture stands its foot (art.ts TILE_FOOT), the two rows
 *  of an offer stamp (offers.ts) and the camera's lead up the board. HEIGHTS are not: no sprite is
 *  ever scaled by it, so figures stay upright and the same shape, which is what the reference does
 *  too. The one place it acts as a scale is the building cast (buildingView.ts BLD_K), to hold a
 *  building's size relative to its own cell steady rather than let it grow 15% against it. */
export const SQUASH = 0.87;
export const MAP_X0 = -0.15;
export const MAP_X1 = SQRT3 * (COLS + 0.5) + 0.15;
export const MAP_Y0 = -0.35 * SQUASH;
export const MAP_Y1 = (1.5 * (ROWS - 1) + 2.4) * SQUASH;
/** How much of the map a play view shows at most: about this many hexes across, rows down. */
export const VIEW_HEXES = 8.5;
export const VIEW_ROWS = 13;

export interface Pt {
  x: number;
  y: number;
}
