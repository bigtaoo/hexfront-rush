'use strict';
// Render-only local prediction for the own hero in online play (after Holy Kicker's
// LocalPredictor). Lockstep means an input shows up in the sim only once the relay has
// confirmed its frame, ~100-250 ms later. Without help the hero would start walking that late.
//
// Each render frame we dead-reckon the player's current intent (held keys, or the tile they
// tapped) and push that frame's displacement onto a trail. The drawn position is the confirmed,
// interpolated sim position plus every trail entry younger than the measured input delay: the
// movement the sim has not applied yet. Once a frame's command lands in the sim the entry has
// aged out, so the lead never double-counts. Errors (an obstacle, a respawn, a stun) are eased
// out, or snapped when large. Nothing here touches the sim: it never sees any of this.

class Predictor {
  constructor() { this.reset(); }
  reset() { this.trail = []; this.shown = null; this.last = 0; this.goto = null; }

  /** The player tapped a tile: walk there in a straight line (world fixed point). */
  aimAt(x, y) { this.goto = { x, y }; }
  /** Keys pressed or released: a held key overrides any tap target. */
  keys(kx, ky) { if (kx || ky) this.goto = null; }

  /** World position (fixed-point units, as floats) to draw the own hero at, or null to use the sim's. */
  update(eng, team, alpha, nowMs, delayMs, kx, ky) {
    const h = eng.heroes[team];
    if (!h || h.dead || eng.phase !== PHASE_PLAY) { this.reset(); this.last = nowMs; return null; }
    const dtMs = this.last ? Math.min(100, Math.max(0, nowMs - this.last)) : 0;
    this.last = nowMs;
    const bx = h.px + (h.x - h.px) * alpha, by = h.py + (h.y - h.py) * alpha;
    let lx = 0, ly = 0;
    for (const e of this.trail) { lx += e.dx; ly += e.dy; }

    // this frame's intended displacement, in world units
    const perMs = HERO.speed * TICK_RATE / 1000;
    let dx = 0, dy = 0;
    if (kx || ky) {
      const s = perMs * dtMs * (kx && ky ? 0.7071 : 1);
      dx = kx * s; dy = ky * s;
      // slide along obstacles like the sim's tryStep does
      const ok = (x, y) => { const t = eng.tileAt(Math.round(x), Math.round(y)); return t && !t.obst; };
      const px = bx + lx, py = by + ly;
      if (!ok(px + dx, py + dy)) { if (ok(px + dx, py)) dy = 0; else if (ok(px, py + dy)) dx = 0; else dx = dy = 0; }
    } else if (this.goto) {
      const px = bx + lx, py = by + ly;
      const gx = this.goto.x - px, gy = this.goto.y - py;
      const d = Math.sqrt(gx * gx + gy * gy), s = perMs * dtMs;
      if (d <= s || d < 1) { dx = gx; dy = gy; this.goto = null; }
      else { dx = gx / d * s; dy = gy / d * s; }
    }
    if (dx || dy) this.trail.push({ t: nowMs, dx, dy });
    const keep = Math.max(30, delayMs);
    while (this.trail.length && nowMs - this.trail[0].t > keep) this.trail.shift();

    lx = 0; ly = 0;
    for (const e of this.trail) { lx += e.dx; ly += e.dy; }
    const tx = bx + lx, ty = by + ly;
    if (!this.shown) this.shown = { x: tx, y: ty };
    else {
      // carry this frame's own motion, then ease the remaining error out (~60 ms); snap if far off
      this.shown.x += dx; this.shown.y += dy;
      const ex = tx - this.shown.x, ey = ty - this.shown.y;
      if (ex * ex + ey * ey > 2500 * 2500) { this.shown.x = tx; this.shown.y = ty; }
      else {
        const k = 1 - Math.exp(-dtMs / 60);
        this.shown.x += ex * k; this.shown.y += ey * k;
      }
    }
    return this.shown;
  }
}
