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

/** The box every troop stays inside: the tile centres with a tile's slack all round. Only the
 *  troop grid (troops.ts separate) reads it; nothing in the sim is clamped to it. */
export const WORLD_W = HALF_W * 2 * COLS + TILE;
export const WORLD_H = ROW_H * (ROWS - 1) + FP + TILE;

/** The last answer of `nearest`. Module state because the sim asks a few times per troop per
 *  tick and an object per call was showing up in the profile; it is written and read in the same
 *  call, the sim is single-threaded, and nothing is carried between ticks. */
let hitC = 0, hitR = 0;

/** The hex whose centre is nearest (x, y), exact in integers, into hitC/hitR. Only rows r0 and
 *  r0+1 can win: within a row the nearest centre by x is the nearest by distance, and it is at
 *  most HALF_W away, so one of these two rows is within sqrt(866^2 + 750^2) = 1145, while every
 *  other row is at least ROW_H = 1500 away in y alone. Ties keep the first row. */
function nearest(x: number, y: number): void {
  const r0 = Math.floor((y - FP) / ROW_H);
  let bc = 0, br = 0, bd = -1;
  for (let r = r0; r <= r0 + 1; r++) {
    const c = Math.floor((x - HALF_W * (r & 1)) / TILE);
    const dx = x - hexX(c, r), dy = y - hexY(r);
    const d = dx * dx + dy * dy;
    if (bd < 0 || d < bd) {
      bd = d;
      bc = c;
      br = r;
    }
  }
  hitC = bc;
  hitR = br;
}

/** The nearest hex as a pair, for callers that want the coordinates even off the map. */
export function worldToHex(x: number, y: number): Hex {
  nearest(x, y);
  return { c: hitC, r: hitR };
}

/** The nearest hex's tile index, or -1 off the map. The sim's hot path: no allocation. */
export function worldToTile(x: number, y: number): number {
  nearest(x, y);
  return inMap(hitC, hitR) ? idx(hitC, hitR) : -1;
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
