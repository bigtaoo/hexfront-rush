// Seedable integer PRNG streams (after Holy Kicker's engine/math/prng). An LCG step whitened by
// a murmur3 finaliser. The whole state is one uint32, so it hashes and snapshots as a number.
// Each concern draws from its own stream: a cosmetic change in one system can't shift another's
// rolls, and a replay stays valid as long as each stream's own draws are unchanged.

export function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Prng {
  state: number;
  constructor(seed: number) {
    this.state = mix32(seed >>> 0) || 1;
  }
  /** Rebuild a stream from a raw state taken with peek() (snapshots). */
  static resume(raw: number): Prng {
    const p = new Prng(0);
    p.state = raw >>> 0;
    return p;
  }
  peek(): number {
    return this.state >>> 0;
  }
  /** Integer in [0, max). */
  int(max: number): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return mix32(this.state) % max;
  }
  /** Integer in [lo, hi], inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }
  /** True with probability num/den. */
  chance(num: number, den: number): boolean {
    return this.int(den) < num;
  }
}

/** Derive an independent stream seed from the match seed and a stream tag. */
export const streamSeed = (seed: number, tag: number): number => mix32((seed >>> 0) ^ Math.imul(tag, 0x9e3779b1));
