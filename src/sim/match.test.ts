// The rules that shape a match with no clock: card prices that rise with what a team has standing,
// the troop cap going to the rarest troop waiting, waves, the siege, and the stalemate valve.

import { describe, expect, it } from 'vitest';
import { cardCost, standingOf, tryBuy } from './economy';
import { Engine } from './engine';
import { NTILES } from './hex';
import { baseTile } from './map';
import {
  MAX_PLAY_TICKS, OF_BAR1, OF_MINE, OF_MYST, OF_TOWER, OFFER_LIST, PHASE_END, PHASE_PLAY, SIEGE, siegeLevel, siegePct, TEAM_BLUE, UNIT_CAP, unitCap,
  WAVE_TICKS,
} from './rules';

const playing = (seed = 31) => {
  const e = new Engine({ seed, aiBlue: false, aiRed: false });
  while (e.phase !== PHASE_PLAY) e.step([]);
  return e;
};
/** A free tile (no building, no rock, not the castle's) on blue's side of the map. */
const freeTiles = (e: Engine, n: number) => {
  const out: number[] = [];
  for (let i = NTILES - 1; i >= 0 && out.length < n; i--) {
    const t = e.tiles[i]!;
    if (!t.obst && !t.bld && i !== baseTile(TEAM_BLUE)) out.push(i);
  }
  return out;
};

describe('card prices', () => {
  it('rise with each building of the kind standing, and a mystery stays flat', () => {
    const e = playing();
    const none = standingOf(e, TEAM_BLUE);
    expect(cardCost(OF_MINE, none)).toBe(OFFER_LIST[OF_MINE]!.cost);
    const [a, b, c] = freeTiles(e, 3);
    e.addBuilding(TEAM_BLUE, 'mine', a!, null);
    e.addBuilding(TEAM_BLUE, 'mine', b!, null);
    e.addBuilding(TEAM_BLUE, 'barracks', c!, { unit: 'militia', rarity: 0 });
    const s = standingOf(e, TEAM_BLUE);
    expect(s).toEqual({ mine: 2, tower: 0, barracks: 1, mystery: 0 });
    expect(cardCost(OF_MINE, s)).toBe(OFFER_LIST[OF_MINE]!.cost + 2 * OFFER_LIST[OF_MINE]!.step);
    expect(cardCost(OF_BAR1, s)).toBe(OFFER_LIST[OF_BAR1]!.cost + OFFER_LIST[OF_BAR1]!.step);
    expect(cardCost(OF_TOWER, s)).toBe(OFFER_LIST[OF_TOWER]!.cost);
    expect(cardCost(OF_MYST, s)).toBe(OFFER_LIST[OF_MYST]!.cost);
  });

  it('a flip pays the risen price', () => {
    const e = playing();
    const T = e.team[TEAM_BLUE]!;
    const [a] = freeTiles(e, 1);
    e.addBuilding(TEAM_BLUE, 'mine', a!, null);
    const ti = T.offers.findIndex((o) => o >= 0);
    T.offers[ti] = OF_MINE; // a mine card on any card tile
    T.gold = 1000;
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
    expect(1000 - T.gold).toBe(OFFER_LIST[OF_MINE]!.cost + OFFER_LIST[OF_MINE]!.step);
  });
});

describe('troops', () => {
  it('at the cap, a freed slot goes to the rarest barracks waiting', () => {
    const e = playing();
    const [a, b] = freeTiles(e, 2);
    const common = e.addBuilding(TEAM_BLUE, 'barracks', a!, { unit: 'militia', rarity: 0 });
    const legend = e.addBuilding(TEAM_BLUE, 'barracks', b!, { unit: 'colossus', rarity: 3 });
    const home = e.tiles[baseTile(TEAM_BLUE)]!;
    for (let k = 0; k < UNIT_CAP - 1; k++) e.spawnUnit(TEAM_BLUE, 'militia', home.x, home.y, 0);
    common.spawnT = 1;
    legend.spawnT = 1;
    e.step([]);
    const fresh = e.units.filter((u) => u.bar);
    expect(fresh.length).toBe(1);
    expect(fresh[0]!.bar).toBe(legend.id);
    expect(fresh[0]!.type).toBe('colossus');
  });

  it('barracks troops wait for the wave; both teams set off on it', () => {
    const e = playing();
    const [a] = freeTiles(e, 1);
    const bar = e.addBuilding(TEAM_BLUE, 'barracks', a!, { unit: 'militia', rarity: 0 });
    bar.spawnT = 1;
    while (e.elapsed() % WAVE_TICKS !== 2) e.step([]);
    const u = e.units.find((x) => x.bar === bar.id)!;
    expect(u.hold).toBe(1);
    while (e.elapsed() % WAVE_TICKS !== 0) e.step([]);
    expect(u.hold).toBe(0);
  });

  it("a mystery's troops set off at once", () => {
    const e = playing();
    const home = e.tiles[baseTile(TEAM_BLUE)]!;
    expect(e.spawnUnit(TEAM_BLUE, 'ogre', home.x, home.y, 0).hold).toBe(0);
  });
});

describe('no clock', () => {
  it('the siege starts late and grows: harder hits on buildings, a higher cap', () => {
    expect(siegeLevel(SIEGE.after - 1)).toBe(0);
    expect(siegePct(SIEGE.after - 1)).toBe(100);
    expect(unitCap(SIEGE.after - 1)).toBe(UNIT_CAP);
    expect(siegeLevel(SIEGE.after)).toBe(1);
    expect(siegePct(SIEGE.after + SIEGE.every)).toBe(100 + 2 * SIEGE.dmgStep);
    expect(unitCap(SIEGE.after + SIEGE.every)).toBe(UNIT_CAP + 2 * SIEGE.capStep);
  });

  it('a match runs on with no castle down, until the stalemate valve', () => {
    const e = playing();
    e.playT = SIEGE.after - 5;
    for (let i = 0; i < 10; i++) e.step([]);
    expect(e.phase).toBe(PHASE_PLAY);
    expect(e.events.some((v) => v.type === 'end')).toBe(false);
    e.playT = MAX_PLAY_TICKS - 2;
    e.step([]);
    expect(e.phase).toBe(PHASE_PLAY);
    e.step([]);
    expect(e.phase).toBe(PHASE_END);
    expect(e.result?.reason).toBe('time');
  });
});
