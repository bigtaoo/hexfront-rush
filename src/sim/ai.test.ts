// The built-in opponent. Its tables are hand-tuned numbers that no type checks: a kind of card
// added without a weight is valued at nothing, a skill level edited in the wrong row makes the
// beginner the strong one, and either would show up only as a strange match. What it does with
// those tables is pinned here by playing it: where it puts a mine against where it puts a
// barracks, what it does with no gold, and whether the standard level really outgrows the
// beginner from the same seed.

import { describe, expect, it } from 'vitest';
import { AI_SKILLS, AI_STYLES, aiUpdate, eventWorth } from './ai';
import { standingOf } from './economy';
import { Engine } from './engine';
import { NTILES, ROWS } from './hex';
import { baseTile } from './map';
import { AI_SKILL_MAX, AI_SKILL_STD } from './setup';
import { EV_CAMP, EV_CHEST, EV_HOARD, EV_WARBAND, EVENT_LIST, MAX_PLAY_TICKS, OF_BAR1, OF_MINE, OFFER_LIST, PHASE_PLAY, TEAM_RED } from './rules';

/** A match being played, with the engine's own AI switched off: the tests drive it by hand. */
const board = (seed = 31) => {
  const e = new Engine({ seed, aiBlue: false, aiRed: false });
  while (e.phase !== PHASE_PLAY) e.step([]);
  for (const t of e.tiles) t.event = 0; // no map events: nothing pulls the choice sideways
  const T = e.team[TEAM_RED]!;
  for (let i = 0; i < NTILES; i++) T.offers[i] = -1;
  return e;
};
/** Offer card `oi` on the tile in red's column 6 at row `r`, cleared of anything in the way. */
const offer = (e: Engine, r: number, oi: number): number => {
  const t = e.tiles.find((x) => x.c === 6 && x.r === r)!;
  t.obst = '';
  e.team[TEAM_RED]!.offers[t.i] = oi;
  return t.i;
};
/** Let the AI decide until it buys something; which tile it took, or -1. */
const decide = (e: Engine, tries = 200): number => {
  const before = e.blds.length;
  for (let i = 0; i < tries; i++) {
    e.ai[TEAM_RED]!.decideT = 1;
    aiUpdate(e, TEAM_RED);
    if (e.blds.length > before) return e.blds[e.blds.length - 1]!.tile;
  }
  return -1;
};

describe('the tables', () => {
  it('weigh every kind of card there is', () => {
    // AI_STYLES has one weight per kind (mines, towers, barracks, mysteries). A sixth card of a
    // new kind would be valued at NaN and so never bought, in silence.
    const kinds = new Set(OFFER_LIST.map((o) => o.kind));
    expect(kinds).toEqual(new Set(['mine', 'tower', 'barracks', 'mystery']));
    for (const st of AI_STYLES) {
      expect(st.length).toBe(kinds.size);
      for (const w of st) expect(w).toBeGreaterThanOrEqual(0);
    }
    expect(AI_STYLES[0]).toEqual([100, 100, 100, 100]); // 0 is the balanced rival
    expect(AI_STYLES.length).toBe(5);
  });

  it('put the skills in order, the beginner first', () => {
    expect(AI_SKILLS.length).toBe(AI_SKILL_MAX + 1);
    expect(AI_SKILL_STD).toBe(AI_SKILL_MAX);
    for (let i = 1; i < AI_SKILLS.length; i++) {
      const lo = AI_SKILLS[i - 1]!, hi = AI_SKILLS[i]!;
      expect(hi.think).toBeLessThanOrEqual(lo.think); // a better player taps sooner
      expect(hi.span).toBeLessThanOrEqual(lo.span);
      expect(hi.noise).toBeLessThanOrEqual(lo.noise); // and more deliberately
      expect(hi.lure).toBeGreaterThanOrEqual(lo.lure);
      for (const f of ['save', 'place', 'cap', 'guard'] as const) if (lo[f]) expect(hi[f]).toBe(true);
    }
    for (const k of AI_SKILLS) {
      expect(k.think).toBeGreaterThan(0); // thinking for no ticks is deciding every tick
      expect(k.span).toBeGreaterThanOrEqual(0);
      expect(k.lure).toBeGreaterThanOrEqual(0);
    }
  });

  it('price a map event by what it gives', () => {
    for (let i = 0; i < EVENT_LIST.length; i++) {
      const w = eventWorth(i);
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
    }
    expect(eventWorth(0)).toBe(0); // no event, nothing to want
    expect(eventWorth(EV_HOARD)).toBeGreaterThan(eventWorth(EV_CHEST));
    expect(eventWorth(EV_WARBAND)).toBeGreaterThan(eventWorth(EV_CAMP)); // fewer troops, rarer ones
    expect(eventWorth(EV_CAMP)).toBeGreaterThan(eventWorth(EV_CHEST));
  });
});

describe('where it builds', () => {
  it('keeps its mines at the back and its barracks forward', () => {
    // red's castle is near row 4 and it attacks downwards, so a low row is its own back yard
    const home = board().tiles[baseTile(TEAM_RED)]!.r;
    expect(home).toBeLessThan(ROWS / 2);
    for (const [oi, want] of [[OF_MINE, 'back'], [OF_BAR1, 'front']] as const) {
      const e = board();
      const back = offer(e, home - 2, oi), front = offer(e, home + 8, oi);
      const took = decide(e);
      expect(took).toBe(want === 'back' ? back : front);
    }
  });

  it('takes the only card it can reach, wherever it is', () => {
    const e = board();
    const only = offer(e, 14, OF_MINE);
    expect(decide(e)).toBe(only);
    expect(standingOf(e, TEAM_RED).mine).toBe(1);
  });

  it('does nothing at all with an empty purse, however the board looks', () => {
    const e = board();
    for (let r = 2; r < 12; r++) offer(e, r, OF_BAR1);
    const T = e.team[TEAM_RED]!;
    T.gold = 0;
    const blds = e.blds.length;
    decide(e, 300);
    expect(e.blds.length).toBe(blds);
    expect(T.gold).toBe(0);
  });

  it('waits out its own thinking time between taps', () => {
    const e = board();
    offer(e, 6, OF_MINE);
    const k = AI_SKILLS[AI_SKILL_STD]!;
    e.ai[TEAM_RED]!.decideT = 1;
    aiUpdate(e, TEAM_RED);
    expect(e.ai[TEAM_RED]!.decideT).toBeGreaterThanOrEqual(k.think);
    expect(e.ai[TEAM_RED]!.decideT).toBeLessThanOrEqual(k.think + k.span);
    // and a tick where it is not its turn to think costs nothing but the countdown
    const was = e.ai[TEAM_RED]!.decideT;
    aiUpdate(e, TEAM_RED);
    expect(e.ai[TEAM_RED]!.decideT).toBe(was - 1);
  });
});

describe('the skill levels', () => {
  /** A whole match, the standard level against the beginner, played out. A proxy that counts what
   *  one side builds alone cannot tell the levels apart any more: the beginner buys the nearest
   *  cheap card the moment it can afford it, so left alone it ends up with MORE barracks than the
   *  level that saves for better ground. What the better level is better at only shows when the
   *  two meet. Both colours are played, because blue moves first and wins a little more often. */
  const duel = (seed: number, stdIsRed: boolean): boolean => {
    const e = new Engine({
      seed, aiBlue: true, aiRed: true,
      blue: { skill: stdIsRed ? 0 : AI_SKILL_STD },
      red: { skill: stdIsRed ? AI_SKILL_STD : 0 },
    });
    while (e.phase !== PHASE_PLAY) e.step([]);
    for (let i = 0; i < MAX_PLAY_TICKS + 100 && !e.result; i++) e.step([]);
    if (!e.result) return false; // ran out the clock: not a win
    return stdIsRed ? e.result.winner === TEAM_RED : e.result.winner !== TEAM_RED;
  };

  it('leave the beginner behind, over a match', () => {
    let won = 0;
    for (const seed of [7, 31, 404, 11, 99, 2026]) for (const red of [true, false]) if (duel(seed, red)) won++;
    expect(won).toBeGreaterThanOrEqual(9); // 12 matches; it takes 11 of them as these tables stand
    // Twelve whole matches: about 7 s here, and this is the only test in the suite between the
    // 30 s default and the handful of replay tests that already carry 180_000. A CI runner's two
    // cores, shared with the rest of the suite, stretch a sim run by a factor the collector test
    // measured the hard way (23.7 s here, over 30 s there), which would put this one on the line.
    // So it gets the room the work takes rather than waiting to go red.
  }, 120_000);

  it('still let the beginner play: it builds, it just builds worse', () => {
    const e = new Engine({ seed: 7, aiBlue: false, aiRed: true, red: { skill: 0 } });
    while (e.phase !== PHASE_PLAY) e.step([]);
    for (let i = 0; i < 30 * 180; i++) e.step([]);
    const s = standingOf(e, TEAM_RED);
    expect(s.mine + s.tower + s.barracks).toBeGreaterThan(5);
    expect(e.units.filter((u) => u.alive && u.team === TEAM_RED).length).toBeGreaterThan(10);
  });
});
