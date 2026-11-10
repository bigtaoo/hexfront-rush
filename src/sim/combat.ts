// Fighting: spawning troops, targeting, missiles, damage and deaths, claiming tiles, and the
// buildings that shoot or train. The castle guard is in guard.ts.

import type { Engine } from './engine';
import { dist, dist2, muldiv } from './fixed';
import type { Tile } from './map';
import { BUILD, enemyOf, GUARD, PROJ, siegePct, TEAM_BLUE, TEAM_RED, unitCap, UNITS, type Missile, type UnitKey } from './rules';
import { isDown, type Building, type Entity, type Guard, type Unit } from './types';

export function spawnUnit(e: Engine, team: number, type: UnitKey, x: number, y: number, barId: number): Unit {
  const def = UNITS[type];
  const t = e.tileAt(x, y);
  const u: Unit = {
    kind: 'unit', type, team, id: e.nextId++, x, y, px: x, py: y, hp: def.hp, maxhp: def.hp,
    cd: Math.trunc(def.rate / 2), alive: 1, tgt: 0, retT: 0, step: -1, tile: t ? t.i : -1, bar: barId,
    hitT: -1000, lungeT: -1000, face: team === TEAM_BLUE ? 1 : -1, lane: e.rng.unit.int(1000), bornT: e.tick,
    hold: barId ? 1 : 0, // a barracks troop waits for the wave; a mystery's sets off at once
  };
  e.units.push(u);
  e.ents.set(u.id, u);
  e.emit('spawn', { team, x, y, unit: type });
  return u;
}

/** Enemy guard (if up) and live enemy troops: what splash damage can reach. */
export function enemiesOf(e: Engine, team: number): (Guard | Unit)[] {
  const out: (Guard | Unit)[] = [];
  const g = e.guards[enemyOf(team)];
  if (!g.dead) out.push(g);
  for (const u of e.units) if (u.alive && u.team !== team) out.push(u);
  return out;
}

export function nearestEnemyMobile(e: Engine, team: number, x: number, y: number, maxDist: number): Guard | Unit | null {
  let best: Guard | Unit | null = null, bd = maxDist * maxDist;
  const g = e.guards[enemyOf(team)];
  if (!g.dead) {
    const d = dist2(g.x - x, g.y - y);
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  for (const u of e.units) {
    if (!u.alive || u.team === team) continue;
    const d = dist2(u.x - x, u.y - y);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

export function nearestEnemyBuilding(e: Engine, team: number, x: number, y: number, maxDist: number): Building | null {
  let best: Building | null = null, bd = maxDist * maxDist;
  for (const b of e.blds) {
    if (!b.alive || b.team === team) continue;
    const d = dist2(b.x - x, b.y - y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** Move m toward (tx, ty) by at most `step`; true when it arrived. */
export function moveToward(m: Guard | Unit, tx: number, ty: number, step: number): boolean {
  const dx = tx - m.x, dy = ty - m.y;
  const d = dist(dx, dy);
  if (d <= step || d < 1) {
    m.x = tx;
    m.y = ty;
    return true;
  }
  m.x += muldiv(dx, step, d);
  m.y += muldiv(dy, step, d);
  if (Math.abs(dx) > 50) m.face = dx > 0 ? 1 : -1;
  return false;
}

export function fire(e: Engine, src: Entity, target: Entity, dmg: number, kind: Missile, speed: number, splash: number, bldMult: number): void {
  e.projs.push({
    x: src.x, y: src.y - PROJ.launchDy, px: src.x, py: src.y - PROJ.launchDy, tgt: target.id, team: src.team,
    dmg, kind, speed, splash, bm: bldMult, tx: target.x, ty: target.y - PROJ.aimDy, life: PROJ.life,
  });
}

export function damage(e: Engine, target: Entity, amount: number, srcTeam: number, bldMult: number): void {
  if (target.kind === 'bld') amount = muldiv(amount * bldMult, siegePct(e.elapsed(), e.siegeAt), 100);
  if (isDown(target)) return;
  target.hp -= amount;
  target.hitT = e.tick;
  if (target.kind !== 'unit') e.emit('dmg', { id: target.id, team: target.team, x: target.x, y: target.y, amount });
  if (target.kind === 'guard') target.lastHit = e.tick;
  if (target.hp <= 0) kill(e, target, srcTeam);
}

function kill(e: Engine, t: Entity, srcTeam: number): void {
  if (t.kind === 'guard') {
    t.dead = 1;
    t.hp = 0;
    t.respT = GUARD.respawn;
    t.aim = 0;
    t.regen = 0;
    t.waitT = 0;
    e.emit('burst', { x: t.x, y: t.y, color: '#ffffff', n: 14 });
    e.emit('guardDown', { team: t.team, x: t.x, y: t.y });
  } else if (t.kind === 'unit') {
    t.alive = 0;
    e.emit('burst', { x: t.x, y: t.y, color: t.team === TEAM_BLUE ? '#60a5fa' : '#f87171', n: 8 });
    e.emit('unitDown', { team: t.team, x: t.x, y: t.y });
  } else {
    t.alive = 0;
    const tile = e.tiles[t.tile];
    tile.bld = 0;
    e.team[t.team].open[t.tile] = 0;
    tile.rubble = 1;
    tile.owner = srcTeam;
    e.blds.splice(e.blds.indexOf(t), 1);
    e.ents.delete(t.id);
    e.emit('burst', { x: t.x, y: t.y, color: '#a8a29e', n: 22 });
    e.emit('bldDown', { team: t.team, x: t.x, y: t.y, kind: t.type });
    if (t.type === 'base') {
      e.endMatch(srcTeam, 'base');
      return;
    }
    e.recomputeOffers(TEAM_BLUE);
    e.recomputeOffers(TEAM_RED);
  }
}

/** A troop or guard stands on tile t: it becomes the team's, unless it is a rock or under an
 *  enemy building. */
export function claimTile(e: Engine, team: number, t: Tile): void {
  if (t.obst || t.owner === team) return;
  const b = e.ent(t.bld);
  if (!(b && b.team !== team)) t.owner = team;
}

// ---------- buildings ----------
export function updateBuildings(e: Engine): void {
  const alive = [0, 0, 0];
  for (const u of e.units) if (u.alive) alive[u.team]++;
  const ready: Building[] = [];
  for (const b of e.blds) {
    const def = BUILD[b.type];
    if (def.dmg) {
      if (b.cd > 0) b.cd--;
      if (b.cd <= 0) {
        const target = nearestEnemyMobile(e, b.team, b.x, b.y, def.range!);
        if (target) {
          b.cd = def.rate!;
          fire(e, b, target, def.dmg, 'tower', PROJ.tower, 0, 1);
        }
      }
    }
    if (b.type === 'barracks' && b.unit) {
      if (b.spawnT > 0) b.spawnT--;
      if (b.spawnT <= 0) ready.push(b);
    }
  }
  // A barracks trains on its own timer for the whole match; each new troop marches on the enemy
  // castle. At the team cap the timer stays full, and a freed slot goes to the rarest troop
  // waiting (the older barracks among equals): a capped army gets better, not just replaced.
  if (ready.length > 1) ready.sort((a, b) => b.rarity - a.rarity);
  const cap = unitCap(e.elapsed(), e.siegeAt);
  for (const b of ready) {
    if (alive[b.team] >= cap || !b.unit) continue;
    b.spawnT = UNITS[b.unit].spawn;
    alive[b.team]++;
    spawnUnit(e, b.team, b.unit, b.x + e.rng.unit.range(-250, 250), b.y + (b.team === TEAM_BLUE ? -300 : 300), b.id);
  }
}

