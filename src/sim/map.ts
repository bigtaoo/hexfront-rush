// Themes and map generation (static: rebuilt from the seed, never hashed or snapshotted).
// 13 x 25, castles 16 rows apart with a 4-row back yard behind each. The top half is laid out
// from a template with seeded variations and mirrored onto the bottom half:
//   home zone   hex distance <= 3 around the castle stays open (the guard wanders it)
//   back yard   a few groves in the corners behind the castle
//   walls       two wall segments across the field leave three lanes: left, centre, right
//   centre      a small rock island on the middle row splits the centre lane
//   groves      a few small clumps in the open field
// A BFS from one castle then checks the castles connect and fills any sealed pocket.

import { COLS, hexDist, hexX, hexY, idx, inMap, MID_ROW, neighbors, NTILES, ROWS, type Hex } from './hex';
import { Prng, streamSeed } from './prng';
import { HOME_RADIUS, TEAM_BLUE, TEAM_NONE, TEAM_RED } from './rules';

export type Obstacle = '' | 'tree' | 'pine' | 'rock' | 'cactus' | 'ice';
export type ThemeKey = 'meadow' | 'desert' | 'snow';
export interface Theme {
  name: ThemeKey;
  ground: readonly [string, string];
  side: string;
  bg: string;
  obst: readonly Obstacle[];
}

export const THEME_KEYS: readonly ThemeKey[] = ['meadow', 'desert', 'snow'];
export const THEMES: Record<ThemeKey, Theme> = {
  meadow: { name: 'meadow', ground: ['#9bd06a', '#8fc75f'], side: '#5f8f3a', bg: '#3f6b2a', obst: ['tree', 'tree', 'rock'] },
  desert: { name: 'desert', ground: ['#ecd08f', '#e4c47d'], side: '#b48a46', bg: '#8a6630', obst: ['cactus', 'rock', 'cactus'] },
  snow: { name: 'snow', ground: ['#e6eef6', '#dbe6f1'], side: '#93a8bf', bg: '#4d6582', obst: ['pine', 'ice', 'pine'] },
};

export interface Tile {
  i: number;
  c: number;
  r: number;
  x: number;
  y: number;
  obst: Obstacle;
  nb: number[];
  shade: number;
  deco: number;
  // dynamic fields: owned by Engine
  owner: number;
  bld: number;
  rubble: number;
  /** The map event waiting here (EVENT_LIST index, 0: none or claimed). */
  event: number;
}

export interface GameMap {
  tiles: Tile[];
  theme: Theme;
  themeKey: ThemeKey;
}

export const BASE_POS: readonly (Hex | null)[] = [null, { c: 6, r: ROWS - 5 }, { c: 6, r: 4 }];
export const baseTile = (team: number): number => idx(BASE_POS[team]!.c, BASE_POS[team]!.r);

export function generateMap(seed: number): GameMap {
  const rng = new Prng(streamSeed(seed, 1));
  const themeKey = THEME_KEYS[rng.int(THEME_KEYS.length)];
  const theme = THEMES[themeKey];
  const tiles: Tile[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      tiles.push({
        i: idx(c, r), c, r, x: hexX(c, r), y: hexY(r), obst: '', nb: neighbors(c, r),
        shade: (c * 7 + r * 3) % 2, deco: rng.int(1000),
        owner: TEAM_NONE, bld: 0, rubble: 0, event: 0,
      });
    }
  }
  const b1 = BASE_POS[1]!, b2 = BASE_POS[2]!;
  const isProtected = (c: number, r: number) => hexDist(c, r, b1.c, b1.r) <= HOME_RADIUS || hexDist(c, r, b2.c, b2.r) <= HOME_RADIUS;
  // place on the top half (r <= MID_ROW) and its mirror
  const put = (c: number, r: number) => {
    if (!inMap(c, r) || r > MID_ROW || isProtected(c, r)) return;
    const type = theme.obst[rng.int(theme.obst.length)];
    tiles[idx(c, r)].obst = type;
    tiles[idx(c, ROWS - 1 - r)].obst = type;
  };
  const clump = (c: number, r: number, len: number) => {
    for (let k = 0; k < len; k++) {
      put(c, r);
      const nb = neighbors(c, r);
      const n = tiles[nb[rng.int(nb.length)]];
      c = n.c;
      r = Math.min(MID_ROW, n.r);
    }
  };

  for (let attempt = 0; attempt < 40; attempt++) {
    for (const t of tiles) t.obst = '';
    // back yard: groves in the two corners behind the castle
    for (const c0 of [0, COLS - 1]) if (rng.int(3)) clump(c0, rng.int(2), 2 + rng.int(2));
    // walls: two segments that leave a side lane at each edge and a centre lane between them
    const wr = MID_ROW - 3 - rng.int(3); // rows 7..9
    const wl = 2 + rng.int(2); // 2-3 tiles each
    const gap = rng.int(2); // side lanes 2 or 3 tiles wide
    for (let k = 0; k < wl; k++) {
      put(2 + gap + k, wr);
      put(COLS - 3 - gap - k, wr);
    }
    if (rng.int(2)) {
      // a hook on the wall ends
      put(2 + gap, wr - 1);
      put(COLS - 3 - gap, wr - 1);
    }
    // centre: an island on the middle row (it mirrors onto itself)
    const mc = COLS >> 1;
    switch (rng.int(3)) {
      case 0: // a ridge
        put(mc, MID_ROW);
        put(mc - 1, MID_ROW);
        put(mc + 1, MID_ROW);
        break;
      case 1: // a column
        put(mc, MID_ROW);
        put(mc, MID_ROW - 1);
        break;
      default: // three rocks
        put(mc - 2, MID_ROW);
        put(mc + 2, MID_ROW);
        put(mc, MID_ROW - 2);
        break;
    }
    // groves in the open field
    const groves = 2 + rng.int(3);
    for (let g = 0; g < groves; g++) clump(rng.int(COLS), 5 + rng.int(MID_ROW - 5), 1 + rng.int(2));

    const seen = new Uint8Array(NTILES);
    const q = [baseTile(TEAM_BLUE)];
    seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      for (const n of tiles[q[h]].nb) {
        if (!seen[n] && !tiles[n].obst) {
          seen[n] = 1;
          q.push(n);
        }
      }
    }
    if (!seen[baseTile(TEAM_RED)]) continue;
    for (const t of tiles) if (!t.obst && !seen[t.i]) t.obst = theme.obst[0]; // fill isolated pockets
    let obst = 0;
    for (const t of tiles) if (t.obst) obst++;
    if (obst * 100 < NTILES * 7 || obst * 100 > NTILES * 20) continue;
    break;
  }
  return { tiles, theme, themeKey };
}
