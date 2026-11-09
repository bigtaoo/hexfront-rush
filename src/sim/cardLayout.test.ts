// The card layout: fixed by the seed, mirrored between the teams, and true to CARD_LAYOUT's quotas.

import { describe, expect, it } from 'vitest';
import { tryBuy } from './economy';
import { cardLayout, mirrorTile, zoneOf } from './cardLayout';
import { Engine } from './engine';
import { hexDist, NTILES } from './hex';
import { baseTile, generateMap } from './map';
import { CARD_LAYOUT, OF_BAR1, OF_BAR3, OF_MINE, OF_MYST, OFFER_LIST, PHASE_PLAY, TEAM_BLUE, TEAM_RED } from './rules';

const SEEDS = Array.from({ length: 60 }, (_, k) => 17 + k * 7919);
const layoutOf = (seed: number) => {
  const map = generateMap(seed);
  return { map, L: cardLayout(map.tiles, seed) };
};
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

describe('card layout', () => {
  it('the same seed lays out the same cards; another seed does not', () => {
    const a = layoutOf(42).L, b = layoutOf(42).L, c = layoutOf(43).L;
    expect(Array.from(a.card[TEAM_BLUE]!)).toEqual(Array.from(b.card[TEAM_BLUE]!));
    expect(Array.from(a.rarity[TEAM_RED]!)).toEqual(Array.from(b.rarity[TEAM_RED]!));
    expect(Array.from(a.card[TEAM_BLUE]!)).not.toEqual(Array.from(c.card[TEAM_BLUE]!));
  });

  it('red gets blue’s layout mirrored', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { L } = layoutOf(seed);
      for (let i = 0; i < NTILES; i++) {
        expect(L.card[TEAM_RED]![mirrorTile(i)]).toBe(L.card[TEAM_BLUE]![i]);
        expect(L.rarity[TEAM_RED]![mirrorTile(i)]).toBe(L.rarity[TEAM_BLUE]![i]);
      }
    }
  });

  it('a card on every free tile, none on rocks and castles', () => {
    const { map, L } = layoutOf(5);
    for (const t of map.tiles) {
      const none = !!t.obst || t.i === baseTile(TEAM_BLUE) || t.i === baseTile(TEAM_RED);
      expect(L.card[TEAM_BLUE]![t.i]! < 0).toBe(none);
    }
  });

  it('mines and epic / legendary barracks keep to the quota of each zone', () => {
    for (const seed of SEEDS) {
      const { map, L } = layoutOf(seed);
      const home = map.tiles[baseTile(TEAM_BLUE)]!;
      const mines = CARD_LAYOUT.zones.map(() => 0), epic = mines.slice(), legend = mines.slice();
      for (const t of map.tiles) {
        const z = zoneOf(hexDist(t.c, t.r, home.c, home.r));
        const card = L.card[TEAM_BLUE]![t.i]!, r = L.rarity[TEAM_BLUE]![t.i]!;
        if (card === OF_MINE) mines[z]!++;
        if (r === 2) epic[z]!++;
        if (r === 3) legend[z]!++;
        // a bar3 card only on an epic or legendary spot; a barracks always has its rarity
        if (card === OF_BAR3) expect(r).toBeGreaterThanOrEqual(2);
        expect(r >= 0).toBe(card >= 0 && OFFER_LIST[card]!.kind === 'barracks');
      }
      expect(mines).toEqual(CARD_LAYOUT.mine);
      expect(epic).toEqual(CARD_LAYOUT.epic);
      expect(legend).toEqual(CARD_LAYOUT.legend);
    }
  });

  it('mines are never next to each other', () => {
    for (const seed of SEEDS) {
      const { map, L } = layoutOf(seed);
      const at = map.tiles.filter((t) => L.card[TEAM_BLUE]![t.i] === OF_MINE);
      expect(at.length).toBe(sum(CARD_LAYOUT.mine));
      for (const a of at) for (const b of at) if (a !== b) expect(hexDist(a.c, a.r, b.c, b.r)).toBeGreaterThanOrEqual(CARD_LAYOUT.gap);
    }
  });

  it('the six cards around the castle hold a mine, a barracks and a mystery', () => {
    for (const seed of SEEDS) {
      const { map, L } = layoutOf(seed);
      const ring = map.tiles[baseTile(TEAM_BLUE)]!.nb.map((i) => L.card[TEAM_BLUE]![i]!);
      for (const want of [OF_MINE, OF_BAR1, OF_MYST]) expect(ring).toContain(want);
    }
  });
});

describe('cards in play', () => {
  const playing = (seed: number) => {
    const e = new Engine({ seed, aiBlue: false, aiRed: false });
    while (e.phase !== PHASE_PLAY) e.step([]);
    return e;
  };

  it('a team is offered its layout’s cards, and a barracks gets the layout’s rarity', () => {
    const e = playing(77);
    const T = e.team[TEAM_BLUE]!;
    const ring = e.tiles[baseTile(TEAM_BLUE)]!.nb;
    for (const i of ring) expect(T.offers[i]).toBe(e.layout.card[TEAM_BLUE]![i]);
    const bar = ring.find((i) => T.offers[i] === OF_BAR1)!;
    T.gold = 1000;
    expect(tryBuy(e, TEAM_BLUE, bar)).toBe(true);
    const b = e.blds.find((x) => x.tile === bar)!;
    expect(b.rarity).toBe(e.layout.rarity[TEAM_BLUE]![bar]);
  });

  it('a tile that comes free again (rubble) gets a filler card: never a mine or a bar3', () => {
    const e = playing(78);
    const T = e.team[TEAM_BLUE]!;
    for (let i = 0; i < NTILES; i++) {
      if (T.offers[i]! < 0) continue;
      e.tiles[i]!.rubble = 1;
      T.offers[i] = -1;
    }
    e.recomputeOffers(TEAM_BLUE);
    let n = 0;
    for (let i = 0; i < NTILES; i++) {
      const o = T.offers[i]!;
      if (o < 0) continue;
      n++;
      expect(OFFER_LIST[o]!.w).toBeGreaterThan(0);
    }
    expect(n).toBe(6);
  });
});
