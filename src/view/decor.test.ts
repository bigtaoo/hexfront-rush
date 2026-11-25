// The ground litter is the one layer that touches every tile on the board, so what it must never
// do matters more than what it looks like: it may not land where something stands, it may not
// differ between two clients of one online match, and it may not creep up to a density where the
// player starts reading it as terrain. Those three are what these pin. See DECISIONS.md D90.

import { describe, expect, it } from 'vitest';
import { Engine } from '../sim/engine';
import { NTILES } from '../sim/hex';
import { TEAM_BLUE } from '../sim/rules';
import { installCanvas } from '../test/canvasFakes';
import { Camera } from './camera';
import { DecorLayer } from './decor';

installCanvas();

const engine = (seed: number): Engine => new Engine({ seed, aiBlue: false, aiRed: false });
const cam = (eng: Engine): Camera => {
  const c = new Camera();
  c.resize(390, 844);
  c.setView(eng, TEAM_BLUE);
  return c;
};
/** The tiles a piece was placed on, by index. */
const placed = (l: DecorLayer, eng: Engine): number[] =>
  eng.tiles.filter((t) => l.pieceOn(t.i)).map((t) => t.i);

describe('ground decoration', () => {
  it('never lands on a tile something stands on', () => {
    for (const seed of [1, 7, 23, 404]) {
      const eng = engine(seed);
      const l = new DecorLayer();
      l.build(eng, cam(eng));
      for (const t of eng.tiles) {
        if (t.obst || t.bld || t.rubble || t.event) expect(l.pieceOn(t.i)).toBe(false);
      }
    }
  });

  it('is the same board for both clients: it comes out of the map seed alone', () => {
    const a = new DecorLayer(), b = new DecorLayer();
    const ea = engine(31), eb = engine(31);
    a.build(ea, cam(ea));
    b.build(eb, cam(eb));
    expect(placed(a, ea)).toEqual(placed(b, eb));
    // and a different seed is a different scatter, or the "scatter" is a fixed pattern
    const c = new DecorLayer(), ec = engine(32);
    c.build(ec, cam(ec));
    expect(placed(c, ec)).not.toEqual(placed(a, ea));
  });

  it('covers about half the open ground, and never reads as terrain', () => {
    for (const seed of [1, 7, 23, 404]) {
      const eng = engine(seed);
      const l = new DecorLayer();
      l.build(eng, cam(eng));
      const open = eng.tiles.filter((t) => !t.obst && !t.bld && !t.rubble && !t.event).length;
      const n = placed(l, eng).length;
      expect(open).toBeGreaterThan(NTILES * 0.5);
      // DENSITY is 0.55 and the roll is a hash, so a board lands a little either side of it.
      // The ceiling is the one that matters: past about two thirds the litter stops being litter.
      expect(n / open).toBeGreaterThan(0.4);
      expect(n / open).toBeLessThan(0.65);
    }
  });

  it('hides a tile\'s piece once something is built on it', () => {
    const eng = engine(7);
    const l = new DecorLayer();
    l.build(eng, cam(eng));
    const t = eng.tiles.find((x) => l.pieceOn(x.i))!;
    t.bld = 1;
    l.update(eng);
    expect(l.shown(t.i)).toBe(false);
    t.bld = 0;
    l.update(eng);
    expect(l.shown(t.i)).toBe(true);
  });
});
