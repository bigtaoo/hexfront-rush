'use strict';
// Fixed-point integer math for the deterministic simulation (after Holy Kicker's engine/math/fixed).
// The sim never stores a float: positions are world units x FP, times are ticks of 1/TICK_RATE s.
// Only IEEE basic arithmetic on safe integers is used, which every JS engine computes identically,
// so two machines fed the same commands stay bit-identical. fromFp is for the renderer only.

const TICK_RATE = 30;   // sim ticks per second; equals the relay's frame rate (frame == tick)
const FP = 1000;        // fixed-point scale: 1 world unit = 1000

/** Load-time conversion of a design constant (world units) to fixed point. */
function toFp(u) { return Math.round(u * FP); }
/** Load-time conversion of a per-second rate (world units/s) to fixed point per tick. */
function perTick(u) { return Math.round(u * FP / TICK_RATE); }
/** Load-time conversion of seconds to whole ticks. */
function ticks(s) { return Math.round(s * TICK_RATE); }
/** a*b/d truncated toward zero. Callers keep |a*b| below 2^53. */
function muldiv(a, b, d) { return Math.trunc(a * b / d); }
/** Exact integer square root: floor(sqrt(n)). Math.sqrt only seeds it; the loops correct
 *  any last-bit difference, so the result is the same everywhere. */
function isqrt(n) {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}
function dist2(dx, dy) { return dx * dx + dy * dy; }
function dist(dx, dy) { return isqrt(dx * dx + dy * dy); }
function clampI(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
/** Render-side only: fixed point back to world units. */
function fromFp(v) { return v / FP; }
