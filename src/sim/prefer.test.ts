// Targeting preference: a troop hunts its preferred prey across a wider radius before it settles
// for whatever is nearest. This is the only conditional mechanic in the unit table — every stat
// axis is monotone, so stats alone can only ever produce a total order, never a counter cycle.

import { afterEach, describe, expect, it } from 'vitest';
import { Engine } from './engine';
import { nearestPrey } from './combat';
import { updateUnits } from './troops';
import { hexX, hexY, MID_ROW } from './hex';
import { BIG_HP, TEAM_BLUE, TEAM_RED, UNITS, type UnitKey } from './rules';

const at = (c: number, r: number) => ({ x: hexX(c, r), y: hexY(r) });

function world(): Engine {
  return new Engine({ seed: 7, aiBlue: false, aiRed: false });
}

describe('targeting preference', () => {
  /** Give a kind a preference for this test only, and put the table back afterwards. */
  function hunts(k: UnitKey, p: 'ranged' | 'big'): void {
    const d = UNITS[k], was = { prefer: d.prefer, seek: d.seek };
    d.prefer = p;
    d.seek = Math.max(d.seek, d.aggroMobile * 2);
    afterEach(() => {
      d.prefer = was.prefer;
      d.seek = was.seek;
    });
  }

  it('every troop that declares a preference declares a seek wider than its ordinary aggro', () => {
    for (const k of Object.keys(UNITS) as UnitKey[]) {
      const d = UNITS[k];
      if (d.prefer) expect(d.seek).toBeGreaterThan(d.aggroMobile);
    }
  });

  it('`ranged` prey is every troop that fires a missile, and only those', () => {
    const e = world();
    for (const k of Object.keys(UNITS) as UnitKey[]) {
      const p = at(6, MID_ROW);
      e.spawnUnit(TEAM_RED, k, p.x, p.y, 0);
      const found = nearestPrey(e, TEAM_BLUE, p.x, p.y, 9999, 'ranged');
      expect(Boolean(found)).toBe(UNITS[k].ranged !== '');
      e.units = [];
      e.ents.clear();
    }
  });

  it('`big` prey is every troop at or above BIG_HP, and only those', () => {
    const e = world();
    for (const k of Object.keys(UNITS) as UnitKey[]) {
      const p = at(6, MID_ROW);
      e.spawnUnit(TEAM_RED, k, p.x, p.y, 0);
      const found = nearestPrey(e, TEAM_BLUE, p.x, p.y, 9999, 'big');
      expect(Boolean(found)).toBe(UNITS[k].hp >= BIG_HP);
      e.units = [];
      e.ents.clear();
    }
  });

  it('the guard is nobody’s prey: it is a fixture, not part of an army', () => {
    const e = world();
    const g = e.guards[TEAM_RED];
    expect(g.dead).toBe(0);
    expect(nearestPrey(e, TEAM_BLUE, g.x, g.y, 9999, 'ranged')).toBeNull();
    expect(nearestPrey(e, TEAM_BLUE, g.x, g.y, 9999, 'big')).toBeNull();
  });

  it('a hunter walks past the nearer enemy to reach its prey', () => {
    const e = world();
    const me = at(6, MID_ROW + 2);
    // The shipped table assigns no preference yet (see COUNTERPLAY 13.8): measured against the
    // current unit stats, preference amplifies the stronger army instead of countering it. The
    // mechanic is tested on its own, with the preference set here, so the test outlives whatever
    // the table ends up assigning.
    hunts('militia', 'ranged');
    const hunter = e.spawnUnit(TEAM_BLUE, 'militia', me.x, me.y, 0);
    const near = at(6, MID_ROW + 1);
    const chaff = e.spawnUnit(TEAM_RED, 'shield', near.x, near.y, 0);
    const far = at(6, MID_ROW - 1);
    const prey = e.spawnUnit(TEAM_RED, 'slinger', far.x, far.y, 0);
    for (let t = 0; t < 30; t++) updateUnits(e);
    expect(hunter.tgt).toBe(prey.id);
    expect(hunter.tgt).not.toBe(chaff.id);
  });

  it('with no prey in reach the hunter falls back to the nearest enemy', () => {
    const e = world();
    hunts('militia', 'ranged');
    const me = at(6, MID_ROW + 2);
    const hunter = e.spawnUnit(TEAM_BLUE, 'militia', me.x, me.y, 0);
    const near = at(6, MID_ROW + 1);
    const chaff = e.spawnUnit(TEAM_RED, 'shield', near.x, near.y, 0);
    for (let t = 0; t < 30; t++) updateUnits(e);
    expect(hunter.tgt).toBe(chaff.id);
  });

  it('prey beyond the seek radius is not hunted', () => {
    const e = world();
    hunts('militia', 'ranged');
    const me = at(6, MID_ROW + 5);
    const hunter = e.spawnUnit(TEAM_BLUE, 'militia', me.x, me.y, 0);
    const far = at(6, MID_ROW - 5);
    e.spawnUnit(TEAM_RED, 'slinger', far.x, far.y, 0);
    const d = UNITS.militia;
    expect(nearestPrey(e, TEAM_BLUE, me.x, me.y, d.seek, 'ranged')).toBeNull();
    for (let t = 0; t < 10; t++) updateUnits(e);
    expect(hunter.tgt).toBe(0); // nothing in reach: it marches on the castle
  });

  it('a troop with no preference always takes the nearest enemy', () => {
    const e = world();
    expect(UNITS.slinger.prefer).toBe('');
    const me = at(6, MID_ROW + 2);
    const plain = e.spawnUnit(TEAM_BLUE, 'slinger', me.x, me.y, 0);
    const near = at(6, MID_ROW + 1);
    const chaff = e.spawnUnit(TEAM_RED, 'shield', near.x, near.y, 0);
    const far = at(6, MID_ROW - 1);
    e.spawnUnit(TEAM_RED, 'bowman', far.x, far.y, 0);
    for (let t = 0; t < 30; t++) updateUnits(e);
    expect(plain.tgt).toBe(chaff.id);
  });
});
