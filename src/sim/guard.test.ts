// The castle guard (guard.ts): where it may wander, that it keeps mostly in front of its castle and
// seldom goes behind, that it walks around the castle rather than through it, and that the tiles
// it walks become its team's.

import { describe, expect, it } from 'vitest';
import { Engine } from './engine';
import { crossesCastle, guardSpots } from './guard';
import { hexDist, idx, TILE } from './hex';
import { BASE_POS, baseTile } from './map';
import { GUARD, INTRO_TICKS, TEAM_BLUE, TEAM_RED } from './rules';

const fwdOf = (team: number) => (team === TEAM_BLUE ? -1 : 1);

describe('guardSpots', () => {
  const e = new Engine({ seed: 77, aiBlue: false, aiRed: false });
  for (const team of [TEAM_BLUE, TEAM_RED]) {
    it(`team ${team}: passable tiles near the castle, the front ones liked most`, () => {
      const s = guardSpots(e.tiles, team);
      const bp = BASE_POS[team]!;
      expect(s.tiles.length).toBeGreaterThan(8);
      for (let k = 0; k < s.tiles.length; k++) {
        const t = e.tiles[s.tiles[k]!]!;
        const d = hexDist(t.c, t.r, bp.c, bp.r);
        expect(t.obst).toBeFalsy();
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(GUARD.wanderRadius);
        const ahead = (t.r - bp.r) * fwdOf(team);
        expect(s.weights[k]).toBe(ahead > 0 ? GUARD.wantFront : ahead === 0 ? GUARD.wantSide : GUARD.wantBack);
      }
      expect(s.start).toBe(idx(bp.c, bp.r + 2 * fwdOf(team)));
      expect(GUARD.wantFront).toBeGreaterThan(GUARD.wantSide);
      expect(GUARD.wantSide).toBeGreaterThan(GUARD.wantBack);
    });
  }
});

describe('crossesCastle', () => {
  const e = new Engine({ seed: 77, aiBlue: false, aiRed: false });
  const home = e.tiles[baseTile(TEAM_BLUE)]!;
  it('a straight line over the castle crosses it, one beside it does not', () => {
    expect(crossesCastle(home.x, home.y - 2 * TILE, home.x, home.y + 2 * TILE, home)).toBe(true);
    expect(crossesCastle(home.x - 2 * TILE, home.y - TILE, home.x + 2 * TILE, home.y - TILE, home)).toBe(false);
    // a path that ends short of the castle does not cross it
    expect(crossesCastle(home.x, home.y - 2 * TILE, home.x, home.y - TILE, home)).toBe(false);
  });
});

describe('the guard on its own', () => {
  // no AI and no commands: nothing ever attacks, so the guard only wanders
  const e = new Engine({ seed: 2024, aiBlue: false, aiRed: false });
  const seen = [0, 0, 0, 0, 0, 0];
  const walked = [new Set<number>(), new Set<number>(), new Set<number>()];
  // the guard stands several seconds at each spot, so it takes minutes to see where it likes to go
  const until = INTRO_TICKS + 240 * 30;
  while (e.tick < until) {
    e.step(null);
    if (e.tick <= INTRO_TICKS) continue;
    for (const team of [TEAM_BLUE, TEAM_RED]) {
      const g = e.guards[team]!;
      const t = e.tileAt(g.x, g.y)!;
      const bp = BASE_POS[team]!;
      const ahead = (t.r - bp.r) * fwdOf(team);
      seen[team * 3 - 3 + (ahead > 0 ? 0 : ahead === 0 ? 1 : 2)]++;
      walked[team]!.add(t.i);
    }
  }

  for (const team of [TEAM_BLUE, TEAM_RED]) {
    it(`team ${team}: wanders, mostly in front, seldom behind`, () => {
      const [front, side, back] = seen.slice(team * 3 - 3, team * 3) as [number, number, number];
      const all = front + side + back;
      expect(walked[team]!.size).toBeGreaterThan(5);
      expect(front / all).toBeGreaterThan(0.45);
      expect(back / all).toBeLessThan(0.2);
    });

    it(`team ${team}: the tiles it walked are its team's`, () => {
      for (const i of walked[team]!) {
        const t = e.tiles[i]!;
        if (!t.obst && !t.bld) expect(t.owner).toBe(team);
      }
    });
  }

  it('the same seed wanders the same way', () => {
    const b = new Engine({ seed: 2024, aiBlue: false, aiRed: false });
    while (b.tick < until) b.step(null);
    expect(b.hash()).toBe(e.hash());
  });
});
