// The design tables (rules.ts). Nothing here is logic, which is exactly why it is worth pinning:
// the tables are edited by hand while tuning, and most of what can go wrong in them is silent.
// Three kinds of silence in particular. A non-integer in a table reaches the state and the match
// throws mid-play rather than at build time. An index constant (OF_BAR3, EV_CAMP) keeps its old
// number when the list it points into is reordered, so the game builds the wrong card. And a
// rounded-down conversion can leave a troop with a speed of zero, which no balance run would
// explain and no crash would report.

import { describe, expect, it } from 'vitest';
import { TICK_RATE, ticks } from './fixed';
import { TILE } from './hex';
import { hashState } from './hash';
import * as R from './rules';

describe('every number in the tables', () => {
  it('is a whole number, the way the sim needs it', () => {
    // hashState is the sim's own guard: it throws on a non-integer and names the path. Running the
    // tables through it says they would survive a match.
    const tables: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(R)) if (typeof v !== 'function') tables[k] = v;
    expect(() => hashState(tables)).not.toThrow();
  });

  it('converts seconds and tiles into ticks and world units without rounding to nothing', () => {
    for (const k of R.UNIT_KEYS) {
      const u = R.UNITS[k];
      expect(u.key).toBe(k);
      expect(u.speed).toBeGreaterThan(0); // a troop rounded to 0 would stand still for ever
      expect(u.rate).toBeGreaterThan(0); // a cooldown of 0 would fire every tick
      expect(u.spawn).toBeGreaterThan(0);
      expect(u.hp).toBeGreaterThan(0);
      expect(u.range).toBeGreaterThanOrEqual(u.size);
      expect(u.aggroMobile).toBeGreaterThanOrEqual(u.range); // never notice less far than it shoots
      expect(u.aggroBuilding).toBeGreaterThanOrEqual(0);
      expect(u.bldMult).toBeGreaterThanOrEqual(1);
      expect(u.splash === 0 || u.ranged !== '').toBe(true); // splash comes from a missile landing
    }
    expect(R.UNITS.militia.speed).toBe(Math.round((0.75 * TILE) / TICK_RATE));
    expect(R.UNITS.drake.speed).toBeGreaterThan(R.UNITS.colossus.speed);
    expect(ticks(1)).toBe(TICK_RATE);
  });
});

describe('the index constants', () => {
  it('still point at the cards they name', () => {
    expect(R.OFFER_LIST[R.OF_MINE]!.key).toBe('mine');
    expect(R.OFFER_LIST[R.OF_TOWER]!.key).toBe('tower');
    expect(R.OFFER_LIST[R.OF_BAR1]!.key).toBe('bar1');
    expect(R.OFFER_LIST[R.OF_BAR2]!.key).toBe('bar2');
    expect(R.OFFER_LIST[R.OF_BAR3]!.key).toBe('bar3');
    expect(R.OFFER_LIST[R.OF_MYST]!.key).toBe('myst');
    expect(R.OFFER_LIST.length).toBe(6);
    for (const i of R.CARD_LAYOUT.opening) expect(R.OFFER_LIST[i]).toBeDefined();
  });

  it('still point at the map events they name', () => {
    // EVENT_LIST is indexed by the tile's `event` field, and 0 means no event
    expect(R.EVENT_LIST[0]!.key).toBe('none');
    const named: [number, string][] = [[R.EV_CHEST, 'chest'], [R.EV_HOARD, 'hoard'], [R.EV_CAMP, 'camp'], [R.EV_WARBAND, 'warband']];
    for (const [i, key] of named) expect(R.EVENT_LIST[i]!.key).toBe(key);
  });

  it('agree with the rarity names and the units of each rarity', () => {
    expect(R.RARITY.length).toBe(4);
    expect(R.UNITS_BY_RARITY.length).toBe(4);
    const all = R.UNITS_BY_RARITY.flat();
    expect([...all].sort()).toEqual([...R.UNIT_KEYS].sort()); // every troop once, none lost
    for (let rarity = 0; rarity < 4; rarity++) {
      expect(R.UNITS_BY_RARITY[rarity]!.length).toBeGreaterThan(0); // a mystery can roll any rarity
      for (const k of R.UNITS_BY_RARITY[rarity]!) expect(R.UNITS[k].rarity).toBe(rarity);
    }
  });
});

describe('the weights', () => {
  it('add up to what the draw divides by', () => {
    expect(R.OFFER_W_TOTAL).toBe(R.OFFER_LIST.reduce((s, o) => s + o.w, 0));
    expect(R.MYSTERY_W_TOTAL).toBe(100); // the mystery table is written as percentages
    expect(R.MYSTERY.reduce((s, m) => s + m.w, 0)).toBe(100);
    expect(R.CARD_LAYOUT.card.reduce((s, w) => s + w, 0)).toBe(100);
    for (const o of R.OFFER_LIST) {
      expect(o.cost).toBeGreaterThan(0);
      expect(o.step).toBeGreaterThanOrEqual(0);
      expect(o.w).toBeGreaterThanOrEqual(0);
      if (o.rare !== undefined) expect(o.rare).toBeGreaterThanOrEqual(0);
    }
    // the cards that only ever stand on a quota spot are the ones laid out by quota
    expect(R.OFFER_LIST.filter((o) => o.w === 0).map((o) => o.key)).toEqual(['mine', 'bar3']);
    for (const m of R.MYSTERY) expect(!(m.squad && m.barracks)).toBe(true); // one prize or the other
  });

  it('lay the quota spots out from the castle outwards, with room between them', () => {
    const z = R.CARD_LAYOUT.zones;
    for (let i = 1; i < z.length; i++) expect(z[i]!).toBeGreaterThan(z[i - 1]!);
    expect(R.CARD_LAYOUT.gap).toBeGreaterThanOrEqual(0);
    expect(z[0]!).toBeGreaterThanOrEqual(R.HOME_RADIUS - 1);
    for (const q of [R.CARD_LAYOUT.mine, R.CARD_LAYOUT.epic, R.CARD_LAYOUT.legend]) {
      expect(q.length).toBe(z.length);
      for (const n of q) expect(n).toBeGreaterThanOrEqual(0);
    }
    // the best cards are not at home: a team has to come out for them
    expect(R.CARD_LAYOUT.epic[0]).toBe(0);
    expect(R.CARD_LAYOUT.legend[0]).toBe(0);
    expect(R.CARD_LAYOUT.legend[1]).toBe(0);
  });
});

describe('the siege clock', () => {
  it('does nothing at all until it starts, and then the same for both sides', () => {
    for (const t of [0, 1, R.SIEGE.after - 1]) {
      expect(R.siegeLevel(t)).toBe(0);
      expect(R.siegePct(t)).toBe(100);
      expect(R.unitCap(t)).toBe(R.UNIT_CAP);
    }
    expect(R.SIEGE.after).toBe(ticks(8 * 60));
    expect(R.SIEGE.after).toBeLessThan(R.MAX_PLAY_TICKS);
  });

  it('steps up once a minute from then on, and never back down', () => {
    expect(R.siegeLevel(R.SIEGE.after)).toBe(1);
    expect(R.siegeLevel(R.SIEGE.after + R.SIEGE.every - 1)).toBe(1);
    expect(R.siegeLevel(R.SIEGE.after + R.SIEGE.every)).toBe(2);
    expect(R.siegePct(R.SIEGE.after)).toBe(100 + R.SIEGE.dmgStep);
    expect(R.unitCap(R.SIEGE.after)).toBe(R.UNIT_CAP + R.SIEGE.capStep);
    let last = -1;
    for (let t = 0; t <= R.MAX_PLAY_TICKS; t += 97) {
      const lvl = R.siegeLevel(t);
      expect(lvl).toBeGreaterThanOrEqual(last);
      expect(R.siegePct(t)).toBe(100 + R.SIEGE.dmgStep * lvl);
      expect(R.unitCap(t)).toBe(R.UNIT_CAP + R.SIEGE.capStep * lvl);
      last = lvl;
    }
    // by the safety valve a castle is taking well over double damage: a stalemate cannot last
    expect(R.siegePct(R.MAX_PLAY_TICKS)).toBeGreaterThan(400);
  });

  it('takes its start as an argument, which is what lets a test move the clock', () => {
    expect(R.siegeLevel(ticks(10), ticks(10))).toBe(1);
    expect(R.unitCap(ticks(10), ticks(10))).toBe(R.UNIT_CAP + R.SIEGE.capStep);
  });
});

describe('the rest of the board', () => {
  it('knows who the enemy is, both ways round', () => {
    expect(R.enemyOf(R.TEAM_BLUE)).toBe(R.TEAM_RED);
    expect(R.enemyOf(R.TEAM_RED)).toBe(R.TEAM_BLUE);
    expect(R.enemyOf(R.enemyOf(R.TEAM_BLUE))).toBe(R.TEAM_BLUE);
    expect(R.TEAMS).toEqual([R.TEAM_BLUE, R.TEAM_RED]);
    expect(R.TEAM_NONE).toBe(0);
    expect(R.PHASE_INTRO).not.toBe(R.PHASE_PLAY);
  });

  it('keeps the quest loop to the quests a losing team can still finish', () => {
    for (const q of R.QUESTS) {
      expect(q.need).toBeGreaterThan(0);
      expect(q.reward).toBeGreaterThan(0);
    }
    expect(R.QUEST_LOOP.length).toBeGreaterThan(0);
    for (const i of R.QUEST_LOOP) {
      const q = R.QUESTS[i]!;
      expect(q).toBeDefined();
      // 'tiles' asks for ground held, so a team losing ground would sit on it for ever
      expect(q.kind).not.toBe('tiles');
    }
    expect(new Set(R.QUEST_LOOP).size).toBe(R.QUEST_LOOP.length);
    expect(R.QUESTS.map((q) => q.id).length).toBe(new Set(R.QUESTS.map((q) => q.id)).size);
  });

  it('gives the castle guard a leash it cannot slip', () => {
    expect(R.GUARD.hp).toBeGreaterThan(0);
    expect(R.HOME_RADIUS).toBeGreaterThan(0);
    expect(R.BUILD.base.hp).toBeGreaterThan(R.GUARD.hp);
    for (const t of ['mine', 'tower', 'barracks'] as const) expect(R.BUILD[t].hp).toBeLessThan(R.BUILD.base.hp);
    expect(R.BUILD.tower.range!).toBeGreaterThan(TILE); // a tower reaches past its own tile
    expect(R.BLD_RADIUS).toBeLessThan(TILE / 2); // buildings do not overlap their neighbours
  });
});
