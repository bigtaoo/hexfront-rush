// The map (map.ts) is where the match's fairness is decided, and until now nothing but the golden
// hashes said anything about it. Both sides have to get the same ground: the generator builds the
// top half and mirrors it onto the bottom, so every rock in front of blue has a twin in front of
// red. It also has to be playable at all — the castles reachable from one another, no open tile
// sealed off behind the walls, the home zone the guard wanders left clear — and it reaches that
// by throwing the map away and rolling again, up to 40 times. These tests sweep seeds and hold
// the generator to all of it, so a change to the templates cannot quietly make one side's half
// harder or hand out a map nobody can cross.

import { describe, expect, it } from 'vitest';
import { COLS, hexDist, idx, MID_ROW, NTILES, ROWS } from './hex';
import { BASE_POS, baseTile, generateMap, THEME_OBST, type Tile } from './map';
import { HOME_RADIUS, TEAM_BLUE, TEAM_RED } from './rules';

/** Enough seeds that a template which only sometimes goes wrong still shows up. */
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 1013);

const mirror = (t: Tile): number => idx(t.c, ROWS - 1 - t.r);

/** Every tile the walk from `start` can reach without stepping on an obstacle. */
function reach(tiles: readonly Tile[], start: number): Uint8Array {
  const seen = new Uint8Array(NTILES);
  const q = [start];
  seen[start] = 1;
  for (let h = 0; h < q.length; h++) {
    for (const n of tiles[q[h]!]!.nb) {
      if (!seen[n] && !tiles[n]!.obst) {
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  return seen;
}

describe('a generated map is the same for both sides', () => {
  it('mirrors the top half onto the bottom, obstacle for obstacle', () => {
    for (const seed of SEEDS) {
      const { tiles } = generateMap(seed);
      for (const t of tiles) {
        if (t.obst === tiles[mirror(t)]!.obst) continue;
        throw new Error(`seed ${seed}: tile ${t.c},${t.r} is "${t.obst}" but its mirror is "${tiles[mirror(t)]!.obst}"`);
      }
    }
  });

  it('puts the two castles the same distance from every tile on the middle row', () => {
    // where the contested map events go (cardLayout.ts): the mirror makes the middle row the
    // halfway line, so neither side is nearer to a chest than the other
    const b = BASE_POS[TEAM_BLUE]!, r = BASE_POS[TEAM_RED]!;
    for (let c = 0; c < COLS; c++) {
      expect(hexDist(c, MID_ROW, b.c, b.r)).toBe(hexDist(c, MID_ROW, r.c, r.r));
    }
  });
});

describe('a generated map can be played on', () => {
  it('leaves the castles able to reach each other, with no open tile sealed off', () => {
    for (const seed of SEEDS) {
      const { tiles } = generateMap(seed);
      const seen = reach(tiles, baseTile(TEAM_BLUE));
      if (!seen[baseTile(TEAM_RED)]) throw new Error(`seed ${seed}: the castles do not connect`);
      // a pocket the armies could never walk into is filled in, not left as playable ground
      for (const t of tiles) {
        if (t.obst || seen[t.i]) continue;
        throw new Error(`seed ${seed}: tile ${t.c},${t.r} is open ground nobody can walk to`);
      }
    }
  });

  it('keeps both home zones and both castle tiles clear', () => {
    for (const seed of SEEDS) {
      const { tiles } = generateMap(seed);
      for (const t of tiles) {
        if (!t.obst) continue;
        for (const team of [TEAM_BLUE, TEAM_RED]) {
          const b = BASE_POS[team]!;
          if (hexDist(t.c, t.r, b.c, b.r) <= HOME_RADIUS) {
            throw new Error(`seed ${seed}: "${t.obst}" at ${t.c},${t.r} is inside team ${team}'s home zone`);
          }
        }
      }
    }
  });

  it('keeps the obstacles between 7% and 20% of the map', () => {
    // under 7% the field is a bare plain, over 20% the lanes choke: the generator rolls again
    let lo = 100, hi = 0;
    for (const seed of SEEDS) {
      const { tiles } = generateMap(seed);
      const pct = (tiles.filter((t) => t.obst).length * 100) / NTILES;
      lo = Math.min(lo, pct);
      hi = Math.max(hi, pct);
    }
    expect(lo).toBeGreaterThanOrEqual(7);
    expect(hi).toBeLessThanOrEqual(20);
  });

  it('scatters only the obstacles its own theme names', () => {
    for (const seed of SEEDS) {
      const { tiles, themeKey } = generateMap(seed);
      const kinds = THEME_OBST[themeKey];
      for (const t of tiles) {
        if (t.obst && !kinds.includes(t.obst)) {
          throw new Error(`seed ${seed}: a ${themeKey} map grew a "${t.obst}"`);
        }
      }
    }
  });

  it('gives every theme a turn', () => {
    const seen = new Set(SEEDS.map((s) => generateMap(s).themeKey));
    expect([...seen].sort()).toEqual(['desert', 'meadow', 'snow']);
  });
});

describe('a generated map is rebuilt from the seed alone', () => {
  it('gives the same map every time, and a different one per seed', () => {
    // the map is never hashed or snapshotted (map.ts): a replay re-rolls it from the seed, so two
    // runs of the same seed have to come out identical, tile for tile
    const shape = (seed: number) => {
      const m = generateMap(seed);
      return m.themeKey + '|' + m.tiles.map((t) => t.obst || '.').join('');
    };
    for (const seed of [0, 1, 7, 12345, 0xffffffff]) expect(shape(seed)).toBe(shape(seed));
    const shapes = new Set(SEEDS.slice(0, 50).map(shape));
    expect(shapes.size).toBe(50);
  });

  it('hands back dynamic fields nobody has touched yet', () => {
    // generateMap owns the static half of a Tile; the Engine fills the rest in
    for (const t of generateMap(99).tiles) {
      expect([t.owner, t.bld, t.rubble, t.event]).toEqual([0, 0, 0, 0]);
      expect(t.nb.length).toBeGreaterThanOrEqual(2);
      expect(t.i).toBe(idx(t.c, t.r));
    }
  });
});
