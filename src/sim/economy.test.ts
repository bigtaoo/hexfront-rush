// Gold (economy.ts), the parts the golden hashes pin but do not describe: what a card costs as
// its kind piles up, the income handicap that keeps its halves instead of dropping them (D13),
// and what flipping a card does — paying, refusing, and claiming the map event under it.

import { describe, expect, it } from 'vitest';
import { cardCost, standingOf, tryBuy, updateEconomy } from './economy';
import { Engine } from './engine';
import { baseTile } from './map';
import { BUILD, EVENT_LIST, OFFER_LIST, OF_MINE, OF_MYST, OF_TOWER, TEAM_BLUE, TEAM_RED } from './rules';

const fresh = (income = 100) => new Engine({ seed: 31, aiBlue: false, aiRed: false, blue: { income }, red: { income } });

/** A free tile of the team's half, nowhere near the castle, with no map event on it. */
function freeTile(e: Engine, from = 0): number {
  for (let i = from; i < e.tiles.length; i++) {
    const t = e.tiles[i]!;
    if (!t.obst && !t.bld && !t.event) return i;
  }
  throw new Error('no free tile');
}

/** Offers team `ti`'s tile the card `oi` with gold to spare, the way a flipped neighbour would. */
function offer(e: Engine, team: number, ti: number, oi: number, gold = 5000): void {
  e.team[team]!.offers[ti] = oi;
  e.team[team]!.gold = gold;
}

describe('what a card costs', () => {
  it('goes up by its step for each one of its kind standing', () => {
    const e = fresh();
    const mine = OFFER_LIST[OF_MINE]!;
    expect(cardCost(OF_MINE, standingOf(e, TEAM_BLUE))).toBe(mine.cost);
    for (let n = 1; n <= 5; n++) {
      e.addBuilding(TEAM_BLUE, 'mine', freeTile(e, n * 3), null);
      expect(cardCost(OF_MINE, standingOf(e, TEAM_BLUE))).toBe(mine.cost + mine.step * n);
    }
  });

  it('counts only its own kind, and only the team that built it', () => {
    const e = fresh();
    e.addBuilding(TEAM_BLUE, 'mine', freeTile(e), null);
    const s = standingOf(e, TEAM_BLUE);
    expect(cardCost(OF_TOWER, s)).toBe(OFFER_LIST[OF_TOWER]!.cost);
    expect(cardCost(OF_MINE, standingOf(e, TEAM_RED))).toBe(OFFER_LIST[OF_MINE]!.cost);
  });

  it('leaves the castle out: standing is what the team bought', () => {
    // every team starts with a base, and a base must not make the first mine dearer
    const e = fresh();
    expect(standingOf(e, TEAM_BLUE)).toEqual({ mine: 0, tower: 0, barracks: 0, mystery: 0 });
  });
});

describe('the income handicap', () => {
  /** Runs the economy until the team has been paid `n` times, and gives what it earned. */
  function earn(e: Engine, team: number, n: number): number {
    const every = BUILD.base.incomeEvery!;
    const start = e.team[team]!.gold;
    for (let k = 0; k < n * every; k++) updateEconomy(e);
    return e.team[team]!.gold - start;
  }

  it('pays nothing until the building is due, then its payout', () => {
    const e = fresh();
    expect(earn(e, TEAM_BLUE, 0)).toBe(0);
    expect(earn(e, TEAM_BLUE, 1)).toBe(BUILD.base.income);
  });

  it('keeps the halves instead of dropping them: 95% of 10 is 9 now and the rest carried', () => {
    const e = fresh(95);
    // each payout is 9 with 50 hundredths left over, so every other one is 10
    expect(earn(e, TEAM_BLUE, 1)).toBe(9);
    expect(earn(e, TEAM_BLUE, 1)).toBe(10);
  });

  it('never drifts: over many payouts the total is the exact percentage, truncated once', () => {
    for (const pct of [37, 95, 112, 250]) {
      const e = fresh(pct);
      const n = 40;
      expect(earn(e, TEAM_BLUE, n)).toBe(Math.trunc((n * BUILD.base.income! * pct) / 100));
    }
  });
});

describe('flipping a card', () => {
  it('pays for it, stands the building, and counts it for the quests', () => {
    const e = fresh();
    const ti = freeTile(e);
    offer(e, TEAM_BLUE, ti, OF_MINE, 100);
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
    expect(e.team[TEAM_BLUE]!.gold).toBe(100 - OFFER_LIST[OF_MINE]!.cost);
    expect(e.ents.get(e.tiles[ti]!.bld)?.team).toBe(TEAM_BLUE);
    expect(e.team[TEAM_BLUE]!.built.mine).toBe(1);
  });

  it('refuses when the gold is short, and takes nothing', () => {
    const e = fresh();
    const ti = freeTile(e);
    offer(e, TEAM_BLUE, ti, OF_MINE, OFFER_LIST[OF_MINE]!.cost - 1);
    e.events = [];
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(false);
    expect(e.team[TEAM_BLUE]!.gold).toBe(OFFER_LIST[OF_MINE]!.cost - 1);
    expect(e.tiles[ti]!.bld).toBeFalsy();
    expect(e.events.map((ev) => ev.type)).toContain('needGold');
  });

  it('refuses a tile with no card on it, and one that is already built on', () => {
    const e = fresh();
    const ti = freeTile(e);
    e.team[TEAM_BLUE]!.gold = 5000;
    e.team[TEAM_BLUE]!.offers[ti] = -1;
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(false);
    offer(e, TEAM_BLUE, ti, OF_MINE);
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
    offer(e, TEAM_BLUE, ti, OF_MINE);
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(false);
  });

  it('hands the map event under the card to whoever flips it, once', () => {
    const e = fresh();
    const ev = EVENT_LIST.findIndex((d) => d.gold > 0);
    const ti = freeTile(e);
    e.tiles[ti]!.event = ev;
    offer(e, TEAM_BLUE, ti, OF_MYST, 1000);
    const before = e.team[TEAM_BLUE]!.gold;
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
    // the card was paid for and the chest paid back (a mystery roll itself never gives gold)
    expect(e.team[TEAM_BLUE]!.gold).toBe(before - OFFER_LIST[OF_MYST]!.cost + EVENT_LIST[ev]!.gold);
    expect(e.tiles[ti]!.event).toBe(0);
  });

  it('a mystery that gives a barracks counts as a barracks for the price of the next one', () => {
    // the roll is the loot stream's, so take whichever tile rolls one: the rule under test is
    // that the building it leaves behind is a barracks like any other
    const e = fresh();
    let ti = freeTile(e);
    for (let k = 0; k < 60 && e.team[TEAM_BLUE]!.built.barracks === 0; k++) {
      ti = freeTile(e, ti + 1);
      offer(e, TEAM_BLUE, ti, OF_MYST);
      tryBuy(e, TEAM_BLUE, ti);
    }
    expect(e.team[TEAM_BLUE]!.built.barracks).toBeGreaterThan(0);
    expect(e.blds.find((b) => b.tile === ti)?.type).toBe('barracks');
    expect(standingOf(e, TEAM_BLUE).barracks).toBeGreaterThan(0);
  });

  it('the castle tile is never on offer', () => {
    const e = fresh();
    expect(e.team[TEAM_BLUE]!.offers[baseTile(TEAM_BLUE)]).toBe(-1);
  });
});
