// The card layout: which card each tile shows a team, laid out once when the match starts (static:
// rebuilt from the seed, never hashed or snapshotted, like the map). The same seed is the same
// layout card for card, so a match can be replayed, explained and taught (the tutorial uses one).
//
// It is made for blue and mirrored for red (row r <-> ROWS-1-r, the way the map is mirrored), so
// both teams find the same cards at the same distance from their own castle. Zones count hex
// distance from the team's own castle (CARD_LAYOUT.zones): home, near, middle, far.
//   0. the six tiles around the castle hold CARD_LAYOUT.opening (a mine, a barracks, a mystery)
//   1. gold mines go on quota spots: CARD_LAYOUT.mine per zone, not next to each other
//   2. legendary, then epic barracks the same way (CARD_LAYOUT.legend / .epic); the card a spot
//      shows is bar1, bar2 or bar3 by CARD_LAYOUT.card, so a cheap card can hide a jackpot
//   3. every other tile gets a filler card by weight (OFFER_LIST.w): tower, bar1, bar2, mystery;
//      a filler barracks is common or rare (OFFER_LIST.rare), rolled now and stored with it
//   4. map events (EVENT_LAYOUT), after the cards so they never move a card: each side's own
//      (mirrored) by zone, and a race on the middle row; they keep EVENT_LAYOUT.gap apart
// A mystery is still a gamble: what it gives is rolled when it is flipped (economy.ts). A tile
// that comes free again after its building fell (rubble) gets a fresh filler card then.

import { COLS, hexDist, idx, MID_ROW, NTILES, ROWS } from './hex';
import { baseTile, type Tile } from './map';
import { Prng, streamSeed } from './prng';
import { CARD_LAYOUT, EVENT_LAYOUT, OF_BAR1, OF_MINE, OFFER_LIST, OFFER_W_TOTAL, TEAM_BLUE, TEAM_RED } from './rules';

export interface CardLayout {
  /** Per team (index 1 and 2): the card each tile shows that team (-1: a rock or a castle). */
  card: (Int8Array | null)[];
  /** Per team: the rarity of the barracks a barracks card builds there (-1: not a barracks). */
  rarity: (Int8Array | null)[];
  /** The map event on each tile (EVENT_LIST index, 0: none), the same for both teams. */
  event: Int8Array;
}

/** The tile on the other team's side that mirrors tile i. */
export const mirrorTile = (i: number): number => idx(i % COLS, ROWS - 1 - Math.trunc(i / COLS));

/** A filler card, by weight (OFFER_LIST.w). */
export function fillerCard(rng: Prng): number {
  let r = rng.int(OFFER_W_TOTAL);
  for (let k = 0; k < OFFER_LIST.length; k++) {
    r -= OFFER_LIST[k].w;
    if (r < 0) return k;
  }
  return OF_BAR1;
}
/** The rarity of a barracks on a filler card: rare (1) or common (0). */
export const fillerRarity = (rng: Prng, oi: number): number => (rng.int(100) < (OFFER_LIST[oi].rare ?? 0) ? 1 : 0);

/** Which zone (CARD_LAYOUT.zones) hex distance d from the own castle falls in. */
export function zoneOf(d: number): number {
  const Z = CARD_LAYOUT.zones;
  let z = 0;
  while (z < Z.length - 1 && d > Z[z]) z++;
  return z;
}

export function cardLayout(tiles: readonly Tile[], seed: number): CardLayout {
  const rng = new Prng(streamSeed(seed, 11));
  const home = tiles[baseTile(TEAM_BLUE)];
  const card = new Int8Array(NTILES).fill(-1);
  const rarity = new Int8Array(NTILES).fill(-1);
  const zones: number[][] = CARD_LAYOUT.zones.map(() => []);
  for (const t of tiles) {
    if (t.obst || t.i === baseTile(TEAM_BLUE) || t.i === baseTile(TEAM_RED)) continue;
    zones[zoneOf(hexDist(t.c, t.r, home.c, home.r))].push(t.i);
  }
  for (const list of zones) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const k = list[i];
      list[i] = list[j];
      list[j] = k;
    }
  }
  // the opening: the castle's six neighbours, in a seeded order
  const ring = tiles[baseTile(TEAM_BLUE)].nb.slice();
  for (let i = ring.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const k = ring[i];
    ring[i] = ring[j];
    ring[j] = k;
  }
  const mines: number[] = [];
  for (let k = 0; k < CARD_LAYOUT.opening.length; k++) {
    const i = ring[k];
    card[i] = CARD_LAYOUT.opening[k];
    if (OFFER_LIST[card[i]].kind === 'barracks') rarity[i] = fillerRarity(rng, card[i]);
    if (card[i] === OF_MINE) mines.push(i);
  }
  /** Quota spots: the first free tiles of each zone's shuffled list, at least CARD_LAYOUT.gap
   *  from the spots already in `taken`; the spots in `counted` count toward their zone's quota. */
  const place = (counts: readonly number[], taken: number[], put: (i: number) => void, counted: readonly number[] = []) => {
    for (let z = 0; z < zones.length; z++) {
      let left = counts[z];
      for (const j of counted) if (zones[z].includes(j)) left--;
      for (const i of zones[z]) {
        if (left <= 0) break;
        if (card[i] >= 0) continue;
        const t = tiles[i];
        let near = false;
        for (const j of taken) if (hexDist(t.c, t.r, tiles[j].c, tiles[j].r) < CARD_LAYOUT.gap) near = true;
        if (near) continue;
        put(i);
        taken.push(i);
        left--;
      }
    }
  };
  place(CARD_LAYOUT.mine, mines, (i) => (card[i] = OF_MINE), mines.slice());
  const best: number[] = [];
  const barracks = (r: number) => (i: number) => {
    let w = rng.int(100);
    let k = 0;
    while (k < 2 && w >= CARD_LAYOUT.card[k]) w -= CARD_LAYOUT.card[k++];
    card[i] = OF_BAR1 + k;
    rarity[i] = r;
  };
  place(CARD_LAYOUT.legend, best, barracks(3));
  place(CARD_LAYOUT.epic, best, barracks(2));
  for (let i = 0; i < NTILES; i++) {
    if (card[i] >= 0 || tiles[i].obst || i === baseTile(TEAM_BLUE) || i === baseTile(TEAM_RED)) continue;
    card[i] = fillerCard(rng);
    if (OFFER_LIST[card[i]].kind === 'barracks') rarity[i] = fillerRarity(rng, card[i]);
  }
  const card2 = new Int8Array(NTILES), rarity2 = new Int8Array(NTILES);
  for (let i = 0; i < NTILES; i++) {
    card2[mirrorTile(i)] = card[i];
    rarity2[mirrorTile(i)] = rarity[i];
  }
  return { card: [null, card, card2], rarity: [null, rarity, rarity2], event: eventLayout(tiles, zones, rng) };
}

/** The map events: each side's own on a free tile of its zone (red's mirrored), then the middle
 *  row's. `zones` are blue's, shuffled. */
function eventLayout(tiles: readonly Tile[], zones: readonly number[][], rng: Prng): Int8Array {
  const event = new Int8Array(NTILES);
  const taken: number[] = [];
  const free = (i: number) => {
    const t = tiles[i];
    for (const j of taken) if (hexDist(t.c, t.r, tiles[j].c, tiles[j].r) < EVENT_LAYOUT.gap) return false;
    return true;
  };
  const put = (i: number, ev: number) => {
    event[i] = ev;
    taken.push(i);
  };
  for (const [ev, z] of EVENT_LAYOUT.side) {
    const i = zones[z].find((k) => free(k) && free(mirrorTile(k)) && Math.abs(tiles[k].r - MID_ROW) > 1);
    if (i === undefined) continue;
    put(i, ev);
    put(mirrorTile(i), ev);
  }
  const mid: number[] = [];
  for (let c = 0; c < COLS; c++) {
    const i = idx(c, MID_ROW);
    if (!tiles[i].obst) mid.push(i);
  }
  for (let i = mid.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const k = mid[i];
    mid[i] = mid[j];
    mid[j] = k;
  }
  for (const ev of EVENT_LAYOUT.middle) {
    const i = mid.find(free);
    if (i !== undefined) put(i, ev);
  }
  return event;
}
