// Troops on the move: targeting, marching down the flow field, pathing around rocks, keeping
// apart, capturing tiles; and the missiles in flight.

import { claimTile, damage, fire, moveToward, nearestEnemyBuilding, nearestEnemyMobile, nearestPrey } from './combat';
import { bfsStep } from './path';
import type { Engine } from './engine';
import { dist, dist2, isqrt, muldiv } from './fixed';
import { WORLD_H, WORLD_W } from './hex';
import { baseTile } from './map';
import { ALLY_BUBBLE, enemyOf, PROJ, TEAM_BLUE, UNITS } from './rules';
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
    } else if (u.hold) unitMuster(e, u, def.speed);
    else unitMarch(e, u, def.speed);
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
  // wide enough that the furthest pair the test below can still push apart lands in a
  // neighbouring cell: two of the largest bodies, plus the elbow room allies keep
  const cell = Math.max(200, muldiv(maxR, 18, 10) + ALLY_BUBBLE);
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
          const min = muldiv(sizeA + UNITS[b.type].size, 9, 10) + (a.team === b.team ? ALLY_BUBBLE : 0);
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          if (d2 > 100) {
            const d = isqrt(d2), push = Math.trunc((min - d) / 2);
            if (push <= 0) continue;
            const nx = muldiv(dx, push, d), ny = muldiv(dy, push, d);
            nudge(e, a, -nx, -ny);
            nudge(e, b, nx, ny);
          } else {
            // Stacked all but exactly: there is no direction between them to push along (isqrt(0)
            // is 0, and dividing by it is how this pair used to be skipped, so two troops that
            // landed on the same point stayed welded together). Take a direction from the pair's
            // lanes instead: fixed per pair, so it is deterministic, and different pairs scatter
            // different ways. One tick of this is enough to put them back in the branch above.
            const push = Math.trunc(min / 4);
            const k = (a.lane + b.lane) & 3;
            const s = k & 2 ? -push : push;
            const nx = k & 1 ? s : 0, ny = k & 1 ? 0 : s;
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

/** Is (x, y) inside a rock, a tree or a cactus? Off the map counts as open, exactly as walking
 *  off the edge always has: only the obstacles the pathing already routes around block here. */
function blocked(e: Engine, x: number, y: number): boolean {
  const t = e.tileAt(x, y);
  return !!(t && t.obst);
}

/** moveToward, but the step never ends inside an obstacle: when the straight line would put the
 *  troop on a rock, it is retried one axis at a time so the troop slides along the rock's face.
 *
 *  moveToward itself has no idea the map has obstacles — only `nudge` ever checked — so a troop
 *  marching with a lane offset would clip the corner of a hex nobody picked as its step and stand
 *  inside it, sometimes for half a minute. A troop that is somehow already in one walks out
 *  freely, or it would be stuck there for good. */
function walk(e: Engine, u: Unit, tx: number, ty: number, speed: number): boolean {
  const x0 = u.x, y0 = u.y;
  const done = moveToward(u, tx, ty, speed);
  // the open-ground case costs one tile lookup and nothing else; the rest only runs on a rock
  if (!blocked(e, u.x, u.y)) return done;
  if (blocked(e, x0, y0)) return done;
  const nx = u.x, ny = u.y;
  u.x = x0;
  u.y = y0;
  if (nx !== x0 && !blocked(e, nx, y0)) {
    u.x = nx;
    if (Math.abs(nx - x0) > 50) u.face = nx > x0 ? 1 : -1;
  } else if (ny !== y0 && !blocked(e, x0, ny)) {
    u.y = ny;
  }
  return false;
}

function unitStepToward(e: Engine, u: Unit, tg: Entity, speed: number): void {
  const cur = e.tileAt(u.x, u.y);
  const tt = e.tileAt(tg.x, tg.y);
  if (!cur || !tt || cur.i === tt.i || cur.nb.includes(tt.i)) {
    walk(e, u, tg.x, tg.y, speed);
    return;
  }
  if (u.step < 0 || u.step === cur.i) {
    u.step = bfsStep(e.tiles, cur.i, tt.i);
  }
  if (u.step >= 0) {
    const s = e.tiles[u.step];
    if (walk(e, u, s.x, s.y, speed)) u.step = -1;
  } else walk(e, u, tg.x, tg.y, speed);
}

/** Down the enemy castle's flow field; ties between equally good tiles split by the unit's lane. */
/** Where a troop waits for the wave: a rank on the enemy's side of its own barracks, each troop at
 *  its own place along it by lane. It used to wait on the spot it was trained, a few hundred units
 *  from the door, which stood a squad inside the building's own picture without moving for as much
 *  as a whole wave (15 s) -- the one place on the board where nothing ever happened was the place
 *  troops came from. The rank is still on the barracks' own tile, so the wave sets off from where
 *  it always did and nothing about the march changes.
 *  MUSTER_OUT clears the building's picture (about 1.3 tiles wide, so ~650 to its side) and stays
 *  inside the tile (866 to an edge, 1000 to a corner); MUSTER_SPAN keeps the rank inside it too.
 *  MUSTER_NEAR is the dead zone that keeps `separate` and the walk from trading a troop back and
 *  forth across its spot once it is standing there. */
const MUSTER_OUT = 700, MUSTER_SPAN = 450, MUSTER_NEAR = 150;

function unitMuster(e: Engine, u: Unit, speed: number): void {
  const bar = e.live(u.bar);
  // its barracks is gone: it waits where it stands rather than marching off before the wave
  if (!bar) return;
  const tx = bar.x + muldiv(u.lane - 500, MUSTER_SPAN, 500);
  const ty = bar.y + (u.team === TEAM_BLUE ? -MUSTER_OUT : MUSTER_OUT);
  if (dist(tx - u.x, ty - u.y) <= MUSTER_NEAR) return;
  walk(e, u, tx, ty, speed);
}

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
      // A local minimum of the flow field, or a tile ringed by rocks: there is no better
      // neighbour to pick. This used to set step = -1 and return, which moves nothing and leaves
      // the same situation next tick, so the troop stood still for the rest of the match. Head
      // straight at the enemy castle instead and let `walk` slide it off the dead end.
      u.step = -1;
      const goal = e.tiles[baseTile(enemyOf(u.team))];
      walk(e, u, goal.x, goal.y, speed);
      return;
    }
    u.step = best[Math.trunc((u.lane * best.length) / 1000) % best.length];
  }
  const s = e.tiles[u.step];
  const off = muldiv(u.lane - 500, 6, 10); // aim a bit off-centre per unit so groups spread
  if (walk(e, u, s.x + off, s.y, speed)) u.step = -1;
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
