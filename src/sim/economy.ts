// Gold, map events, quests and buying: what a flipped card does.

import { fillerRarity } from './cardLayout';
import type { Engine } from './engine';
import { baseTile, type Tile } from './map';
import {
  BUILD, EVENT_LIST, MYSTERY, MYSTERY_W_TOTAL, OFFER_LIST, QUEST_LOOP, QUESTS, TEAM_BLUE, TEAM_RED, TEAMS, type BuildingType, type OfferKind, type Quest,
} from './rules';

/** How many buildings of each card kind a team has standing (what card prices go up with). */
export type Standing = Record<OfferKind, number>;

export function standingOf(e: Engine, team: number): Standing {
  const s: Standing = { mine: 0, tower: 0, barracks: 0, mystery: 0 };
  for (const b of e.blds) if (b.team === team && b.type !== 'base') s[b.type]++;
  return s;
}

/** What card oi costs a team with `s` standing: its base price, plus its step for each building
 *  of its kind standing, so the tenth mine pays back far slower than the first. */
export function cardCost(oi: number, s: Standing): number {
  const off = OFFER_LIST[oi];
  return off.cost + off.step * s[off.kind];
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
      // an income handicap in hundredths: 95 % of 10 is 9 now and the half carried to the next
      const T = e.team[b.team];
      const due = def.income * e.setupOf(b.team).income + T.incomeCarry;
      const amount = Math.trunc(due / 100);
      T.incomeCarry = due - amount * 100;
      T.gold += amount;
      e.emit('income', { team: b.team, kind: b.type, amount, x: b.x, y: b.y });
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
  const off = OFFER_LIST[oi];
  const cost = cardCost(oi, standingOf(e, team));
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
      e.recomputeOffers(TEAM_BLUE);
      e.recomputeOffers(TEAM_RED);
      return true;
    } else {
      e.emit('mysteryNothing', { team, x: tile.x, y: tile.y, r: roll });
    }
    e.recomputeOffers(team);
    return true;
  }
  if (off.kind === 'barracks') {
    // the layout's barracks, or a filler one on rubble
    const lay = e.layout;
    const rarity = !tile.rubble && lay.card[team]![ti] === oi ? lay.rarity[team]![ti]! : fillerRarity(e.rng.loot, oi);
    const unit = e.pickUnit(rarity);
    e.addBuilding(team, 'barracks', ti, { unit, rarity });
    e.emit('barracks', { team, unit, rarity, x: tile.x, y: tile.y });
  } else {
    e.addBuilding(team, off.kind as BuildingType, ti, null);
    e.emit('built', { team, kind: off.kind, x: tile.x, y: tile.y });
  }
  e.emit('burst', { x: tile.x, y: tile.y, team, burst: 'claim', n: 12 });
  e.recomputeOffers(TEAM_BLUE);
  e.recomputeOffers(TEAM_RED);
  return true;
}
