// Walking the grid (path.ts): the flow field every marching troop follows and the detour it takes
// round a rock. Both were lifted out of engine.ts in one piece, so nothing here is new behaviour —
// what is new is that the rules are written down. The one that is easy to lose by accident: a
// path sees obstacles and nothing else, so a building or a troop in the way never re-routes an
// army. These tests run on real generated maps, since a hand-made grid would not have the shapes
// the generator actually makes.

import { describe, expect, it } from 'vitest';
import { idx, NTILES, ROWS } from './hex';
import { baseTile, generateMap, type Tile } from './map';
import { bfsPath, distanceField, FAR } from './path';
import { TEAM_BLUE, TEAM_RED } from './rules';

const map = (seed = 4242) => generateMap(seed).tiles;

describe('distanceField', () => {
  const tiles = map();
  const d = distanceField(tiles, baseTile(TEAM_BLUE));

  it('starts at zero and counts one tile per step', () => {
    expect(d[baseTile(TEAM_BLUE)]).toBe(0);
    for (const n of tiles[baseTile(TEAM_BLUE)]!.nb) if (!tiles[n]!.obst) expect(d[n]).toBe(1);
  });

  it('is a shortest walk: every reachable tile is one step past its nearest open neighbour', () => {
    for (const t of tiles) {
      if (t.obst || d[t.i] === 0 || d[t.i] === FAR) continue;
      let best = FAR;
      for (const n of t.nb) if (!tiles[n]!.obst && d[n]! < best) best = d[n]!;
      expect(d[t.i]).toBe(best + 1);
    }
  });

  it('leaves obstacles, and anything walled in behind them, at FAR', () => {
    for (const t of tiles) if (t.obst) expect(d[t.i]).toBe(FAR);
    // a ring of obstacles round a tile cuts it off, however close it is
    const walled = tiles.map((t) => ({ ...t }));
    const hole = idx(6, 12);
    for (const n of walled[hole]!.nb) walled[n]!.obst = 'rock';
    expect(distanceField(walled, baseTile(TEAM_BLUE))[hole]).toBe(FAR);
  });

  it('reaches the enemy castle, and reaches it the same way round from either side', () => {
    // the mirror in map.ts is the match's fairness, and this is what it buys: blue's walk to any
    // tile is red's walk to that tile's mirror, so neither side marches further to the same spot
    const blue = distanceField(tiles, baseTile(TEAM_BLUE));
    const red = distanceField(tiles, baseTile(TEAM_RED));
    expect(blue[baseTile(TEAM_RED)]).toBeLessThan(FAR);
    for (const t of tiles) expect(blue[t.i]).toBe(red[idx(t.c, ROWS - 1 - t.r)]);
  });
});

describe('bfsPath', () => {
  const tiles = map();
  const from = baseTile(TEAM_BLUE);

  it('walks a real route: each step a neighbour of the last, the target last, the start left out', () => {
    const to = baseTile(TEAM_RED);
    const p = bfsPath(tiles, from, to)!;
    expect(p).not.toBeNull();
    expect(p[p.length - 1]).toBe(to);
    expect(p).not.toContain(from);
    let cur = from;
    for (const step of p) {
      expect(tiles[cur]!.nb).toContain(step);
      expect(tiles[step]!.obst).toBe('');
      cur = step;
    }
  });

  it('takes the shortest route there', () => {
    const d = distanceField(tiles, from);
    for (const to of [baseTile(TEAM_RED), idx(0, 12), idx(12, 6), idx(3, 20)]) {
      if (tiles[to]!.obst) continue;
      expect(bfsPath(tiles, from, to)!.length).toBe(d[to]);
    }
  });

  it('gives an empty path when it is already there', () => {
    expect(bfsPath(tiles, from, from)).toEqual([]);
  });

  it('refuses a target that is an obstacle, off the map, or walled in', () => {
    const rock = tiles.find((t) => t.obst)!;
    expect(bfsPath(tiles, from, rock.i)).toBeNull();
    expect(bfsPath(tiles, from, -1)).toBeNull();
    expect(bfsPath(tiles, from, NTILES)).toBeNull();
    const walled: Tile[] = tiles.map((t) => ({ ...t }));
    const hole = idx(6, 12);
    for (const n of walled[hole]!.nb) walled[n]!.obst = 'rock';
    expect(bfsPath(walled, from, hole)).toBeNull();
  });

  it('walks straight through buildings and rubble: only obstacles are walls', () => {
    // deliberate (path.ts): troops push past each other, and a path that changed every time a
    // mine went up would send the whole army back to the drawing board every few seconds
    const to = baseTile(TEAM_RED);
    const plain = bfsPath(tiles, from, to)!;
    const built: Tile[] = tiles.map((t) => ({ ...t }));
    for (const i of plain) {
      built[i]!.bld = 7;
      built[i]!.rubble = 30;
      built[i]!.owner = TEAM_RED;
    }
    expect(bfsPath(built, from, to)).toEqual(plain);
  });
});
