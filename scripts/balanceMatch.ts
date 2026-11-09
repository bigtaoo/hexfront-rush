// One headless AI-vs-AI match for `npm run balance`, with what the balance report needs: which
// cards each side flipped, what the gambles rolled, what it lost, how the lead moved and how
// close each castle came to falling. hash() runs every second: it throws on any non-integer in
// the state, so a float leaking into the sim fails here too.

import { eventWorth } from '../src/sim/ai';
import { Engine } from '../src/sim/engine';
import { MID_ROW, NTILES } from '../src/sim/hex';
import { TICK_RATE } from '../src/sim/fixed';
import { EVENT_LIST, MAX_PLAY_TICKS, MYSTERY, OF_MINE, OFFER_LIST, PHASE_END, PHASE_PLAY, TEAM_BLUE, TEAM_RED, unitCap, UNITS, type UnitKey } from '../src/sim/rules';

export interface SideStats {
  /** Flips per card key (mine, tower, bar1, bar2, bar3, myst). */
  flips: Record<string, number>;
  /** Barracks built, by rarity. */
  barracks: number[];
  /** Mystery rolls, by MYSTERY row. */
  mystery: number[];
  /** Troops trained (barracks and mysteries), by rarity. */
  trained: number[];
  /** Buildings lost, by kind. */
  lost: Record<string, number>;
  /** The lowest the castle's hp went, as a share of its full hp (0-1). */
  castleLow: number;
  /** Seconds of play at the troop cap. */
  capSecs: number;
  /** Mines standing at 1:30 of play. */
  minesAt90: number;
  goldEnd: number;
  /** The layout's mines and epic+ barracks: how many were laid for the side, and how many it saw
   *  (they were a card it could flip at some point). */
  laid: { mine: number; best: number };
  seen: { mine: number; best: number };
  /** Map events claimed, by key; their worth to the AI (ai.ts eventWorth), summed; and the
   *  seconds of play when each middle-row event (a race) was claimed. */
  events: Record<string, number>;
  eventWorth: number;
  middleAt: number[];
}

export interface MatchStats {
  seed: number;
  winner: number;
  reason: string;
  /** Seconds of play. */
  secs: number;
  /** Map events nobody claimed. */
  eventsLeft: number;
  maxUnits: number;
  /** Blue's share of the owned tiles, once a second of play. */
  share: number[];
  side: Record<number, SideStats>;
  hash: number;
  ms: number;
}

const newSide = (): SideStats => ({
  flips: {}, barracks: [0, 0, 0, 0], mystery: MYSTERY.map(() => 0), trained: [0, 0, 0, 0], lost: {}, castleLow: 1, capSecs: 0, minesAt90: 0, goldEnd: 0,
  laid: { mine: 0, best: 0 }, seen: { mine: 0, best: 0 }, events: {}, eventWorth: 0, middleAt: [],
});

/** The card key a flip at (x, y) bought: what stood on that tile just before the step. */
function cardAt(e: Engine, offers: Record<number, number[]>, team: number, x: number, y: number): string {
  const t = e.tileAt(x, y);
  const oi = t ? offers[team]![t.i]! : -1;
  return oi >= 0 ? OFFER_LIST[oi]!.key : '?';
}

export function playBalanceMatch(seed: number): MatchStats {
  const t0 = performance.now();
  const e = new Engine({ seed, aiBlue: true, aiRed: true });
  const side: Record<number, SideStats> = { [TEAM_BLUE]: newSide(), [TEAM_RED]: newSide() };
  const share: number[] = [];
  let maxUnits = 0;
  const offers: Record<number, number[]> = {};
  const L = e.layout;
  /** 1: a mine spot, 2: an epic or legendary barracks spot (in the team's own layout). */
  const spot = (team: number, i: number) => (L.card[team]![i] === OF_MINE ? 1 : L.rarity[team]![i]! >= 2 ? 2 : 0);
  const saw: Record<number, Uint8Array> = { [TEAM_BLUE]: new Uint8Array(NTILES), [TEAM_RED]: new Uint8Array(NTILES) };
  while (e.phase !== PHASE_END && e.tick < MAX_PLAY_TICKS + 400) {
    offers[TEAM_BLUE] = e.team[TEAM_BLUE]!.offers.slice();
    offers[TEAM_RED] = e.team[TEAM_RED]!.offers.slice();
    e.step(null);
    if (e.units.length > maxUnits) maxUnits = e.units.length;
    for (const ev of e.events) {
      const S = ev.team ? side[ev.team] : undefined;
      if (!S) continue;
      const flip = (key: string) => (S.flips[key] = (S.flips[key] ?? 0) + 1);
      switch (ev.type) {
        case 'built':
          flip(cardAt(e, offers, ev.team!, ev.x!, ev.y!));
          break;
        case 'barracks':
          flip(cardAt(e, offers, ev.team!, ev.x!, ev.y!));
          S.barracks[ev.rarity ?? 0]!++;
          break;
        case 'mysteryNothing':
        case 'mysteryWin':
          flip('myst');
          S.mystery[ev.r ?? 0]!++;
          break;
        case 'spawn':
          S.trained[UNITS[ev.unit as UnitKey].rarity]!++;
          break;
        case 'mapEvent': {
          const k = EVENT_LIST.findIndex((d) => d.key === ev.kind);
          S.events[ev.kind!] = (S.events[ev.kind!] ?? 0) + 1;
          S.eventWorth += eventWorth(k);
          if (e.tileAt(ev.x!, ev.y!)?.r === MID_ROW) S.middleAt.push(Math.round(e.elapsed() / TICK_RATE));
          break;
        }
        case 'bldDown':
          S.lost[ev.kind ?? '?'] = (S.lost[ev.kind ?? '?'] ?? 0) + 1;
          break;
      }
    }
    for (const team of [TEAM_BLUE, TEAM_RED]) {
      const o = e.team[team]!.offers;
      for (let i = 0; i < NTILES; i++) if (o[i]! >= 0 && !e.tiles[i]!.rubble) saw[team]![i] = 1;
    }
    if (e.phase !== PHASE_PLAY) continue;
    for (const team of [TEAM_BLUE, TEAM_RED]) {
      const S = side[team]!;
      const base = e.blds.find((b) => b.team === team && b.type === 'base');
      const low = base ? base.hp / base.maxhp : 0;
      if (low < S.castleLow) S.castleLow = low;
      if (e.tick % TICK_RATE === 0 && e.team[team]!.units >= unitCap(e.elapsed())) S.capSecs++;
      if (e.elapsed() === 90 * TICK_RATE) S.minesAt90 = e.blds.filter((b) => b.team === team && b.type === 'mine').length;
    }
    if (e.tick % TICK_RATE === 0) {
      e.hash();
      const a = e.team[TEAM_BLUE]!.tiles, b = e.team[TEAM_RED]!.tiles;
      share.push(a + b ? a / (a + b) : 0.5);
    }
  }
  for (const team of [TEAM_BLUE, TEAM_RED]) {
    const S = side[team]!;
    S.goldEnd = e.team[team]!.gold;
    for (let i = 0; i < NTILES; i++) {
      const k = spot(team, i);
      if (!k) continue;
      S.laid[k === 1 ? 'mine' : 'best']++;
      if (saw[team]![i]) S.seen[k === 1 ? 'mine' : 'best']++;
    }
  }
  const r = e.result;
  return {
    seed, winner: r?.winner ?? 0, reason: r?.reason ?? 'none', secs: Math.round(e.elapsed() / TICK_RATE), maxUnits, share, side,
    eventsLeft: e.tiles.filter((t) => t.event).length,
    hash: e.hash(), ms: performance.now() - t0,
  };
}
