// Gold, map events, quests and buying: what a flipped card does.

import { rollRarity } from './cardLayout';
import { claimAround, recomputeOffers } from './claims';
import type { Engine } from './engine';
import { baseTile, type Tile } from './map';
import {
  BEHIND_SLACK, BUILD, comebackPct, enemyOf, EVENT_LIST, MYSTERY, MYSTERY_W_TOTAL, OFFER_LIST, QUEST_LOOP, QUESTS, SURGE_MAX, SURGE_PER_TILE,
  TEAM_BLUE, TEAM_RED, TEAMS, type BuildingType, type OfferKind, type Quest,
} from './rules';

/** How many buildings of each card kind a team has standing. */
export type Standing = Record<OfferKind, number>;

export function standingOf(e: Engine, team: number): Standing {
  const s: Standing = { mine: 0, tower: 0, barracks: 0, mystery: 0 };
  for (const b of e.blds) if (b.team === team && b.type !== 'base') s[b.type]++;
  return s;
}

/** What card oi costs. A fixed number: the same for both teams, the same at minute one and at
 *  minute ten. The price a tile shows is the thing the player plans against, and a price that
 *  walks — up with what you own, down when you fall behind — is a plan that cannot be made. What
 *  the ground is worth is written on it: 50, 100, 200, and 25 for a gamble. */
export const cardCost = (oi: number): number => OFFER_LIST[oi].cost;

/** How many tiles a team is behind on, past the slack where a lead is still noise. 0 when level
 *  or ahead. Ground is the one measure both players can read straight off the map, which is why
 *  the trailing side's two outlets hang on it rather than on gold or army. */
export function behindBy(e: Engine, team: number): number {
  const d = e.team[enemyOf(team)].tiles - e.team[team].tiles - BEHIND_SLACK;
  return d > 0 ? d : 0;
}

/** 矿脉涌动: percent on top of what this team's mines pay, while it is behind on ground. It is
 *  something to act on, not a hidden hand — being behind makes a mine the best card on the board.
 *  Since D81 it is the trailing side's only outlet: the 退路价 rebate used to cut every price,
 *  which is what a fixed price cannot allow. */
export function surgePct(e: Engine, team: number): number {
  return taper(e, Math.min(behindBy(e, team) * SURGE_PER_TILE, SURGE_MAX));
}
/** What is left of an outlet at this point in the match (§13 P1.5's comeback window). */
function taper(e: Engine, pct: number): number {
  return Math.trunc((pct * comebackPct(e.playT)) / 100);
}

/** The quest the team is on and how far it has come (capped at the goal). The match's listed
 *  quests come first; after them the loop (rules.ts QUEST_LOOP) goes round for as long as the
 *  match lasts, so there is always one. */
export function questOf(e: Engine, team: number): { q: Quest; prog: number } {
  const T = e.team[team];
  const q = QUESTS[questAt(e, T.questIdx)];
  const prog = q.kind === 'tiles' ? T.tiles : T.built[q.kind] - T.questBase;
  return { q, prog: Math.max(0, Math.min(prog, q.need)) };
}
/** Which QUESTS entry the team's n-th quest is. */
function questAt(e: Engine, n: number): number {
  const listed = e.questList.length;
  return n < listed ? e.questList[n] : QUEST_LOOP[(n - listed) % QUEST_LOOP.length];
}

export function updateQuests(e: Engine): void {
  for (const team of TEAMS) {
    const T = e.team[team];
    const qp = questOf(e, team);
    if (qp.prog < qp.q.need) continue;
    T.gold += qp.q.reward;
    T.questIdx++;
    // a looped quest asks for so many more, counted from here
    const next = QUESTS[questAt(e, T.questIdx)];
    T.questBase = T.questIdx >= e.questList.length && next.kind !== 'tiles' ? T.built[next.kind] : 0;
    T.questT = e.tick;
    const home = e.tiles[baseTile(team)];
    e.emit('quest', { team, reward: qp.q.reward, x: home.x, y: home.y });
  }
}

export function updateEconomy(e: Engine): void {
  for (const b of e.blds) {
    const def = BUILD[b.type];
    if (!def.income) continue;
    if (++b.timer >= def.incomeEvery!) {
      b.timer = 0;
      // the handicap and the surge both in hundredths, so the pair is ten-thousandths: what the
      // rounding drops is carried to the next payout rather than lost
      const T = e.team[b.team];
      const surge = b.type === 'mine' ? surgePct(e, b.team) : 0;
      const due = def.income * e.setupOf(b.team).income * (100 + surge) + T.incomeCarry;
      const amount = Math.trunc(due / 10000);
      T.incomeCarry = due - amount * 10000;
      T.gold += amount;
      e.emit('income', { team: b.team, kind: b.type, amount, surge, x: b.x, y: b.y });
    }
  }
}

/** The first team to flip the card on a map event's tile claims the event: its gold, or its
 *  troops (one kind, setting off at once, on top of the cap). */
function claimEvent(e: Engine, team: number, tile: Tile): void {
  const ev = tile.event;
  if (!ev) return;
  tile.event = 0;
  const d = EVENT_LIST[ev];
  e.team[team].gold += d.gold;
  const unit = d.troops ? e.pickUnit(d.rarity) : undefined;
  for (let k = 0; k < d.troops; k++) e.spawnUnit(team, unit!, tile.x + (k - 1) * 400, tile.y + 200, 0);
  e.emit('mapEvent', { team, kind: d.key, gold: d.gold, unit, n: d.troops, rarity: d.rarity, x: tile.x, y: tile.y });
  e.emit('burst', { x: tile.x, y: tile.y, burst: 'gold', n: 18 });
}

/** Flip the card on tile ti: pay for it and build (or roll the mystery). Either way the tile is
 *  now flipped (T.open), so the free tiles around it get cards. False when refused. */
export function tryBuy(e: Engine, team: number, ti: number): boolean {
  const T = e.team[team];
  const oi = T.offers[ti];
  if (oi < 0) return false;
  const tile = e.tiles[ti];
  if (tile.bld || tile.obst) return false;
  // not on ground the enemy holds (D134). Engine.offerable keeps a card off those tiles in the
  // first place, so nothing the board shows can reach here -- but buying is where a move becomes
  // a building and a stale offer, a replayed command or a hostile client all arrive through this
  // one door, so the rule is written on the door and not only on the sign.
  if (tile.owner === enemyOf(team)) return false;
  const off = OFFER_LIST[oi];
  const cost = cardCost(oi);
  if (T.gold < cost) {
    e.emit('needGold', { team, x: tile.x, y: tile.y });
    return false;
  }
  T.gold -= cost;
  T.built[off.kind]++;
  claimEvent(e, team, tile);
  if (off.kind === 'mystery') {
    // whatever it gives, the tile is flipped: its card is spent and the tiles around it open up
    T.open[ti] = 1;
    T.offers[ti] = -1;
    tile.owner = team;
    claimAround(e, team, ti);
    let r = e.rng.loot.int(MYSTERY_W_TOTAL), roll = 0;
    while (roll < MYSTERY.length - 1 && r >= MYSTERY[roll].w) {
      r -= MYSTERY[roll].w;
      roll++;
    }
    const m = MYSTERY[roll];
    e.emit('burst', { x: tile.x, y: tile.y, burst: 'gold', n: 14 });
    if (m.squad) {
      const type = e.pickUnit(m.squad.rarity);
      for (let k = 0; k < m.squad.n; k++) e.spawnUnit(team, type, tile.x + (k - 1) * 400, tile.y + 200, 0);
      e.emit('mysteryWin', { team, x: tile.x, y: tile.y, unit: type, rarity: m.squad.rarity, n: m.squad.n, r: roll });
    } else if (m.barracks !== undefined) {
      // a barracks on the tile: it trains for good, claims the ground and counts as a barracks
      const unit = e.pickUnit(m.barracks);
      e.addBuilding(team, 'barracks', ti, { unit, rarity: m.barracks });
      T.built.barracks++;
      e.emit('mysteryWin', { team, x: tile.x, y: tile.y, unit, rarity: m.barracks, kind: 'barracks', r: roll });
      recomputeOffers(e, TEAM_BLUE);
      recomputeOffers(e, TEAM_RED);
      return true;
    } else {
      e.emit('mysteryNothing', { team, x: tile.x, y: tile.y, r: roll });
    }
    recomputeOffers(e, team);
    return true;
  }
  if (off.kind === 'barracks') {
    // the layout's barracks, or a filler one on rubble
    const lay = e.layout;
    const rarity = !tile.rubble && lay.card[team]![ti] === oi ? lay.rarity[team]![ti]! : rollRarity(e.rng.loot, oi);
    const unit = e.pickUnit(rarity);
    e.addBuilding(team, 'barracks', ti, { unit, rarity });
    e.emit('barracks', { team, unit, rarity, x: tile.x, y: tile.y });
  } else {
    e.addBuilding(team, off.kind as BuildingType, ti, null);
    e.emit('built', { team, kind: off.kind, x: tile.x, y: tile.y });
  }
  e.emit('burst', { x: tile.x, y: tile.y, team, burst: 'claim', n: 12 });
  recomputeOffers(e, TEAM_BLUE);
  recomputeOffers(e, TEAM_RED);
  return true;
}
