// The back views: a troop is drawn once, three-quarter from the front, and the board mirrors that
// one picture for left and right - so a piece marching up the board used to be drawn walking
// towards us. tools/art3d/pose.py renders a second set at yaw 180 - yaw (the still `_b0` and the
// walk `_u0.._u5`), and unitView picks between the two off the piece's movement in depth.

import { describe, expect, it } from 'vitest';
import atlasJson from '../assets/atlas.json';
import { awayNext, BACK_FRAMES, WALK_FRAMES } from './unitView';

const NAMES = Object.keys(atlasJson.frames);
/** Every troop picture the atlas carries a walk cycle for, `<troop>_<side>`. */
const WALKERS = NAMES.filter((n) => n.endsWith('_w0')).map((n) => n.slice(0, -3));
/** The two pieces that deliberately carry NO back set. Seven frames per troop per team is 126
 *  more pictures, and the colossus and the drake are the two widest in the cast - with theirs in
 *  the sheet the atlas measures past 4096 px on both sides, which is the hard texture limit. They
 *  are also the two that can least afford to be mirrored wrongly and the least noticed for it:
 *  the drake is read by its wings and the colossus by its cart. art.ts's unitBack() asks the
 *  ATLAS whether a troop has the frames, so leaving them out needs no code - those two simply
 *  never turn round. This test exists so that stays a decision and not a silent gap. */
const NO_BACK = ['colossus', 'drake'];
const typeOf = (base: string) => base.slice(0, base.lastIndexOf('_'));

describe('the back set in the atlas', () => {
  it('covers every troop that walks, both teams', () => {
    expect(WALKERS.length).toBeGreaterThan(10);
    for (const base of WALKERS.filter((b) => !NO_BACK.includes(typeOf(b)))) {
      expect(NAMES, `${base} still, seen from behind`).toContain(`${base}_b0`);
      for (let i = 0; i < BACK_FRAMES; i++) {
        expect(NAMES, `${base} walking away, frame ${i}`).toContain(`${base}_u${i}`);
      }
    }
  });

  it('leaves the two widest pieces out of it, wholly', () => {
    const left = WALKERS.filter((b) => NO_BACK.includes(typeOf(b)));
    expect(left.length).toBe(NO_BACK.length * 2);
    for (const base of left) {
      expect(NAMES, `${base} seen from behind`).not.toContain(`${base}_b0`);
      expect(NAMES, `${base} walking away`).not.toContain(`${base}_u0`);
    }
  });

  it('is as long as the walk it stands in for, and no longer', () => {
    expect(BACK_FRAMES).toBe(WALK_FRAMES);
    for (const base of WALKERS) expect(NAMES).not.toContain(`${base}_u${BACK_FRAMES}`);
  });
});

describe('awayNext', () => {
  it('turns a piece round only once it is clearly walking up the board', () => {
    expect(awayNext(false, -0.866)).toBe(true);     // a hex diagonal, up-screen
    expect(awayNext(true, 0.866)).toBe(false);      // the same diagonal, towards us
    expect(awayNext(false, 0)).toBe(false);         // it started facing us and has not set off
  });

  it('holds what it had while it is not walking in depth, standing included', () => {
    expect(awayNext(true, 0)).toBe(true);           // a pause on the way up is not a turn round
    expect(awayNext(true, -0.35)).toBe(true);
    expect(awayNext(false, -0.35)).toBe(false);
    expect(awayNext(true, 0.2)).toBe(true);
  });
});
