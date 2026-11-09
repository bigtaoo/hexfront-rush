// The castle guard: the player has no hero, so each castle keeps one. It wanders the ground
// around its castle at random, mostly in front and to the sides, seldom behind (where nothing
// comes from); it turns on any enemy troop that comes near the castle, never stepping further
// than GUARD.leash from it, and the tiles it walks become its team's, as a troop's do.

import { claimTile, fire, moveToward, nearestEnemyMobile } from './combat';
import type { Engine } from './engine';
import { dist, dist2, TICK_RATE, ticks } from './fixed';
import { hexDist, idx } from './hex';
import { BASE_POS, baseTile, type Tile } from './map';
import { GUARD, PROJ, TEAM_BLUE } from './rules';
import type { Guard } from './types';

/** Where a castle's guard may stand, with a weight for each, and where it starts. */
export interface GuardSpots {
  tiles: number[];
  weights: number[];
  start: number;
}

/** The passable tiles within GUARD.wanderRadius of `team`'s castle (not the castle's own), each
 *  weighted by where it lies: ahead of the castle (toward the enemy), level with it, or behind. */
export function guardSpots(tiles: readonly Tile[], team: number): GuardSpots {
  const bp = BASE_POS[team]!;
  const fwd = team === TEAM_BLUE ? -1 : 1;
  const out: GuardSpots = { tiles: [], weights: [], start: baseTile(team) };
  for (const t of tiles) {
    const d = hexDist(t.c, t.r, bp.c, bp.r);
    if (t.obst || d < 1 || d > GUARD.wanderRadius) continue;
    const ahead = (t.r - bp.r) * fwd;
    out.tiles.push(t.i);
    out.weights.push(ahead > 0 ? GUARD.wantFront : ahead === 0 ? GUARD.wantSide : GUARD.wantBack);
  }
  // it walks out to the tile straight ahead first (the same column, two rows on)
  const front = idx(bp.c, bp.r + 2 * fwd);
  if (out.tiles.includes(front)) out.start = front;
  else if (out.tiles.length) out.start = out.tiles[0]!;
  return out;
}

export function updateGuard(e: Engine, g: Guard): void {
  const spots = e.spots[g.team]!;
  if (g.dead) {
    if (--g.respT <= 0) {
      const st = e.tiles[baseTile(g.team)];
      g.x = g.px = st.x;
      g.y = g.py = st.y;
      g.hp = g.maxhp;
      g.dead = 0;
      g.cd = ticks(0.5);
      g.wp = spots.start;
      g.waitT = 0;
      e.emit('guardBack', { team: g.team, x: g.x, y: g.y });
    }
    return;
  }
  const home = e.tiles[baseTile(g.team)];
  if (g.hp < g.maxhp && e.tick - g.lastHit > GUARD.idleAfter) {
    g.regen += GUARD.regen;
    g.hp = Math.min(g.maxhp, g.hp + Math.trunc(g.regen / TICK_RATE));
    g.regen %= TICK_RATE;
  } else g.regen = 0;
  if (g.cd > 0) g.cd--;
  g.moving = 0;
  act(e, g, home, spots);
  const t = e.tileAt(g.x, g.y);
  if (t) claimTile(e, g.team, t);
}

function act(e: Engine, g: Guard, home: Tile, spots: GuardSpots): void {
  // the intruder nearest the castle, among those the guard can reach from inside its leash
  const target = nearestEnemyMobile(e, g.team, home.x, home.y, GUARD.leash + GUARD.range);
  g.aim = target ? target.id : 0;
  if (target) {
    const d = dist(target.x - g.x, target.y - g.y);
    if (d <= GUARD.range) {
      if (g.cd <= 0) {
        g.cd = GUARD.rate;
        fire(e, g, target, GUARD.dmg, 'bolt', PROJ.bolt, 0, 1);
        e.emit('shoot', { team: g.team, guard: 1 });
      }
      if (Math.abs(target.x - g.x) > 50) g.face = target.x > g.x ? 1 : -1;
      return;
    }
    guardStep(e, g, home, target.x, target.y);
    return;
  }
  if (!spots.tiles.length) return;
  if (g.waitT > 0) {
    g.waitT--;
    return;
  }
  const w = e.tiles[g.wp];
  const step = guardStep(e, g, home, w.x, w.y);
  if (step !== MOVING) {
    // there (or it cannot get there): pick the next spot, and stand a moment first if it arrived
    g.wp = pickSpot(e, g, home, spots);
    if (step === ARRIVED) g.waitT = GUARD.pauseMin + e.rngGuard(g.team).int(GUARD.pauseSpan);
  }
}

const MOVING = 0, ARRIVED = 1, BLOCKED = 2;

/** One guard step toward (tx, ty), held inside the leash and off the rocks. */
function guardStep(e: Engine, g: Guard, home: Tile, tx: number, ty: number): number {
  const ox = g.x, oy = g.y;
  const arrived = moveToward(g, tx, ty, GUARD.speed);
  const t = e.tileAt(g.x, g.y);
  if (!t || t.obst || dist2(g.x - home.x, g.y - home.y) > GUARD.leash * GUARD.leash) {
    g.x = ox;
    g.y = oy;
    return BLOCKED;
  }
  g.moving = 1;
  if (Math.abs(tx - ox) > 50) g.face = tx > ox ? 1 : -1;
  return arrived ? ARRIVED : MOVING;
}

/** A random spot other than the current one, by weight, whose straight path does not cross the
 *  castle (it walks around, not through). Any other spot when none qualifies (it stands on the
 *  castle after coming back). */
export function pickSpot(e: Engine, g: Guard, home: Tile, spots: GuardSpots): number {
  const rng = e.rngGuard(g.team);
  const w: number[] = [];
  let total = 0;
  for (let pass = 0; pass < 2 && !total; pass++) {
    w.length = 0;
    for (let k = 0; k < spots.tiles.length; k++) {
      const t = e.tiles[spots.tiles[k]!];
      const ok = t.i !== g.wp && (pass === 1 || !crossesCastle(g.x, g.y, t.x, t.y, home));
      w.push(ok ? spots.weights[k]! : 0);
      if (ok) total += spots.weights[k]!;
    }
  }
  if (!total) return g.wp;
  let r = rng.int(total);
  for (let k = 0; k < w.length; k++) {
    r -= w[k]!;
    if (r < 0) return spots.tiles[k]!;
  }
  return g.wp;
}

/** Whether the segment (ax, ay)-(bx, by) passes within GUARD.castleClear of the castle's centre.
 *  In 1/16ths of the fixed-point unit, so every product stays an exact integer. */
export function crossesCastle(ax: number, ay: number, bx: number, by: number, home: Tile): boolean {
  const abx = (bx - ax) >> 4, aby = (by - ay) >> 4;
  const acx = (home.x - ax) >> 4, acy = (home.y - ay) >> 4;
  const len2 = abx * abx + aby * aby;
  if (!len2) return false;
  const dot = acx * abx + acy * aby;
  if (dot <= 0 || dot >= len2) return false;
  const cross = abx * acy - aby * acx;
  const r = GUARD.castleClear >> 4;
  return cross * cross < r * r * len2;
}
