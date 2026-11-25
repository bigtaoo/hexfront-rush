// The ground litter is the one layer that touches every tile on the board, so what it must never
// do matters more than what it looks like: it may not land where something stands, it may not
// differ between two clients of one online match, and it may not creep up to a density where the
// player starts reading it as terrain. Those three are what these pin. See DECISIONS.md D90, D92.

import { describe, expect, it } from 'vitest';
import { Engine } from '../sim/engine';
import { NTILES } from '../sim/hex';
import { TEAM_BLUE } from '../sim/rules';
import { installCanvas } from '../test/canvasFakes';
import { Camera } from './camera';
import { DecorLayer, density } from './decor';

installCanvas();

const engine = (seed: number): Engine => new Engine({ seed, aiBlue: false, aiRed: false });
const cam = (eng: Engine): Camera => {
  const c = new Camera();
  c.resize(390, 844);
  c.setView(eng, TEAM_BLUE);
  return c;
};
/** A seed whose theme carries litter. Every theme does again (D101), but the helper stays: a theme
 *  turned off here once already and the density tests below must measure a board, not nothing. */
const littered = (want: number): number[] => {
  const out: number[] = [];
  for (let seed = 1; out.length < want && seed < 400; seed++) {
    if (density(engine(seed).themeKey) > 0) out.push(seed);
  }
  return out;
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
    const [s1, s2] = littered(2) as [number, number];
    const a = new DecorLayer(), b = new DecorLayer();
    const ea = engine(s1), eb = engine(s1);
    a.build(ea, cam(ea));
    b.build(eb, cam(eb));
    expect(placed(a, ea)).toEqual(placed(b, eb));
    expect(placed(a, ea).length).toBeGreaterThan(0);
    // and a different seed is a different scatter, or the "scatter" is a fixed pattern
    const c = new DecorLayer(), ec = engine(s2);
    c.build(ec, cam(ec));
    expect(placed(c, ec)).not.toEqual(placed(a, ea));
  });

  it('litters the meadow boards too: every theme carries the same fifth', () => {
    // The meadow sat at zero from D97 to D101 on a misread -- the pieces disappearing into the dark
    // green was this layer's 0.62 alpha, not its density (decor.ts). A board with 270 of its 325
    // hexes empty is the thing that reading cost us, so this pins that no theme is switched off.
    for (const theme of ['meadow', 'desert', 'snow']) expect(density(theme)).toBe(density('x'));
    for (let seed = 1, seen = 0; seen < 3 && seed < 400; seed++) {
      const eng = engine(seed);
      if (eng.themeKey !== 'meadow') continue;
      seen++;
      const l = new DecorLayer();
      l.build(eng, cam(eng));
      expect(placed(l, eng).length).toBeGreaterThan(20);
    }
  });

  it('covers about a fifth of the open ground, and never reads as terrain', () => {
    for (const seed of littered(4)) {
      const eng = engine(seed);
      const l = new DecorLayer();
      l.build(eng, cam(eng));
      const open = eng.tiles.filter((t) => !t.obst && !t.bld && !t.rubble && !t.event).length;
      const n = placed(l, eng).length;
      expect(open).toBeGreaterThan(NTILES * 0.5);
      // DENSITY is 0.22 and the roll is a hash, so a board lands a little either side of it.
      // The ceiling is the one that matters: past about a third the litter stops being litter and
      // starts being a texture over the whole field, which is what D92 cut it back from.
      expect(n / open).toBeGreaterThan(0.12);
      expect(n / open).toBeLessThan(0.33);
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
