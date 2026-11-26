import { describe, expect, it } from 'vitest';

import { PAIR } from './obstacleView';

/** The companion trees' places have to stay inside their own cell. D127 pushed them from 0.30 of a
 *  radius back to 0.62 to buy the canopy that CROWN_K used to buy with size, and "how far back can
 *  a foot go" is the whole of what stops that going further: a foot outside the hex stands on the
 *  grid line, or on the neighbouring tile, which is a prop in the wrong cell rather than a wood.
 *
 *  The cell is a pointy-top hex of radius 1 (viewConst: one hex radius = 1 view unit), so it
 *  reaches 1.0 up and down, 0.866 across at the waist, and tapers to nothing over the top half. */
const halfWidthAt = (y: number): number => (Math.abs(y) <= 0.5 ? 0.866 : 0.866 * (1 - Math.abs(y)) / 0.5);

describe('grove companions', () => {
  it('stand with both feet inside their own hex', () => {
    for (const [dx, dy] of PAIR) {
      expect(Math.abs(dy), `${dx},${dy} depth`).toBeLessThan(1);
      expect(Math.abs(dx), `${dx},${dy} across`).toBeLessThanOrEqual(halfWidthAt(dy));
    }
  });

  it('stand behind the piece the sim put there, and smaller than it', () => {
    // in front reads as a second object in the way; same size reads as two trunks, not depth
    for (const [dx, dy, k] of PAIR) {
      expect(dy, `${dx},${dy} is behind`).toBeLessThan(0);
      expect(k, `${dx},${dy} scale`).toBeLessThan(1);
      expect(k, `${dx},${dy} scale`).toBeGreaterThan(0.6);
    }
  });

  it('offers both sides, so a clump is never all on one', () => {
    expect(PAIR.filter(([dx]) => dx < 0).length).toBeGreaterThanOrEqual(2);
    expect(PAIR.filter(([dx]) => dx > 0).length).toBeGreaterThanOrEqual(2);
    // and more places than the three a tile can draw, so tiles do not all clump alike
    expect(PAIR.length).toBeGreaterThan(3);
  });
});
