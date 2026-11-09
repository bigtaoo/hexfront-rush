// Map events: laid out by the seed with the cards, mirrored between the teams, kept apart, and
// claimed once by the first team to flip the card on their tile.

import { describe, expect, it } from 'vitest';
import { cardLayout, mirrorTile, zoneOf } from './cardLayout';
import { cardCost, standingOf, tryBuy } from './economy';
import { Engine } from './engine';
import { hexDist, MID_ROW, NTILES } from './hex';
import { baseTile, generateMap } from './map';
import { EV_CAMP, EV_CHEST, EVENT_LAYOUT, EVENT_LIST, OF_MYST, PHASE_PLAY, TEAM_BLUE, TEAM_RED } from './rules';

const SEEDS = Array.from({ length: 60 }, (_, k) => 17 + k * 7919);
const eventsOf = (seed: number) => {
  const map = generateMap(seed);
  return { map, ev: cardLayout(map.tiles, seed).event };
};

describe('map event layout', () => {
  it('the same seed lays out the same events', () => {
    expect(Array.from(eventsOf(42).ev)).toEqual(Array.from(eventsOf(42).ev));
    expect(Array.from(eventsOf(42).ev)).not.toEqual(Array.from(eventsOf(43).ev));
  });

  it('every side event has its mirror for red; the middle ones stand on the middle row', () => {
    for (const seed of SEEDS) {
      const { map, ev } = eventsOf(seed);
      let mid = 0;
      for (let i = 0; i < NTILES; i++) {
        if (!ev[i]) continue;
        const t = map.tiles[i]!;
        expect(t.obst).toBeFalsy();
        if (t.r === MID_ROW) mid++;
        else expect(ev[mirrorTile(i)]).toBe(ev[i]);
      }
      expect(mid).toBe(EVENT_LAYOUT.middle.length);
    }
  });

  it('each side gets its events in their zones, and they keep apart', () => {
    for (const seed of SEEDS) {
      const { map, ev } = eventsOf(seed);
      const home = map.tiles[baseTile(TEAM_BLUE)]!;
      const at = map.tiles.filter((t) => ev[t.i]);
      expect(at.length).toBe(EVENT_LAYOUT.side.length * 2 + EVENT_LAYOUT.middle.length);
      const blue = at.filter((t) => t.r > MID_ROW).map((t) => [ev[t.i], zoneOf(hexDist(t.c, t.r, home.c, home.r))]);
      expect(blue.sort()).toEqual(EVENT_LAYOUT.side.map((x) => [...x]).sort());
      for (const a of at) for (const b of at) if (a !== b) expect(hexDist(a.c, a.r, b.c, b.r)).toBeGreaterThanOrEqual(EVENT_LAYOUT.gap);
    }
  });
});

describe('claiming a map event', () => {
  const playing = (seed: number) => {
    const e = new Engine({ seed, aiBlue: false, aiRed: false });
    while (e.phase !== PHASE_PLAY) e.step([]);
    return e;
  };
  /** Puts an event on a card of blue's ring and returns that tile. */
  const ringTile = (e: Engine, ev: number, pred: (oi: number) => boolean = () => true) => {
    const T = e.team[TEAM_BLUE]!;
    const ti = e.tiles[baseTile(TEAM_BLUE)]!.nb.find((i) => T.offers[i]! >= 0 && pred(T.offers[i]!))!;
    e.tiles[ti]!.event = ev;
    T.gold = 1000;
    return ti;
  };

  it('the engine starts with the layout’s events on the tiles', () => {
    const e = playing(31);
    for (const t of e.tiles) expect(t.event).toBe(e.layout.event[t.i]);
  });

  it('flipping the card under a chest pays its gold, once', () => {
    const e = playing(32);
    const ti = ringTile(e, EV_CHEST, (oi) => oi !== OF_MYST);
    const T = e.team[TEAM_BLUE]!;
    const before = T.gold, cost = cardCost(T.offers[ti]!, standingOf(e, TEAM_BLUE));
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
    expect(e.tiles[ti]!.event).toBe(0);
    expect(T.gold).toBe(before - cost + EVENT_LIST[EV_CHEST]!.gold);
    const got = e.events.filter((v) => v.type === 'mapEvent');
    expect(got.length).toBe(1);
    expect(got[0]).toMatchObject({ team: TEAM_BLUE, kind: 'chest', gold: EVENT_LIST[EV_CHEST]!.gold });
    // red can no longer get it: the tile is blue's now and the event is gone
    expect(e.team[TEAM_RED]!.offers[ti]).toBe(-1);
  });

  it('a mystery claims it too, and a camp sends its troops, all of one kind', () => {
    const e = playing(33);
    const ti = ringTile(e, EV_CAMP, (oi) => oi === OF_MYST);
    const n0 = e.units.length;
    expect(tryBuy(e, TEAM_BLUE, ti)).toBe(true);
    const ev = e.events.find((v) => v.type === 'mapEvent')!;
    expect(ev.n).toBe(EVENT_LIST[EV_CAMP]!.troops);
    const camp = e.units.slice(n0).filter((u) => u.type === ev.unit && u.team === TEAM_BLUE);
    expect(camp.length).toBeGreaterThanOrEqual(EVENT_LIST[EV_CAMP]!.troops);
    expect(e.tiles[ti]!.event).toBe(0);
  });

  it('the event survives a snapshot and is in the hash', () => {
    const e = playing(34);
    const s = e.snapshot();
    const h = e.hash();
    const ti = e.tiles.find((t) => t.event)!.i;
    e.tiles[ti]!.event = 0;
    expect(e.hash()).not.toBe(h);
    const r = Engine.restore(s);
    expect(r.tiles[ti]!.event).toBe(e.layout.event[ti]);
    expect(r.hash()).toBe(h);
  });

  it('both teams see the same events: red’s side events mirror blue’s', () => {
    const e = playing(35);
    for (const t of e.tiles) if (t.event && t.r !== MID_ROW) expect(e.tiles[mirrorTile(t.i)]!.event).toBe(t.event);
  });
});
