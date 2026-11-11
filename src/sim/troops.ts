// Troops on the move: targeting, marching down the flow field, pathing around rocks, keeping
// apart, capturing tiles; and the missiles in flight.

import { claimTile, damage, enemiesOf, fire, moveToward, nearestEnemyBuilding, nearestEnemyMobile } from './combat';
import { bfsPath } from './path';
import type { Engine } from './engine';
import { dist, dist2, isqrt, muldiv } from './fixed';
import { enemyOf, PROJ, UNITS } from './rules';
import type { Entity, Unit } from './types';

export function updateUnits(e: Engine): void {
  const us = e.units;
  for (const u of us) {
    if (!u.alive) continue;
    const def = UNITS[u.type];
    if (u.cd > 0) u.cd--;
    if (--u.retT <= 0) {
      u.retT = 9 + e.rng.unit.int(4);
      const t = nearestEnemyMobile(e, u.team, u.x, u.y, def.aggroMobile) ||
        nearestEnemyBuilding(e, u.team, u.x, u.y, def.aggroBuilding);
      u.tgt = t ? t.id : 0;
      u.step = -1;
    }
    const tg = e.live(u.tgt);
    if (u.tgt && !tg) {
      u.tgt = 0;
      u.retT = 0;
    }
    if (tg) {
      const d = dist(tg.x - u.x, tg.y - u.y);
      const reach = def.range + Math.trunc(e.radiusOf(tg) / 2);
      if (d <= reach) {
        if (u.cd <= 0) {
          u.cd = def.rate;
          if (def.ranged) fire(e, u, tg, def.dmg, def.ranged, PROJ.unit, def.splash, def.bldMult);
          else {
            damage(e, tg, def.dmg, u.team, def.bldMult);
            u.lungeT = e.tick;
            e.emit('melee', { team: u.team, x: tg.x, y: tg.y });
          }
        }
        if (Math.abs(tg.x - u.x) > 50) u.face = tg.x > u.x ? 1 : -1;
      } else unitStepToward(e, u, tg, def.speed);
    } else if (!u.hold) unitMarch(e, u, def.speed);
  }
  separate(e);
  // tile capture
  for (const u of e.units) {
    if (!u.alive) continue;
    const t = e.tileAt(u.x, u.y);
    if (t && t.i !== u.tile) {
      u.tile = t.i;
      claimTile(e, u.team, t);
    }
  }
  let dead = 0;
  for (const u of e.units) {
    if (!u.alive) {
      dead++;
      e.ents.delete(u.id);
    }
  }
  if (dead) e.units = e.units.filter((u) => u.alive);
}

/** Push overlapping units apart through a uniform grid (after Potion Siege's spatial hash):
 *  each unit only meets its own and the 8 surrounding cells. Pairs run in index order. */
function separate(e: Engine): void {
  const us = e.units;
  let maxR = 0;
  for (const u of us) if (u.alive && UNITS[u.type].size > maxR) maxR = UNITS[u.type].size;
  const cell = Math.max(200, muldiv(maxR, 18, 10));
  const grid = new Map<number, number[]>();
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (!u.alive) continue;
    const key = Math.floor(u.x / cell) * 4096 + Math.floor(u.y / cell);
    let list = grid.get(key);
    if (!list) {
      list = [];
      grid.set(key, list);
    }
    list.push(i);
  }
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    if (!a.alive) continue;
    const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const list = grid.get((cx + ox) * 4096 + cy + oy);
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const j = list[k];
          if (j <= i) continue;
          const b = us[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = muldiv(UNITS[a.type].size + UNITS[b.type].size, 9, 10);
          const d2 = dx * dx + dy * dy;
          if (d2 < min * min && d2 > 100) {
            const d = isqrt(d2), push = Math.trunc((min - d) / 2);
            if (push <= 0) continue;
            const nx = muldiv(dx, push, d), ny = muldiv(dy, push, d);
            nudge(e, a, -nx, -ny);
            nudge(e, b, nx, ny);
          }
        }
      }
    }
  }
}

function nudge(e: Engine, u: Unit, dx: number, dy: number): void {
  const t = e.tileAt(u.x + dx, u.y + dy);
  if (t && !t.obst) {
    u.x += dx;
    u.y += dy;
  }
}

function unitStepToward(e: Engine, u: Unit, tg: Entity, speed: number): void {
  const cur = e.tileAt(u.x, u.y);
  const tt = e.tileAt(tg.x, tg.y);
  if (!cur || !tt || cur.i === tt.i || cur.nb.includes(tt.i)) {
    moveToward(u, tg.x, tg.y, speed);
    return;
  }
  if (u.step < 0 || u.step === cur.i) {
    const p = bfsPath(e.tiles, cur.i, tt.i);
    u.step = p && p.length ? p[0] : -1;
  }
  if (u.step >= 0) {
    const s = e.tiles[u.step];
    if (moveToward(u, s.x, s.y, speed)) u.step = -1;
  } else moveToward(u, tg.x, tg.y, speed);
}

/** Down the enemy castle's flow field; ties between equally good tiles split by the unit's lane. */
function unitMarch(e: Engine, u: Unit, speed: number): void {
  const field = e.flow[enemyOf(u.team)]!;
  const cur = e.tileAt(u.x, u.y);
  if (!cur) return;
  if (u.step < 0 || u.step === cur.i) {
    const best: number[] = [];
    let bd = field[cur.i];
    for (const n of cur.nb) {
      if (e.tiles[n].obst) continue;
      if (field[n] < bd) {
        bd = field[n];
        best.length = 0;
        best.push(n);
      } else if (field[n] === bd && best.length) best.push(n);
    }
    if (!best.length) {
      u.step = -1;
      return;
    }
    u.step = best[Math.trunc((u.lane * best.length) / 1000) % best.length];
  }
  const s = e.tiles[u.step];
  const off = muldiv(u.lane - 500, 6, 10); // aim a bit off-centre per unit so groups spread
  if (moveToward(u, s.x + off, s.y, speed)) u.step = -1;
  else {
    const here = e.tileAt(u.x, u.y);
    if (here && here.i === u.step) u.step = -1;
  }
}

// ---------- projectiles ----------
export function updateProjectiles(e: Engine): void {
  for (const p of e.projs) {
    p.life--;
    const tg = e.live(p.tgt);
    if (tg) {
      p.tx = tg.x;
      p.ty = tg.y - PROJ.aimDy;
    }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = dist(dx, dy);
    if (d <= p.speed) {
      p.life = 0;
      p.x = p.tx;
      p.y = p.ty;
      if (tg) damage(e, tg, p.dmg, p.team, p.bm);
      if (p.splash) {
        const r2 = p.splash * p.splash;
        for (const v of enemiesOf(e, p.team)) {
          if (v === tg) continue;
          if (dist2(v.x - p.tx, v.y - p.ty) < r2) damage(e, v, Math.trunc(p.dmg / 2), p.team, 1);
        }
        e.emit('ring', { x: p.tx, y: p.ty, r: p.splash, kind: p.kind });
      }
      e.emit('hit', { team: p.team, victim: tg ? tg.team : 0 });
    } else {
      p.x += muldiv(dx, p.speed, d);
      p.y += muldiv(dy, p.speed, d);
    }
  }
  let gone = 0;
  for (const p of e.projs) if (p.life <= 0) gone++;
  if (gone) e.projs = e.projs.filter((p) => p.life > 0);
}
