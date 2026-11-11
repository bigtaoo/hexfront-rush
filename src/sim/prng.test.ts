// Every roll in the match comes from here, and two things about it are load-bearing. The state is
// one uint32 integer, because snapshots and the desync hash carry it as a plain number; and an
// empty range draws nothing, because the design tables feed this directly (a skill's `noise`, a
// guard's pause, a list's length) and a table that says "none" has to mean none rather than NaN.

import { describe, expect, it } from 'vitest';
import { mix32, Prng, streamSeed } from './prng';

const draws = (p: Prng, n = 8): number[] => Array.from({ length: n }, () => p.int(1000));

describe('mix32', () => {
  it('returns a uint32 and scatters neighbouring inputs', () => {
    for (const x of [0, 1, -1, 12345, 0xffffffff, 2 ** 31]) {
      const h = mix32(x);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
    expect(mix32(0)).toBe(0); // which is why the constructor falls back to 1
    expect(new Prng(0).peek()).toBe(1);
    const near = new Set([1, 2, 3, 4, 5].map(mix32));
    expect(near.size).toBe(5);
  });
});

describe('a stream', () => {
  it('replays exactly from its seed', () => {
    expect(draws(new Prng(777))).toEqual(draws(new Prng(777)));
    expect(draws(new Prng(777))).not.toEqual(draws(new Prng(778)));
  });

  it('keeps its whole state in one uint32, every step of the way', () => {
    const p = new Prng(99);
    for (let i = 0; i < 2000; i++) {
      p.int(37);
      const s = p.peek();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('picks up again from a state taken with peek', () => {
    // a snapshot stores peek(); resuming has to give the identical rest of the match
    const live = new Prng(2024);
    draws(live, 50);
    const saved = live.peek();
    const rest = draws(live, 20);
    expect(draws(Prng.resume(saved), 20)).toEqual(rest);
  });
});

describe('int', () => {
  it('stays inside [0, max)', () => {
    const p = new Prng(5);
    for (const max of [1, 2, 6, 100, 1000000]) {
      for (let i = 0; i < 500; i++) {
        const v = p.int(max);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(max);
      }
    }
  });

  it('answers 0 for an empty range, and spends no randomness doing it', () => {
    const p = new Prng(42);
    const before = p.peek();
    for (const max of [0, -1, -1000]) expect(p.int(max)).toBe(0);
    expect(p.peek()).toBe(before);
    // so a design row that says "no noise" leaves the sequence exactly as a missing call would
    const a = new Prng(42);
    a.int(0);
    expect(draws(a)).toEqual(draws(new Prng(42)));
  });

  it('is even-handed across a small range', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    const p = new Prng(12345);
    const n = 600000;
    for (let i = 0; i < n; i++) counts[p.int(6)]!++;
    for (const c of counts) expect(Math.abs(c - n / 6)).toBeLessThan(n / 6 * 0.02);
  });
});

describe('range and chance', () => {
  it('range includes both ends', () => {
    const p = new Prng(8);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(p.range(-2, 2));
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
    expect(new Prng(1).range(5, 5)).toBe(5);
    expect(new Prng(1).range(5, 4)).toBe(5); // an empty span is its low end, not NaN
  });

  it('chance is never at 0 and always at the denominator', () => {
    const p = new Prng(3);
    for (let i = 0; i < 500; i++) {
      expect(p.chance(0, 100)).toBe(false);
      expect(p.chance(100, 100)).toBe(true);
    }
    let hits = 0;
    for (let i = 0; i < 100000; i++) if (p.chance(1, 4)) hits++;
    expect(Math.abs(hits - 25000)).toBeLessThan(1000);
  });
});

describe('streamSeed', () => {
  it('gives each concern its own sequence', () => {
    // a cosmetic roll in one system must not shift another's, or old replays would stop playing
    const seeds = new Set<number>();
    const seqs = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      for (let tag = 0; tag < 20; tag++) {
        const s = streamSeed(seed, tag);
        seeds.add(s);
        seqs.add(draws(new Prng(s), 4).join(','));
      }
    }
    expect(seeds.size).toBe(4000);
    expect(seqs.size).toBe(4000);
  });
});
