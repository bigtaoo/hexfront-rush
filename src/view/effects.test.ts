import { describe, expect, it } from 'vitest';
import { hurryOldest } from './effects';

// A big fight used to put six rising labels over the board at once -- damage, gold, "taken", a
// guard going down -- and none of them could be read. The field now carries a few at a time, and
// it is the oldest that leaves early: what just happened is always the more interesting of the two.

const list = (n: number) => Array.from({ length: n }, () => ({ rush: null as number | null }));

describe('the field\'s rising labels', () => {
  it('leaves a short list alone', () => {
    const l = list(5);
    hurryOldest(l, 5, 0.22);
    expect(l.every((e) => e.rush === null)).toBe(true);
  });

  it('hurries the oldest off, not the newest', () => {
    const l = list(8);
    hurryOldest(l, 5, 0.22);
    expect(l.map((e) => e.rush)).toEqual([0.22, 0.22, 0.22, null, null, null, null, null]);
  });

  it('does not restart a label that is already on its way out', () => {
    const l = list(7);
    hurryOldest(l, 5, 0.22);
    l[0]!.rush = 0.05;
    hurryOldest(l, 5, 0.22);
    expect(l[0]!.rush).toBe(0.05);
  });
});
