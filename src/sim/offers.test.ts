// Where the cards stand (Engine.recomputeOffers, tryBuy): on the free tiles next to the tiles a
// team has flipped. Every flip opens the tiles around it, a mystery that gave nothing included.

import { describe, expect, it } from 'vitest';
import { damage } from './combat';
import { tryBuy } from './economy';
import { Engine } from './engine';
import { NTILES } from './hex';
import { baseTile } from './map';
import { OF_MINE, OF_MYST, TEAM_BLUE, TEAM_RED } from './rules';

const fresh = () => new Engine({ seed: 31, aiBlue: false, aiRed: false });
/** Tiles with a card for `team`. */
const cards = (e: Engine, team: number) => {
  const out: number[] = [];
  for (let i = 0; i < NTILES; i++) if (e.team[team]!.offers[i]! >= 0) out.push(i);
  return out;
};
/** A free tile next to the castle that has a free tile beyond it with no card yet. */
function frontier(e: Engine, team: number): { ti: number; beyond: number[] } {
  const T = e.team[team]!;
  for (const n of e.tiles[baseTile(team)]!.nb) {
    if (T.offers[n]! < 0) continue;
    const beyond = e.tiles[n]!.nb.filter((m) => !e.tiles[m]!.obst && !e.tiles[m]!.bld && T.offers[m]! < 0 && !T.open[m]);
    if (beyond.length) return { ti: n, beyond };
  }
  throw new Error('no frontier tile');
}

describe('cards', () => {
  it('start on the free tiles around the castle only', () => {
    const e = fresh();
    for (const team of [TEAM_BLUE, TEAM_RED]) {
      const ring = e.tiles[baseTile(team)]!.nb.filter((n) => !e.tiles[n]!.obst);
      expect(cards(e, team).sort((a, b) => a - b)).toEqual(ring.sort((a, b) => a - b));
    }
  });

  it('a mystery that gives nothing still opens the tiles around it, and is spent', () => {
    // flip mysteries until one gives nothing (70 %)
    for (let seed = 1; seed < 40; seed++) {
      const e = new Engine({ seed, aiBlue: false, aiRed: false });
      const T = e.team[TEAM_BLUE]!;
      const { ti, beyond } = frontier(e, TEAM_BLUE);
      T.offers[ti] = OF_MYST;
      T.gold = 1000;
      const units = e.units.length;
      expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
      if (e.units.length !== units) continue;
      expect(T.open[ti]).toBe(1);
      expect(T.offers[ti]).toBe(-1);
      expect(e.tiles[ti]!.owner).toBe(TEAM_BLUE);
      for (const m of beyond) expect(T.offers[m]).toBeGreaterThanOrEqual(0);
      return;
    }
    throw new Error('no mystery gave nothing');
  });

  it('a building opens the tiles around it; when it falls its tile takes a card again', () => {
    const e = fresh();
    const T = e.team[TEAM_BLUE]!;
    const { ti, beyond } = frontier(e, TEAM_BLUE);
    T.offers[ti] = OF_MINE;
    T.gold = 1000;
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
    for (const m of beyond) expect(T.offers[m]).toBeGreaterThanOrEqual(0);
    const mine = e.ent(e.tiles[ti]!.bld)!;
    damage(e, mine, 1e6, TEAM_RED, 1);
    expect(e.tiles[ti]!.bld).toBe(0);
    expect(T.open[ti]).toBe(0);
    expect(T.offers[ti]).toBeGreaterThanOrEqual(0);
  });
});
