// The shape of a birth: the four beats and the arc between them. The drawing needs a canvas and a
// renderer, but the timing does not, so this is where the timing is pinned down.

import { describe, expect, it } from 'vitest';
import { BIRTH, BIRTH_MAX, BIRTH_TOTAL, birthAt } from './birth';

describe('birthAt', () => {
  it('runs wait -> fly -> settle -> done, in that order', () => {
    expect(birthAt(0).phase).toBe('fly');
    expect(birthAt(BIRTH.fly - 0.001).phase).toBe('fly');
    expect(birthAt(BIRTH.fly).phase).toBe('settle');
    expect(birthAt(BIRTH_TOTAL - 0.001).phase).toBe('settle');
    expect(birthAt(BIRTH_TOTAL).phase).toBe('done');
  });

  it('waits out a delay before it throws anything', () => {
    const d = BIRTH.sky;
    expect(birthAt(0, d).phase).toBe('wait');
    expect(birthAt(d - 0.001, d).phase).toBe('wait');
    expect(birthAt(d, d).phase).toBe('fly');
    expect(birthAt(d + BIRTH_TOTAL, d).phase).toBe('done');
    // the wait fills from nothing to full, so the ground light can grow with it
    expect(birthAt(0, d).t).toBeCloseTo(0, 5);
    expect(birthAt(d * 0.5, d).t).toBeCloseTo(0.5, 5);
  });

  it('never leaves a piece hanging: the arc is 0 at both ends and highest in the middle', () => {
    expect(birthAt(0).arc).toBeCloseTo(0, 6);
    expect(birthAt(BIRTH.fly - 1e-9).arc).toBeCloseTo(0, 5);
    expect(birthAt(BIRTH.fly / 2).arc).toBeCloseTo(1, 6);
    for (let a = 0; a < BIRTH.fly; a += 0.01) {
      const s = birthAt(a);
      expect(s.arc).toBeGreaterThanOrEqual(0);
      expect(s.arc).toBeLessThanOrEqual(1);
    }
    // and past the flight there is no height left at all
    expect(birthAt(BIRTH.fly + 0.05).arc).toBe(0);
    expect(birthAt(99).arc).toBe(0);
  });

  it('is over inside BIRTH_MAX, whatever the delay', () => {
    // the sprite layer only asks birth.ts about troops younger than this; a birth that outlived it
    // would have its light cut off mid-air
    const worst = BIRTH.sky + 2 * 0.08;
    expect(birthAt(BIRTH_MAX, worst).phase).toBe('done');
    expect(BIRTH_MAX).toBeGreaterThan(worst + BIRTH_TOTAL);
  });

  it('hands the piece an age counted from its landing, not from its birth', () => {
    // what sprites.ts passes to unitView: below zero while the light still carries it
    const age = (a: number, d = 0): number => a - d - BIRTH.fly;
    expect(age(0)).toBeLessThan(0);
    expect(age(BIRTH.fly - 0.01)).toBeLessThan(0);
    expect(age(BIRTH.fly)).toBeCloseTo(0, 6);
    expect(age(BIRTH_TOTAL)).toBeCloseTo(BIRTH.settle, 6);
  });
});
