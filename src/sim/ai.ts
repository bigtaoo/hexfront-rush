// The built-in opponent (drives a team when the config says so; deterministic, own Prng stream).
// It plays by the same rule as a person: every half second or so it may flip one card. It values
// each offer (x10 integers) by what it has, saves up when the best card on the board is not
// affordable yet, and plans where things go: mines toward the back where they are safe, barracks
// and towers toward the front (later in the match, the further forward the better). Once its army
// is at the troop cap, more common barracks are little use: it saves for the better barracks and
// gambles on mysteries, whose troops come on top of the cap. Map events pull it: a card on an
// event's tile is worth the event too, and the cards on the way there a share of it.

import { cardCost, standingOf, tryBuy } from './economy';
import type { Engine } from './engine';
import { ticks } from './fixed';
import { hexDist, NTILES, ROWS } from './hex';
import { EVENT_LIST, OF_BAR1, OF_BAR2, OF_BAR3, OF_MINE, OF_TOWER, OFFER_LIST, TEAM_RED, unitCap } from './rules';

/** What a map event is worth to the AI, on valueOf's scale. */
const TROOP_WORTH = [8, 15, 30, 50];
export const eventWorth = (ev: number): number => {
  const d = EVENT_LIST[ev];
  return ((d.gold / 2) | 0) + d.troops * TROOP_WORTH[d.rarity];
};

export function aiUpdate(e: Engine, team: number): void {
  const ai = e.ai[team];
  if (--ai.decideT > 0) return;
  const rng = e.rngAi(team);
  ai.decideT = 15 + rng.int(16); // 0.5-1 s between taps
  const T = e.team[team];
  /** How far forward row r is, from 0 (own back edge) to ROWS-1 (the enemy's). */
  const fwd = (r: number) => (team === TEAM_RED ? r : ROWS - 1 - r);
  const s = standingOf(e, team);
  const el = e.elapsed();
  const capped = T.units >= unitCap(el) - 2;
  const flow = e.flow[team]!;
  let threat = 0;
  for (const u of e.units) if (u.alive && u.team !== team && u.tile >= 0 && flow[u.tile] <= 5) threat++;

  const valueOf = (oi: number): number => {
    switch (oi) {
      case OF_MINE: return s.mine < 3 ? 95 : s.mine < 6 ? (el < ticks(120) ? 80 : 55) : s.mine < 9 ? 35 : 15;
      case OF_TOWER: return s.tower >= 5 ? 15 : 20 + 25 * threat;
      case OF_BAR1: return capped ? 20 : s.barracks < 4 ? 75 : 50;
      case OF_BAR2: return capped ? 70 : 85;
      case OF_BAR3: return 140;
      // the mystery: a cheap gamble (troops, or now and then a barracks) that opens the tiles
      // around it; best when gold piles up
      default: return capped || T.gold >= 200 ? 70 : 40;
    }
  };
  // the map events still waiting: a card on one is worth it, a card up to 3 tiles short of one a share
  const evAt: number[] = [];
  for (const t of e.tiles) if (t.event) evAt.push(t.i);
  const lure = (ti: number): number => {
    if (!evAt.length) return 0;
    const a = e.tiles[ti];
    let w = 0;
    for (const i of evAt) {
      const b = e.tiles[i];
      const d = hexDist(a.c, a.r, b.c, b.r);
      if (d <= 3) w += d === 0 ? eventWorth(b.event) : ((eventWorth(b.event) * (4 - d)) / 6) | 0;
    }
    return w;
  };
  // the best card that is affordable within a few seconds (a jackpot card: within half a
  // minute or so) is worth saving for, unless the castle is under attack
  let top = 0;
  for (let ti = 0; ti < NTILES; ti++) {
    const oi = T.offers[ti];
    if (oi < 0) continue;
    const v = valueOf(oi) + lure(ti);
    if (cardCost(oi, s) <= T.gold + (v >= 120 && !threat ? 200 : 40)) top = Math.max(top, v);
  }
  let best = -1, bestScore = 0;
  for (let ti = 0; ti < NTILES; ti++) {
    const oi = T.offers[ti];
    if (oi < 0 || cardCost(oi, s) > T.gold) continue;
    const v = valueOf(oi) + lure(ti);
    // not worth it (unless the gold piles up with nothing better), or save for the better card
    if ((v < 25 && T.gold < 150) || v * 10 < top * 7) continue;
    const r = fwd(e.tiles[ti].r);
    // where: mines at the back, the rest toward the front
    const place = OFFER_LIST[oi].kind === 'mine' ? 3 * (ROWS - 1 - r) : el > ticks(60) ? 4 * r : r;
    const score = v * (100 + place) + rng.int(400);
    if (score > bestScore) {
      bestScore = score;
      best = ti;
    }
  }
  if (best >= 0) tryBuy(e, team, best);
}
