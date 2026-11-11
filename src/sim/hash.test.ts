// The determinism guard itself (hash.ts). Every desync check in the game — the golden hashes, the
// replay check, the online loopback — is this function comparing two states; and the engine throws
// here on a float, which is the one thing standing between a stray 0.5 and an online match that
// quietly goes different ways on two phones. So the guard needs a guard: if hashState ever stopped
// noticing, every test that relies on it would keep passing and say nothing.

import { describe, expect, it } from 'vitest';
import { hashState } from './hash';
import { Prng } from './prng';

describe('hashState', () => {
  it('reads the same state the same way, whatever order the keys were written in', () => {
    const a = { tick: 12, team: [{ gold: 50, tiles: 3 }, { gold: 20, tiles: 9 }], phase: 1 };
    const b = { phase: 1, team: [{ tiles: 3, gold: 50 }, { tiles: 9, gold: 20 }], tick: 12 };
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).toBe(hashState(JSON.parse(JSON.stringify(a))));
  });

  it('notices a change anywhere in the state', () => {
    const base = { tick: 12, units: [{ hp: 10, x: 1 }, { hp: 10, x: 2 }], done: false, who: 'blue' };
    const h = hashState(base);
    expect(hashState({ ...base, tick: 13 })).not.toBe(h);
    expect(hashState({ ...base, units: [{ hp: 10, x: 1 }, { hp: 9, x: 2 }] })).not.toBe(h);
    expect(hashState({ ...base, units: [{ hp: 10, x: 2 }, { hp: 10, x: 1 }] })).not.toBe(h); // order of a list counts
    expect(hashState({ ...base, done: true })).not.toBe(h);
    expect(hashState({ ...base, who: 'red' })).not.toBe(h);
    expect(hashState({ ...base, extra: 0 })).not.toBe(h);
    // and above 32 bits, where a lazy hash would stop looking
    expect(hashState({ n: 2 ** 40 })).not.toBe(hashState({ n: 2 ** 40 + 1 }));
    expect(hashState({ n: 2 ** 40 })).not.toBe(hashState({ n: 0 }));
  });

  it('throws, with the path, on anything that is not a whole number', () => {
    expect(() => hashState({ team: [{ gold: 0.5 }] })).toThrow(/\$\.team\[0\]\.gold/);
    expect(() => hashState({ x: NaN })).toThrow(/NaN/);
    expect(() => hashState({ x: Infinity })).toThrow(/hashState/);
    expect(() => hashState({ x: 2 ** 53 })).toThrow(/hashState/);
    expect(() => hashState({ f: () => 1 })).toThrow(/unsupported function/);
    // a negative zero is a whole number and hashes as zero: muldiv can hand one back
    expect(hashState({ x: -0 })).toBe(hashState({ x: 0 }));
  });

  it('walks typed arrays like lists, which is how the tiles are hashed', () => {
    const owner = new Uint8Array([1, 2, 0, 1]);
    expect(hashState({ owner })).toBe(hashState({ owner: new Uint8Array([1, 2, 0, 1]) }));
    expect(hashState({ owner })).not.toBe(hashState({ owner: new Uint8Array([1, 2, 1, 1]) }));
    expect(hashState({ owner })).not.toBe(hashState({ owner: new Uint8Array([1, 2, 0]) }));
  });

  it('tells null and undefined from a missing key, and from 0', () => {
    expect(hashState({ r: null })).toBe(hashState({ r: undefined }));
    expect(hashState({ r: null })).not.toBe(hashState({ r: 0 }));
    expect(hashState({ r: null })).not.toBe(hashState({}));
  });

  it('follows a stream by its state, so a different draw cannot hide', () => {
    // the engine hashes rng.peek() values; two matches that rolled differently must not agree
    const a = new Prng(7), b = new Prng(7);
    expect(hashState({ rng: a.peek() })).toBe(hashState({ rng: b.peek() }));
    b.int(100);
    expect(hashState({ rng: a.peek() })).not.toBe(hashState({ rng: b.peek() }));
    // and a stream object hashes by its state field alone, since that is all it has
    expect(Object.keys(a)).toEqual(['state']);
  });

  it('is a uint32', () => {
    for (const v of [{}, { a: 1 }, [1, 2, 3], 'x', 0, null]) {
      const h = hashState(v);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
