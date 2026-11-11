// The built-in opponent (drives a team when the config says so; deterministic, own Prng stream).
// It plays by the same rule as a person: every half second or so it may flip one card. It values
// each offer (x10 integers) by what it has, saves up when the best card on the board is not
// affordable yet, and plans where things go: mines toward the back where they are safe, barracks
// and towers toward the front (later in the match, the further forward the better). Once its army
// is at the troop cap, more common barracks are little use: it saves for the better barracks and
// gambles on mysteries, whose troops come on top of the cap. Map events pull it: a card on an
// event's tile is worth the event too, and the cards on the way there a share of it.
//
// Its skill (the side's setup, setup.ts) sets how well it does all that: a beginner taps slowly,
// half at random, never saves up and walks past the chests; the standard AI (AI_SKILL_STD, the
// best) is the one above (AI_SKILLS). Its style leans its taste toward one kind of card
// (AI_STYLES): a rival with a character, for the campaign.

import { cardCost, standingOf, tryBuy } from './economy';
import type { Engine } from './engine';
import { ticks } from './fixed';
import { hexDist, NTILES, ROWS } from './hex';
import { EVENT_LIST, OF_BAR1, OF_BAR2, OF_BAR3, OF_MINE, OF_TOWER, OFFER_LIST, TEAM_RED, unitCap } from './rules';

/** One skill level.
 *    think, span  ticks between taps: think plus up to span more
 *    noise        a random amount up to this is added to each card's score (scores run ~2000-30000)
 *    save         saves up for the best card on the board
 *    lure         percent of a map event's worth it sees
 *    place        plans where things go (mines back, the rest forward)
 *    cap          knows the troop cap (saves for better barracks and mysteries once at it)
 *    guard        builds towers when its castle is threatened
 * Trials (scripts/aiLab.ts) found nothing that beats the standard level by more than chance:
 * quicker taps, less noise, valuing new cards seen or Barracks III higher all came out even, and
 * weighting a kind of card wrong only loses (mines at 30% won 10%). A harder rival comes from
 * the setup's handicaps instead. */
export interface AiSkill {
  think: number;
  span: number;
  noise: number;
  save: boolean;
  lure: number;
  place: boolean;
  cap: boolean;
  guard: boolean;
}
export const AI_SKILLS: readonly AiSkill[] = [
  { think: 90, span: 60, noise: 30000, save: false, lure: 0, place: false, cap: false, guard: false },
  { think: 60, span: 40, noise: 12000, save: false, lure: 50, place: false, cap: false, guard: true },
  { think: 30, span: 30, noise: 4000, save: true, lure: 100, place: true, cap: false, guard: true },
  { think: 15, span: 16, noise: 400, save: true, lure: 100, place: true, cap: true, guard: true },
];

/** Percent weights on what each kind of card is worth: mines, towers, barracks, mysteries.
 *  0 balanced, 1 builder (economy first), 2 warlord (barracks), 3 turtle (towers), 4 gambler
 *  (mysteries). Each wins about half against the balanced one (the builder a little more,
 *  55-58%; `npm run ladder -- styles`): a style changes how the rival plays, not how hard it is.
 *
 *  The balanced weights are the peak, not a round number picked for looks: a sweep of the tower
 *  weight alone against the balanced AI, 120 matches a point with the colours swapped, won 46% at
 *  0, 48% at 50, 50% at 100, 38% at 200 and 25% at 400. So a tower is worth about what it costs,
 *  and the balance report's line that the side with more towers wins 2% of matches is the other
 *  way round: a side builds towers because its castle is already in trouble. */
export const AI_STYLES: readonly (readonly number[])[] = [
  [100, 100, 100, 100],
  [150, 60, 90, 120],
  [100, 40, 125, 110],
  [110, 200, 90, 90],
  [90, 60, 90, 250],
];
const KIND_IX = { mine: 0, tower: 1, barracks: 2, mystery: 3 } as const;

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
  const setup = e.setupOf(team);
  const k = AI_SKILLS[setup.skill]!;
  const style = AI_STYLES[setup.style]!;
  ai.decideT = k.think + rng.int(k.span + 1);
  const T = e.team[team];
  /** How far forward row r is, from 0 (own back edge) to ROWS-1 (the enemy's). */
  const fwd = (r: number) => (team === TEAM_RED ? r : ROWS - 1 - r);
  const s = standingOf(e, team);
  const el = e.elapsed();
  const capped = k.cap && T.units >= unitCap(el, e.siegeAt) - 2;
  const flow = e.flow[team]!;
  let threat = 0;
  if (k.guard) for (const u of e.units) if (u.alive && u.team !== team && u.tile >= 0 && flow[u.tile] <= 5) threat++;

  const valueOf = (oi: number): number => ((baseValue(oi) * style[KIND_IX[OFFER_LIST[oi].kind]]!) / 100) | 0;
  const baseValue = (oi: number): number => {
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
    if (!evAt.length || !k.lure) return 0;
    const a = e.tiles[ti];
    let w = 0;
    for (const i of evAt) {
      const b = e.tiles[i];
      const d = hexDist(a.c, a.r, b.c, b.r);
      if (d <= 3) w += d === 0 ? eventWorth(b.event) : ((eventWorth(b.event) * (4 - d)) / 6) | 0;
    }
    return ((w * k.lure) / 100) | 0;
  };
  // the best card that is affordable within a few seconds (a jackpot card: within half a
  // minute or so) is worth saving for, unless the castle is under attack
  let top = 0;
  for (let ti = 0; ti < NTILES; ti++) {
    const oi = T.offers[ti];
    if (oi < 0) continue;
    const v = valueOf(oi) + lure(ti);
    if (k.save && cardCost(oi, s) <= T.gold + (v >= 120 && !threat ? 200 : 40)) top = Math.max(top, v);
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
    const place = !k.place ? 0 : OFFER_LIST[oi].kind === 'mine' ? 3 * (ROWS - 1 - r) : el > ticks(60) ? 4 * r : r;
    const score = v * (100 + place) + rng.int(k.noise);
    if (score > bestScore) {
      bestScore = score;
      best = ti;
    }
  }
  if (best >= 0) tryBuy(e, team, best);
}
