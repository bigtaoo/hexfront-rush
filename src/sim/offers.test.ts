// Where the cards stand (claims.recomputeOffers, tryBuy): on the free tiles next to the tiles a
// team has flipped. Every flip opens the tiles around it, a mystery that gave nothing included.

import { describe, expect, it } from 'vitest';
import { recomputeOffers } from './claims';
import { claimTile, damage } from './combat';
import { tryBuy } from './economy';
import { Engine } from './engine';
import { NTILES } from './hex';
import { baseTile } from './map';
import { OF_MINE, OF_MYST, TEAM_BLUE, TEAM_NONE, TEAM_RED, UNITS } from './rules';

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
    // flip mysteries until one gives nothing (60 %)
    for (let seed = 1; seed < 40; seed++) {
      const e = new Engine({ seed, aiBlue: false, aiRed: false });
      const T = e.team[TEAM_BLUE]!;
      const { ti, beyond } = frontier(e, TEAM_BLUE);
      T.offers[ti] = OF_MYST;
      T.gold = 1000;
      const units = e.units.length;
      expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
      if (e.units.length !== units || e.tiles[ti]!.bld) continue;
      expect(T.open[ti]).toBe(1);
      expect(T.offers[ti]).toBe(-1);
      expect(e.tiles[ti]!.owner).toBe(TEAM_BLUE);
      for (const m of beyond) expect(T.offers[m]).toBeGreaterThanOrEqual(0);
      return;
    }
    throw new Error('no mystery gave nothing');
  });

  it('a mystery can give a barracks: it stands on the tile, trains for good and counts as one', () => {
    for (let seed = 1; seed < 200; seed++) {
      const e = new Engine({ seed, aiBlue: false, aiRed: false });
      const T = e.team[TEAM_BLUE]!;
      const { ti, beyond } = frontier(e, TEAM_BLUE);
      T.offers[ti] = OF_MYST;
      T.gold = 1000;
      const units = e.units.length;
      expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
      const b = e.blds.find((x) => x.alive && x.tile === ti);
      if (!b) continue;
      expect(b.type).toBe('barracks');
      expect(b.team).toBe(TEAM_BLUE);
      expect(b.rarity).toBeGreaterThanOrEqual(1);
      expect(UNITS[b.unit as keyof typeof UNITS].rarity).toBe(b.rarity);
      expect(e.units.length).toBe(units);
      expect(T.built.mystery).toBe(1);
      expect(T.built.barracks).toBe(1);
      expect(T.offers[ti]).toBe(-1);
      for (const m of beyond) expect(T.offers[m]).toBeGreaterThanOrEqual(0);
      return;
    }
    throw new Error('no mystery gave a barracks');
  });

  it('a building opens the tiles around it; its rubble belongs to whoever razed it', () => {
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
    // razing takes the ground (combat.damage), and no one buys on the enemy's ground: the rubble
    // carries no card for blue until a blue troop stands on it again
    expect(e.tiles[ti]!.owner).toBe(TEAM_RED);
    expect(T.offers[ti]).toBe(-1);
    claimTile(e, TEAM_BLUE, e.tiles[ti]!);
    expect(T.offers[ti]).toBeGreaterThanOrEqual(0);
  });

  it('go off ground the enemy holds, and the buy is refused there too', () => {
    const e = fresh();
    const T = e.team[TEAM_BLUE]!;
    const { ti } = frontier(e, TEAM_BLUE);
    T.gold = 1000;
    const card = T.offers[ti]!;
    expect(card).toBeGreaterThanOrEqual(0);
    // a red troop walks onto the tile: it is red's ground, and blue's card goes with it
    claimTile(e, TEAM_RED, e.tiles[ti]!);
    expect(T.offers[ti]).toBe(-1);
    // and the rule is on the door, not only on the sign: a stale flip cannot build there either
    T.offers[ti] = card;
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(false);
    expect(e.tiles[ti]!.bld).toBe(0);
    expect(T.gold).toBe(1000);
    // blue wins it back the way it was lost, by standing on it
    T.offers[ti] = -1;
    claimTile(e, TEAM_BLUE, e.tiles[ti]!);
    expect(T.offers[ti]).toBeGreaterThanOrEqual(0);
  });

  it('building on the border pushes the enemy claim off the bare ground beyond it', () => {
    const e = fresh();
    const T = e.team[TEAM_BLUE]!;
    const { ti, beyond } = frontier(e, TEAM_BLUE);
    // a red troop has been over the ground past the frontier tile: it is red's, and no blue card
    // stands on it
    const far = beyond[0]!;
    claimTile(e, TEAM_RED, e.tiles[far]!);
    expect(T.offers[far]).toBe(-1);
    // blue builds on the frontier tile. The bare hex beyond goes back to no-man's-land, and the
    // card that could not stand there a moment ago now can: the front moves a hex at a time
    T.offers[ti] = OF_MINE;
    T.gold = 1000;
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
    expect(e.tiles[far]!.owner).toBe(TEAM_NONE);
    expect(T.offers[far]).toBeGreaterThanOrEqual(0);
  });

  it('a troop that takes a hex off the enemy pushes their claim off the bare ground beyond', () => {
    // the half of D134 that works for whoever is losing: the push-back cannot be building's alone,
    // or a side pressed back onto its own buildings has no tile to buy on and so no way to ever get
    // one back
    const e = fresh();
    const T = e.team[TEAM_BLUE]!;
    const { ti, beyond } = frontier(e, TEAM_BLUE);
    const far = beyond[0]!;
    claimTile(e, TEAM_RED, e.tiles[ti]!);
    claimTile(e, TEAM_RED, e.tiles[far]!);
    expect(T.offers[ti]).toBe(-1);
    // a blue troop walks onto the frontier tile: that hex is blue's again, and the red hex beyond
    // it goes grey. The colour moves first and the card second, as with a building: flip ti and the
    // card stands on far
    claimTile(e, TEAM_BLUE, e.tiles[ti]!);
    expect(e.tiles[far]!.owner).toBe(TEAM_NONE);
    expect(T.offers[ti]).toBeGreaterThanOrEqual(0);
    T.offers[ti] = OF_MINE;
    T.gold = 1000;
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
    expect(T.offers[far]).toBeGreaterThanOrEqual(0);
  });

  it("picking up no-man's-land pushes nothing back: only ground taken off the enemy does", () => {
    const e = fresh();
    const { ti, beyond } = frontier(e, TEAM_BLUE);
    const far = beyond[0]!;
    claimTile(e, TEAM_RED, e.tiles[far]!);
    e.tiles[ti]!.owner = TEAM_NONE;
    claimTile(e, TEAM_BLUE, e.tiles[ti]!);
    expect(e.tiles[far]!.owner).toBe(TEAM_RED);
  });

  it("a mystery's halo takes no-man's-land, and the enemy's cards there go with it", () => {
    // the hole the rule still had. Buying a BUILDING ends with a full recomputeOffers for both
    // sides, so it was covered; flipping a mystery that gives no building recomputes only the
    // buyer's, and claimAround flipped the bare ring to the buyer without touching the other
    // side's cards on it. Over 16 whole matches 0.04% of the cards on the board still stood on
    // the enemy's colour, up to four at once
    for (let seed = 1; seed < 40; seed++) {
      const e = new Engine({ seed, aiBlue: false, aiRed: false });
      const B = e.team[TEAM_BLUE]!, R = e.team[TEAM_RED]!;
      const { ti } = frontier(e, TEAM_BLUE);
      // red has flipped its way up to the frontier tile, so red carries cards on it and on the
      // bare ground around it -- the very ground blue's mystery is about to claim
      R.open[ti] = 1;
      recomputeOffers(e, TEAM_RED);
      const ring = e.tiles[ti]!.nb.filter((n) => R.offers[n]! >= 0 && e.tiles[n]!.owner === TEAM_NONE);
      expect(ring.length).toBeGreaterThan(0);
      B.offers[ti] = OF_MYST;
      B.gold = 1000;
      const units = e.units.length;
      expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
      if (e.units.length !== units || e.tiles[ti]!.bld) continue; // a mystery that gave nothing
      for (const n of ring) {
        expect(e.tiles[n]!.owner).toBe(TEAM_BLUE);
        expect(R.offers[n]).toBe(-1);
      }
      return;
    }
    throw new Error('no mystery gave nothing');
  });

  it('a hex with an enemy building on it is not bare, and keeps its colour', () => {
    const e = fresh();
    const R = e.team[TEAM_RED]!, B = e.team[TEAM_BLUE]!;
    const { ti, beyond } = frontier(e, TEAM_BLUE);
    const far = beyond[0]!;
    // red gets a tower on the far tile (the ground it stands on is red's)
    e.addBuilding(TEAM_RED, 'tower', far, null);
    recomputeOffers(e, TEAM_RED);
    expect(e.tiles[far]!.owner).toBe(TEAM_RED);
    B.offers[ti] = OF_MINE;
    B.gold = 1000;
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
    expect(e.tiles[far]!.owner).toBe(TEAM_RED);
    expect(B.offers[far]).toBe(-1);
    expect(R.open[far]).toBe(1);
  });
});
