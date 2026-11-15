// Troops on the move: targeting, marching down the flow field, pathing around rocks, keeping
// apart, capturing tiles; and the missiles in flight.

import { claimTile, damage, fire, moveToward, nearestEnemyBuilding, nearestEnemyMobile, nearestPrey } from './combat';
import { bfsStep } from './path';
import type { Engine } from './engine';
import { dist, dist2, isqrt, muldiv } from './fixed';
import { WORLD_H, WORLD_W } from './hex';
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
      // Preferred prey first, hunted across the wider `seek` radius, then whatever is nearest.
      const hunted = def.prefer === 'bld'
        ? nearestEnemyBuilding(e, u.team, u.x, u.y, def.seek)
        : def.prefer ? nearestPrey(e, u.team, u.x, u.y, def.seek, def.prefer) : null;
      const t = hunted || nearestEnemyMobile(e, u.team, u.x, u.y, def.aggroMobile) ||
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
  // tile capture, and the dead swept out in the same pass
  let dead = 0;
  for (const u of e.units) {
    if (!u.alive) {
      dead++;
      e.ents.delete(u.id);
      continue;
    }
    const t = e.tileAt(u.x, u.y);
    if (t && t.i !== u.tile) {
      u.tile = t.i;
      claimTile(e, u.team, t);
    }
  }
  if (dead) e.units = e.units.filter((u) => u.alive);
}

/** Push overlapping units apart through a uniform grid (after Potion Siege's spatial hash):
 *  each unit only meets its own and the 8 surrounding cells. Pairs run in index order.
 *
 *  The grid is three scratch arrays kept between ticks, not a Map rebuilt each tick: this was
 *  23% of the sim's time before. A cell holds the head of a linked list of unit indexes, and
 *  `gStamp` says which call that head belongs to, so nothing is cleared between ticks. The lists
 *  are built back to front so that walking one gives ascending indexes — the pair order the
 *  nudges depend on, and the reason the golden hashes do not move. */
let gHead = new Int32Array(0);
let gStamp = new Int32Array(0);
let gNext = new Int32Array(0);
let gCol = new Int32Array(0);
let gRow = new Int32Array(0);
let gGen = 0;

function separate(e: Engine): void {
  const us = e.units;
  let maxR = 0;
  for (const u of us) if (u.alive && UNITS[u.type].size > maxR) maxR = UNITS[u.type].size;
  const cell = Math.max(200, muldiv(maxR, 18, 10));
  const gw = Math.trunc(WORLD_W / cell) + 1;
  const gh = Math.trunc(WORLD_H / cell) + 1;
  const cells = gw * gh;
  if (gHead.length < cells) {
    gHead = new Int32Array(cells);
    gStamp = new Int32Array(cells);
    gGen = 0;
  }
  if (gNext.length < us.length) {
    gNext = new Int32Array(us.length + 64);
    gCol = new Int32Array(us.length + 64);
    gRow = new Int32Array(us.length + 64);
  }
  const gen = ++gGen;
  const col = (x: number) => Math.min(gw - 1, Math.max(0, Math.floor(x / cell)));
  const row = (y: number) => Math.min(gh - 1, Math.max(0, Math.floor(y / cell)));
  for (let i = us.length - 1; i >= 0; i--) {
    const u = us[i];
    if (!u.alive) continue;
    const cx = col(u.x), cy = row(u.y);
    gCol[i] = cx;
    gRow[i] = cy;
    const key = cx * gh + cy;
    gNext[i] = gStamp[key] === gen ? gHead[key] : -1;
    gStamp[key] = gen;
    gHead[key] = i;
  }
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    if (!a.alive) continue;
    // The cell each unit landed in, from the build pass. a.x and a.y move as nudges land, so
    // they are read fresh every pair — the cell is not, exactly as before.
    const cx = gCol[i]!, cy = gRow[i]!;
    const sizeA = UNITS[a.type].size;
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox;
      if (gx < 0 || gx >= gw) continue;
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy;
        if (gy < 0 || gy >= gh) continue;
        const key = gx * gh + gy;
        if (gStamp[key] !== gen) continue;
        for (let j = gHead[key]; j >= 0; j = gNext[j]) {
          if (j <= i) continue;
          const b = us[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = muldiv(sizeA + UNITS[b.type].size, 9, 10);
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
    u.step = bfsStep(e.tiles, cur.i, tt.i);
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
        // Inlined rather than enemiesOf(): that built an array of every enemy on the map for
        // every splash hit. Same order (guard first, then troops in index order) and the same
        // reach test, so the result is identical; nothing here removes a unit from e.units.
        const g = e.guards[enemyOf(p.team)];
        if (!g.dead && g !== tg && dist2(g.x - p.tx, g.y - p.ty) < r2) {
          damage(e, g, Math.trunc(p.dmg / 2), p.team, 1);
        }
        for (const v of e.units) {
          if (!v.alive || v.team === p.team || v === tg) continue;
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
