// Gold, chests, quests and buying: what a flipped card does.

import type { Engine } from './engine';
import { COLS, idx, MID_ROW, ROWS } from './hex';
import { baseTile } from './map';
import {
  BUILD, CHEST, MYSTERY_ODDS, OFFER_LIST, QUESTS, TEAM_BLUE, TEAM_RED, TEAMS, type BuildingType, type Quest,
} from './rules';

/** The team's current quest and its progress (capped at the goal), or null when all are done. */
export function questOf(e: Engine, team: number): { q: Quest; prog: number } | null {
  const T = e.team[team];
  if (T.questIdx >= e.questList.length) return null;
  const q = QUESTS[e.questList[T.questIdx]];
  const prog = q.kind === 'tiles' ? T.tiles : T.built[q.kind];
  return { q, prog: Math.min(prog, q.need) };
}

export function updateQuests(e: Engine): void {
  for (const team of TEAMS) {
    const qp = questOf(e, team);
    if (!qp || qp.prog < qp.q.need) continue;
    const T = e.team[team];
    T.gold += qp.q.reward;
    T.questIdx++;
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
      e.team[b.team].gold += def.income;
      e.emit('income', { team: b.team, kind: b.type, amount: def.income, x: b.x, y: b.y });
    }
  }
}

/** Every CHEST.every ticks a mirrored pair of chests appears just short of the middle row. */
export function updateChests(e: Engine): void {
  if (--e.chestT > 0) return;
  e.chestT = CHEST.every;
  const rng = e.rng.chest;
  for (let tries = 0; tries < 40; tries++) {
    const r = MID_ROW - 3 + rng.int(3); // the three rows before the middle, mirrored past it
    const c = rng.int(COLS);
    const a = e.tiles[idx(c, r)], b = e.tiles[idx(c, ROWS - 1 - r)];
    if (a.obst || b.obst || a.bld || b.bld || a.chest || b.chest) continue;
    a.chest = b.chest = 1;
    e.emit('chestSpawn', { a: a.i, b: b.i });
    break;
  }
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
  if (T.gold < off.cost) {
    e.emit('needGold', { team, x: tile.x, y: tile.y });
    return false;
  }
  T.gold -= off.cost;
  T.built[off.kind]++;
  if (off.kind === 'mystery') {
    // whatever it gives, the tile is flipped: its card is spent and the tiles around it open up
    T.open[ti] = 1;
    T.offers[ti] = -1;
    tile.owner = team;
    let r = e.rng.loot.int(100), roll = 0;
    while (roll < 3 && r >= MYSTERY_ODDS[roll]) {
      r -= MYSTERY_ODDS[roll];
      roll++;
    }
    if (roll === 0) {
      e.emit('mysteryNothing', { team, x: tile.x, y: tile.y });
    } else {
      const rarity = roll === 1 ? 0 : roll === 2 ? 2 : 3;
      const type = e.pickUnit(rarity);
      const n = rarity === 0 ? 3 : 1;
      for (let k = 0; k < n; k++) e.spawnUnit(team, type, tile.x + (k - 1) * 400, tile.y + 200, 0);
      e.emit('mysteryWin', { team, x: tile.x, y: tile.y, unit: type, rarity });
    }
    e.emit('burst', { x: tile.x, y: tile.y, color: '#fde047', n: 14 });
    e.recomputeOffers(team);
    return true;
  }
  if (off.kind === 'barracks') {
    const rarity = e.rollRarity(off.odds!);
    const unit = e.pickUnit(rarity);
    e.addBuilding(team, 'barracks', ti, { unit, rarity });
    e.emit('barracks', { team, unit, rarity, x: tile.x, y: tile.y });
  } else {
    e.addBuilding(team, off.kind as BuildingType, ti, null);
    e.emit('built', { team, kind: off.kind, x: tile.x, y: tile.y });
  }
  e.emit('burst', { x: tile.x, y: tile.y, color: team === TEAM_BLUE ? '#93c5fd' : '#fca5a5', n: 12 });
  e.recomputeOffers(TEAM_BLUE);
  e.recomputeOffers(TEAM_RED);
  return true;
}
