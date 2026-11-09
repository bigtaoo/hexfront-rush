// Fixed-point hex math (odd-r offset, pointy top, hex radius 1 world unit) and the map's size.

import { FP } from './fixed';

export const COLS = 13;
/** Odd: the map mirrors top to bottom around the middle row. */
export const ROWS = 25;
export const MID_ROW = (ROWS - 1) >> 1;
export const NTILES = COLS * ROWS;

/** sqrt(3)/2 x FP */
export const HALF_W = 866;
/** Centre-to-centre distance of neighbours, fixed point. */
export const TILE = 2 * HALF_W;
/** 1.5 x FP */
export const ROW_H = 1500;
const NB_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const NB_ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

export const hexX = (c: number, r: number): number => HALF_W * (2 * c + (r & 1) + 1);
export const hexY = (r: number): number => ROW_H * r + FP;
export const inMap = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < COLS && r < ROWS;
export const idx = (c: number, r: number): number => r * COLS + c;

export interface Hex {
  c: number;
  r: number;
}

/** The hex whose centre is nearest (x, y), exact in integers. Rows r0-1..r0+2 bracket y, and
 *  within a row the nearest centre by x is the nearest by distance. Ties keep the first row. */
export function worldToHex(x: number, y: number): Hex {
  const r0 = Math.floor((y - FP) / ROW_H);
  let bc = 0, br = 0, bd = -1;
  for (let r = r0 - 1; r <= r0 + 2; r++) {
    const c = Math.floor((x - HALF_W * (r & 1)) / TILE);
    const dx = x - hexX(c, r), dy = y - hexY(r);
    const d = dx * dx + dy * dy;
    if (bd < 0 || d < bd) {
      bd = d;
      bc = c;
      br = r;
    }
  }
  return { c: bc, r: br };
}

export function toCube(c: number, r: number): { x: number; y: number; z: number } {
  const x = c - (r - (r & 1)) / 2;
  return { x, y: -x - r, z: r };
}

export function hexDist(c1: number, r1: number, c2: number, r2: number): number {
  const a = toCube(c1, r1), b = toCube(c2, r2);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

/** Tile indexes of the in-map neighbours of (c, r), in a fixed order. */
export function neighbors(c: number, r: number): number[] {
  const d = r & 1 ? NB_ODD : NB_EVEN;
  const out: number[] = [];
  for (let k = 0; k < 6; k++) {
    const nc = c + d[k][0], nr = r + d[k][1];
    if (inMap(nc, nr)) out.push(idx(nc, nr));
  }
  return out;
}
