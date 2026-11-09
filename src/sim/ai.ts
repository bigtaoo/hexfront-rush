// The built-in opponent (drives a team when the config says so; deterministic, own Prng stream).
// It plays by the same rule as a person: every half second or so it may flip one card. It values
// each offer (x10 integers), saves up when the best card on the board is not affordable yet, and
// favours cards toward the front later in the match.

import { tryBuy } from './economy';
import type { Engine } from './engine';
import { ticks } from './fixed';
import { NTILES, ROWS } from './hex';
import { OF_BAR1, OF_BAR2, OF_BAR3, OF_MINE, OF_TOWER, OFFER_LIST, TEAM_RED } from './rules';

export function aiUpdate(e: Engine, team: number): void {
  const ai = e.ai[team];
  if (--ai.decideT > 0) return;
  const rng = e.rngAi(team);
  ai.decideT = 15 + rng.int(16); // 0.5-1 s between taps
  const T = e.team[team];
  const fwd = (r: number) => (team === TEAM_RED ? r : ROWS - 1 - r);
  let mines = 0, barracks = 0, towers = 0;
  for (const b of e.blds) {
    if (b.team !== team) continue;
    if (b.type === 'mine') mines++;
    else if (b.type === 'barracks') barracks++;
    else if (b.type === 'tower') towers++;
  }
  const el = e.elapsed();
  const flow = e.flow[team]!;
  let threat = 0;
  for (const u of e.units) if (u.alive && u.team !== team && u.tile >= 0 && flow[u.tile] <= 5) threat++;

  const valueOf = (oi: number): number => {
    switch (oi) {
      case OF_MINE: return mines >= 6 ? 20 : el < ticks(90) ? 90 : 45;
      case OF_TOWER: return towers >= 4 ? 15 : 20 + 25 * threat;
      case OF_BAR1: return barracks < 3 ? 75 : 45;
      case OF_BAR2: return 85;
      case OF_BAR3: return 130;
      default: return 35; // the mystery: a cheap roll that opens the tiles around it
    }
  };
  // the best card that is affordable within a few seconds: worth saving for
  let top = 0;
  for (let ti = 0; ti < NTILES; ti++) {
    const oi = T.offers[ti];
    if (oi >= 0 && OFFER_LIST[oi].cost <= T.gold + 40) top = Math.max(top, valueOf(oi));
  }
  let best = -1, bestScore = 0;
  for (let ti = 0; ti < NTILES; ti++) {
    const oi = T.offers[ti];
    if (oi < 0 || OFFER_LIST[oi].cost > T.gold) continue;
    const v = valueOf(oi);
    if (v * 10 < top * 7) continue; // save for it unless this one is nearly as good
    const r = fwd(e.tiles[ti].r);
    const score = v * (100 + (el > ticks(60) ? 4 * r : r)) + rng.int(400);
    if (score > bestScore) {
      bestScore = score;
      best = ti;
    }
  }
  if (best >= 0) tryBuy(e, team, best);
}
