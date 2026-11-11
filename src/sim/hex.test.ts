// The board's geometry (hex.ts). Everything downstream reads a distance from here: HOME_RADIUS,
// how far apart map events are laid, where a guard stands, what a tower can reach. Two promises
// are worth more than they look. hexDist is the real walking distance on this board — the
// rectangle is wide enough that nothing is ever forced round a corner — so "three tiles away" in
// a design table is three steps for a troop. And the mirror the map generator relies on is exact
// in world coordinates, not nearly: ROWS is odd, so a row and its mirror share their parity and
// therefore their x offsets.

import { describe, expect, it } from 'vitest';
import { dist } from './fixed';
import { COLS, hexDist, hexX, hexY, idx, inMap, MID_ROW, neighbors, NTILES, ROW_H, ROWS, TILE, toCube, worldToHex } from './hex';

const tiles: { c: number; r: number }[] = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) tiles.push({ c, r });

/** Steps from `start` to every tile, walking neighbours on an empty board. */
function graphDist(start: number): Int32Array {
  const d = new Int32Array(NTILES).fill(-1);
  d[start] = 0;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const i = q[h]!;
    for (const n of neighbors(i % COLS, Math.floor(i / COLS))) {
      if (d[n]! < 0) {
        d[n] = d[i]! + 1;
        q.push(n);
      }
    }
  }
  return d;
}

describe('the board', () => {
  it('has an odd number of rows, so the middle row is its own mirror', () => {
    expect(ROWS % 2).toBe(1);
    expect(ROWS - 1 - MID_ROW).toBe(MID_ROW);
    expect(NTILES).toBe(COLS * ROWS);
  });

  it('indexes every tile once, and nothing off the board', () => {
    const seen = new Set<number>();
    for (const t of tiles) {
      expect(inMap(t.c, t.r)).toBe(true);
      const i = idx(t.c, t.r);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(NTILES);
      expect(seen.has(i)).toBe(false);
      seen.add(i);
    }
    expect(seen.size).toBe(NTILES);
    for (const [c, r] of [[-1, 0], [0, -1], [COLS, 0], [0, ROWS]]) expect(inMap(c!, r!)).toBe(false);
  });

  it('mirrors top to bottom exactly: a row and its mirror sit at the same x', () => {
    // map.ts copies the top half onto the bottom; if the two halves' rows differed in parity the
    // copied obstacles would land half a tile across and the sides would not be equal
    for (const t of tiles) {
      expect(hexX(t.c, ROWS - 1 - t.r)).toBe(hexX(t.c, t.r));
      expect(hexY(t.r) + hexY(ROWS - 1 - t.r)).toBe(2 * hexY(MID_ROW));
    }
  });
});

describe('neighbors', () => {
  it('are mutual, distinct, never the tile itself, and never off the board', () => {
    for (const t of tiles) {
      const i = idx(t.c, t.r);
      const nb = neighbors(t.c, t.r);
      expect(nb.length).toBeLessThanOrEqual(6);
      expect(new Set(nb).size).toBe(nb.length);
      expect(nb).not.toContain(i);
      for (const n of nb) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(NTILES);
        expect(neighbors(n % COLS, Math.floor(n / COLS))).toContain(i);
      }
    }
  });

  it('are six in the middle, fewer at the edge, and all one step away', () => {
    expect(neighbors(6, 12).length).toBe(6);
    expect(neighbors(0, 0).length).toBeLessThan(6);
    for (const t of tiles) {
      for (const n of neighbors(t.c, t.r)) {
        expect(hexDist(t.c, t.r, n % COLS, Math.floor(n / COLS))).toBe(1);
      }
    }
  });

  it('sit the same distance away whichever direction they lie in', () => {
    // a tower's range is one number in world units; it has to mean the same reach in all six
    for (const t of tiles) {
      for (const n of neighbors(t.c, t.r)) {
        const nc = n % COLS, nr = Math.floor(n / COLS);
        const d = dist(hexX(nc, nr) - hexX(t.c, t.r), hexY(nr) - hexY(t.r));
        expect(Math.abs(d - TILE)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('hexDist', () => {
  it('is zero to itself and reads the same both ways round', () => {
    for (const t of tiles) {
      expect(hexDist(t.c, t.r, t.c, t.r)).toBe(0);
      expect(hexDist(t.c, t.r, 6, 12)).toBe(hexDist(6, 12, t.c, t.r));
    }
    const cube = toCube(6, 12);
    expect(cube.x + cube.y + cube.z).toBe(0);
  });

  it('is the walking distance for every pair of tiles on the board', () => {
    // the whole board, 105,625 pairs: the rectangle never forces a detour, so a table that says
    // "three tiles" is three steps, not three-as-the-crow-flies and five on foot
    const bad: string[] = [];
    for (const from of tiles) {
      const d = graphDist(idx(from.c, from.r));
      for (const to of tiles) {
        const walk = d[idx(to.c, to.r)]!, straight = hexDist(from.c, from.r, to.c, to.r);
        if (walk !== straight) bad.push(from.c + ',' + from.r + ' to ' + to.c + ',' + to.r + ': ' + straight + ' vs ' + walk);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

describe('worldToHex', () => {
  it('finds the tile back from its own centre', () => {
    for (const t of tiles) expect(worldToHex(hexX(t.c, t.r), hexY(t.r))).toEqual(t);
  });

  it('picks the nearest centre anywhere, including off the board', () => {
    // a tap lands anywhere, and troops are asked for their tile while standing between two
    const bad: string[] = [];
    for (let y = -3000; y < ROWS * ROW_H + 3000; y += 401) {
      for (let x = -3000; x < COLS * TILE + 3000; x += 409) {
        const h = worldToHex(x, y);
        const got = (x - hexX(h.c, h.r)) ** 2 + (y - hexY(h.r)) ** 2;
        let best = Infinity;
        for (let r = -5; r < ROWS + 5; r++) {
          for (let c = -5; c < COLS + 5; c++) {
            const d = (x - hexX(c, r)) ** 2 + (y - hexY(r)) ** 2;
            if (d < best) best = d;
          }
        }
        if (got !== best) bad.push(x + ',' + y + ' -> ' + h.c + ',' + h.r);
      }
    }
  });
});
