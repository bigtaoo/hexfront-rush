// First-time hints (hints.ts): which one is due when, and that one is only ever marked as said
// after it has been up for its whole time — a hint cut short by the end of the match comes back.

import { describe, expect, it } from 'vitest';
import { Engine } from '../sim/engine';
import { OFFER_LIST, PHASE_PLAY, TEAM_BLUE } from '../sim/rules';
import type { Game } from './game';
import { HINT_MINE, HINT_MYSTERY, HINT_WAVE, Hints } from './hints';
import en from './lang/en';
import { freshSave, type Save } from './save';

function playing(): Engine {
  const e = new Engine({ seed: 7, aiBlue: false, aiRed: false });
  while (e.phase !== PHASE_PLAY) e.step([]);
  return e;
}

/** Everything Hints.update touches. */
function fake(e: Engine, save: Save = freshSave()) {
  const g = {
    eng: e,
    save,
    tut: null as unknown,
    mode: 'solo',
    state: 'match',
    localTeam: TEAM_BLUE,
    renderer: { hint: null as string | null },
    saves: 0,
    persist(): void {
      g.saves++;
    },
  };
  return g as typeof g & Game;
}

/** `secs` of frames. */
const run = (h: Hints, g: Game, secs: number): void => {
  for (let i = 0; i < Math.round(secs * 60); i++) h.update(g, 1 / 60);
};

describe('which hint is due', () => {
  it('starts with the gold mine: one is on offer around the castle and none is built', () => {
    const e = playing();
    const me = e.team[TEAM_BLUE]!;
    expect(me.built.mine).toBe(0);
    expect(me.offers.some((oi) => oi >= 0 && OFFER_LIST[oi]!.kind === 'mine')).toBe(true);
    const g = fake(e);
    const h = new Hints();
    h.update(g, 1 / 60);
    expect(g.renderer.hint).toBe(en.hint_mine);
  });

  it('skips the mine once one stands, and the waves wait for a barracks', () => {
    const e = playing();
    e.team[TEAM_BLUE]!.built.mine = 1;
    const g = fake(e, { ...freshSave(), hints: HINT_MYSTERY });
    const h = new Hints();
    h.update(g, 1 / 60);
    expect(g.renderer.hint).toBeNull();
    e.team[TEAM_BLUE]!.built.barracks = 1;
    h.update(g, 1 / 60);
    expect(g.renderer.hint).toBe(en.hint_wave);
  });

  it('says nothing outside a solo match that is running', () => {
    const e = playing();
    const h = new Hints();
    for (const g of [fake(e), fake(e), fake(e)]) {
      (g as { mode: string }).mode = 'online';
      h.update(g, 1 / 60);
      expect(g.renderer.hint).toBeNull();
    }
    const tut = fake(e);
    (tut as { tut: unknown }).tut = { step: 0, t: 0 };
    h.update(tut, 1 / 60);
    expect(tut.renderer.hint).toBeNull();
  });
});

describe('a hint is said once', () => {
  it('is kept in the save only once it has been up for its whole time', () => {
    const e = playing();
    const g = fake(e);
    const h = new Hints();
    run(h, g, 3);
    expect(g.renderer.hint).toBe(en.hint_mine);
    expect(g.save.hints & HINT_MINE).toBe(0);
    run(h, g, 4);
    expect(g.save.hints & HINT_MINE).toBe(HINT_MINE);
    expect(g.renderer.hint).toBeNull();
  });

  it('comes back when the match ended before it could be read', () => {
    const e = playing();
    const save = freshSave();
    const first = fake(e, save);
    const h = new Hints();
    run(h, first, 3);
    expect(first.renderer.hint).toBe(en.hint_mine);
    // the match ends mid-hint
    (first as { state: string }).state = 'result';
    h.update(first, 1 / 60);
    expect(first.renderer.hint).toBeNull();
    expect(save.hints).toBe(0);
    // the next match says it again
    const next = fake(playing(), save);
    const h2 = new Hints();
    h2.update(next, 1 / 60);
    expect(next.renderer.hint).toBe(en.hint_mine);
  });

  it('leaves a pause between two hints, and never repeats one', () => {
    const e = playing();
    const g = fake(e, { ...freshSave(), hints: HINT_MYSTERY });
    const h = new Hints();
    e.team[TEAM_BLUE]!.built.barracks = 1;
    run(h, g, 7);
    expect(g.save.hints & HINT_MINE).toBe(HINT_MINE);
    expect(g.renderer.hint).toBeNull();
    run(h, g, 2);
    expect(g.renderer.hint).toBeNull();
    run(h, g, 2);
    expect(g.renderer.hint).toBe(en.hint_wave);
    run(h, g, 7);
    expect(g.save.hints & HINT_WAVE).toBe(HINT_WAVE);
    // both are in the save now: a fresh match says neither again
    const again = fake(playing(), g.save);
    again.eng.team[TEAM_BLUE]!.built.barracks = 1;
    run(new Hints(), again, 4);
    expect(again.renderer.hint).toBeNull();
  });
});
