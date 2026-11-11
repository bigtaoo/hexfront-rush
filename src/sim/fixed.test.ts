// The sim stores no floats, so every number in it comes out of this file. Two of these promises
// hold up everything else: `isqrt` has to be exact (Math.sqrt only seeds it, and a last-bit
// difference between two machines would desync an online match), and `muldiv` has to treat left
// and right alike (a step of the same length in the opposite direction must be the same length,
// or the map's top/bottom mirror would stop being fair at the sub-unit level).

import { describe, expect, it } from 'vitest';
import { dist, dist2, FP, isqrt, muldiv, perTick, TICK_RATE, ticks, toFp } from './fixed';
import { hashState } from './hash';

/** The first n where the check fails, or -1. Sweeps stay one assertion: a loop of expect() calls
 *  over 200,000 numbers costs seconds and reports no better. */
const firstBad = (n: number, ok: (i: number) => boolean): number => {
  for (let i = 0; i < n; i++) if (!ok(i)) return i;
  return -1;
};

describe('the load-time conversions', () => {
  it('turn design numbers into whole fixed point and whole ticks', () => {
    expect(toFp(1)).toBe(FP);
    expect(toFp(1.45)).toBe(1450);
    expect(ticks(1)).toBe(TICK_RATE);
    expect(ticks(8 * 60)).toBe(14400);
    expect(perTick(3)).toBe(100); // 3 world units a second, 30 ticks a second
    // they round rather than truncate, and always land on an integer
    expect(toFp(0.0004)).toBe(0);
    expect(toFp(0.0006)).toBe(1);
    for (const v of [0.1, 1 / 3, 2.5, 7.77, 0.0001]) {
      for (const n of [toFp(v), ticks(v), perTick(v)]) expect(Number.isInteger(n)).toBe(true);
    }
  });
});

describe('muldiv', () => {
  it('is a*b/d truncated toward zero', () => {
    expect(muldiv(7, 3, 2)).toBe(10); // 10.5
    expect(muldiv(-7, 3, 2)).toBe(-10); // -10.5, toward zero, not down
    expect(muldiv(1, 1, 3)).toBe(0);
  });

  it('can hand back a negative zero, which nothing downstream can tell from zero', () => {
    // Math.trunc(-0.33) is -0; it survives in a local but never in the state, because every use
    // adds it to a coordinate (x + -0 is x) and the hash reads both as the same word
    expect(Object.is(muldiv(-1, 1, 3), -0)).toBe(true);
    expect(hashState({ x: muldiv(-1, 1, 3) })).toBe(hashState({ x: 0 }));
    expect(1234 + muldiv(-1, 1, 3)).toBe(1234);
  });

  it('treats the two directions alike', () => {
    // a troop walking left covers exactly what a troop walking right covers (combat.ts moveToward
    // splits a step into muldiv(dx, step, d) and muldiv(dy, step, d)); if this were floor instead
    // of trunc, every leftward step would be a thousandth shorter and the mirror would tilt
    for (let a = -5000; a <= 5000; a += 7) {
      for (const b of [3, 17, 1000]) {
        for (const d of [7, 31, 1000]) expect(muldiv(a, b, d)).toBe(-muldiv(-a, b, d));
      }
    }
  });

  it('is exact over the magnitudes the sim uses', () => {
    // positions run to about 23,000 fixed point and speeds to 1,000: well inside 2^53
    for (const a of [22518, -22518, 1, 999999]) {
      for (const b of [1000, 866, 1]) expect(muldiv(a, b, 1000)).toBe(Math.trunc((a * b) / 1000));
    }
  });
});

describe('isqrt', () => {
  it('is exactly floor(sqrt(n))', () => {
    expect(firstBad(200000, (n) => {
      const r = isqrt(n);
      return r * r <= n && (r + 1) * (r + 1) > n;
    })).toBe(-1);
  });

  it('stays exact where Math.sqrt alone would not', () => {
    // the two correction loops are the whole point: they take the float seed back to the integer
    // answer, so every machine agrees
    for (const n of [2 ** 40, 2 ** 46, 2 ** 50, 2 ** 52, 2 ** 52 + 1, Number.MAX_SAFE_INTEGER]) {
      const r = isqrt(n);
      expect(r * r).toBeLessThanOrEqual(n);
      expect((r + 1) * (r + 1)).toBeGreaterThan(n);
    }
    // and on either side of a perfect square
    for (const b of [1000, 46341, 94906265]) {
      expect(isqrt(b * b)).toBe(b);
      expect(isqrt(b * b - 1)).toBe(b - 1);
      expect(isqrt(b * b + 1)).toBe(b);
    }
  });

  it('answers 0 for nothing and for less than nothing', () => {
    expect(isqrt(0)).toBe(0);
    expect(isqrt(-1)).toBe(0);
    expect(isqrt(-1000000)).toBe(0);
  });
});

describe('dist', () => {
  it('is the exact integer length, and dist2 its square', () => {
    expect(dist2(3, 4)).toBe(25);
    expect(dist(3, 4)).toBe(5);
    expect(dist(-3, -4)).toBe(5);
    expect(dist(0, 0)).toBe(0);
    for (const [dx, dy] of [[1, 1], [866, 1500], [-20000, 17000], [7, 0]]) {
      expect(dist(dx!, dy!)).toBe(isqrt(dist2(dx!, dy!)));
      expect(Number.isInteger(dist(dx!, dy!))).toBe(true);
    }
  });

  it('does not care which way round it is measured', () => {
    for (let dx = -300; dx <= 300; dx += 13) {
      for (let dy = -300; dy <= 300; dy += 17) {
        expect(dist(dx, dy)).toBe(dist(-dx, -dy));
        expect(dist(dx, dy)).toBe(dist(dy, dx));
      }
    }
  });
});
