import { describe, expect, it } from 'vitest';
import { Engine } from '../sim/engine';
import { TEAM_BLUE, TEAM_RED } from '../sim/rules';
import type { SimEvent } from '../sim/types';
import { MatchStats } from './matchStats';

const engine = () => new Engine({ seed: 7, aiBlue: false, aiRed: false });
/** One tick's worth of events, as the engine leaves them for the view. */
function tick(st: MatchStats, eng: Engine, me: number, events: SimEvent[], units: [number, number] = [0, 0]): void {
  eng.events.length = 0;
  eng.events.push(...events);
  eng.team[TEAM_BLUE]!.units = units[0];
  eng.team[TEAM_RED]!.units = units[1];
  st.step(eng, me);
}

describe('match stats', () => {
  it('counts the map events the match starts with', () => {
    const eng = engine();
    const st = new MatchStats();
    st.reset(eng);
    expect(st.eventsTotal).toBe(eng.tiles.filter((t) => t.event).length);
    expect(st.eventsTotal).toBeGreaterThan(0);
  });

  it("counts each side's chests and camps, and nobody else's", () => {
    const eng = engine();
    const st = new MatchStats();
    st.reset(eng);
    tick(st, eng, TEAM_BLUE, [
      { type: 'mapEvent', team: TEAM_BLUE, kind: 'chest' },
      { type: 'mapEvent', team: TEAM_RED, kind: 'camp' },
      { type: 'mapEvent', kind: 'chest' }, // nobody claimed it (there is no such event, but it is not mine)
      { type: 'burst', team: TEAM_BLUE },
    ]);
    tick(st, eng, TEAM_BLUE, [{ type: 'mapEvent', team: TEAM_BLUE, kind: 'hoard' }]);
    expect(st.taken(TEAM_BLUE)).toBe(2);
    expect(st.taken(TEAM_RED)).toBe(1);
    expect(st.taken(0)).toBe(0);
    expect(st.taken(9)).toBe(0);
  });

  it('keeps the biggest army each side ever had, not the last', () => {
    const eng = engine();
    const st = new MatchStats();
    st.reset(eng);
    tick(st, eng, TEAM_BLUE, [], [4, 2]);
    tick(st, eng, TEAM_BLUE, [], [9, 1]);
    tick(st, eng, TEAM_BLUE, [], [0, 7]);
    expect(st.side(eng, TEAM_BLUE).peak).toBe(9);
    expect(st.side(eng, TEAM_RED).peak).toBe(7);
  });

  it('marks a legendary troop that joined me, from a barracks or a mystery', () => {
    const eng = engine();
    const st = new MatchStats();
    st.reset(eng);
    tick(st, eng, TEAM_BLUE, [{ type: 'barracks', team: TEAM_RED, rarity: 3 }]); // the rival's
    expect(st.legend).toBe(false);
    tick(st, eng, TEAM_BLUE, [{ type: 'barracks', team: TEAM_BLUE, rarity: 2 }]); // epic, not legendary
    expect(st.legend).toBe(false);
    tick(st, eng, TEAM_BLUE, [{ type: 'barracks', team: TEAM_BLUE, rarity: 3 }]);
    expect(st.legend).toBe(true);

    const other = new MatchStats();
    other.reset(eng);
    tick(other, eng, TEAM_RED, [{ type: 'mysteryWin', team: TEAM_RED, kind: 'barracks', rarity: 3 }]);
    expect(other.legend).toBe(true);
  });

  it('reads the buildings each side put up, and starts afresh next match', () => {
    const eng = engine();
    const st = new MatchStats();
    st.reset(eng);
    tick(st, eng, TEAM_BLUE, [{ type: 'mapEvent', team: TEAM_BLUE, kind: 'chest' }, { type: 'barracks', team: TEAM_BLUE, rarity: 3 }], [5, 0]);
    eng.team[TEAM_BLUE]!.built.mine = 3;
    eng.team[TEAM_BLUE]!.built.barracks = 2;
    expect(st.side(eng, TEAM_BLUE)).toEqual({ mines: 3, barracks: 2, events: 1, peak: 5 });

    const next = engine();
    st.reset(next);
    expect(st.legend).toBe(false);
    expect(st.side(next, TEAM_BLUE)).toEqual({ mines: 0, barracks: 0, events: 0, peak: 0 });
  });
});
