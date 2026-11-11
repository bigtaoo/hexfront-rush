// Fixed-point integer math for the deterministic simulation (after Holy Kicker's engine/math/fixed).
// The sim never stores a float: positions are world units x FP, times are ticks of 1/TICK_RATE s.
// Only IEEE basic arithmetic on safe integers is used, which every JS engine computes identically,
// so two machines fed the same commands stay bit-identical. fromFp is for the renderer only.

/** Sim ticks per second; equals the relay's frame rate (frame == tick). */
export const TICK_RATE = 30;
/** Fixed-point scale: 1 world unit = 1000. */
export const FP = 1000;

/** Load-time conversion of a design constant (world units) to fixed point. */
export const toFp = (u: number): number => Math.round(u * FP);
/** Load-time conversion of a per-second rate (world units/s) to fixed point per tick. */
export const perTick = (u: number): number => Math.round((u * FP) / TICK_RATE);
/** Load-time conversion of seconds to whole ticks. */
export const ticks = (s: number): number => Math.round(s * TICK_RATE);
/** a*b/d truncated toward zero. Callers keep |a*b| below 2^53. */
export const muldiv = (a: number, b: number, d: number): number => Math.trunc((a * b) / d);

/** Exact integer square root: floor(sqrt(n)). Math.sqrt only seeds it; the loops correct
 *  any last-bit difference, so the result is the same everywhere. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

export const dist2 = (dx: number, dy: number): number => dx * dx + dy * dy;
export const dist = (dx: number, dy: number): number => isqrt(dx * dx + dy * dy);
/** Render-side only: fixed point back to world units. */
export const fromFp = (v: number): number => v / FP;
