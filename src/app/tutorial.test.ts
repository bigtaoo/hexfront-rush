// The first match's tutorial (tutorial.ts): where the hand points on the tutorial's own map, and
// that every step's lesson is up long enough to be read. The step-1 test is a regression: the hand
// in step 0 points at the nearest card the player can pay for, which on TUTORIAL_SEED is a
// barracks, so building it used to meet step 1 on the frame step 1 opened and the game's central
// lesson showed for one frame.

import { describe, expect, it } from 'vitest';
import { Engine } from '../sim/engine';
import { OFFER_LIST, PHASE_PLAY, TEAM_BLUE } from '../sim/rules';
import type { Game } from './game';
import en from './lang/en';
import { freshSave, type Save } from './save';
import { guideTarget, TUTORIAL_SEED, updateTutorial, type Tutorial } from './tutorial';

/** The tutorial's own match, played to the moment the player may tap. */
function tutorialEngine(): Engine {
  const e = new Engine({ seed: TUTORIAL_SEED, aiBlue: false, aiRed: false });
  while (e.phase !== PHASE_PLAY) e.step([]);
  return e;
}

/** Everything updateTutorial touches, and a count of the saves it asked for. */
function fake(e: Engine, tut: Tutorial | null, save: Save = freshSave()) {
  const g = {
    eng: e,
    save,
    tut,
    localTeam: TEAM_BLUE,
    renderer: { hint: null as string | null, guide: null as unknown },
    saves: 0,
    persist(): void {
      g.saves++;
    },
  };
  return g as typeof g & Game;
}

describe('where the hand points', () => {
  it('picks a card the player can pay for, around the castle', () => {
    const e = tutorialEngine();
    const t = guideTarget(e, TEAM_BLUE, 0);
    expect(t).not.toBeNull();
    const oi = e.team[TEAM_BLUE]!.offers[e.tiles.indexOf(t!)]!;
    expect(oi).toBeGreaterThanOrEqual(0);
    expect(OFFER_LIST[oi]!.kind).toBe('barracks');
  });

  it('points at a barracks in step 1 and at a map event in step 2', () => {
    const e = tutorialEngine();
    const bar = guideTarget(e, TEAM_BLUE, 1)!;
    expect(OFFER_LIST[e.team[TEAM_BLUE]!.offers[e.tiles.indexOf(bar)]!]!.kind).toBe('barracks');
    expect(guideTarget(e, TEAM_BLUE, 2)!.event).toBeTruthy();
  });

  it('has nothing to point at past the last step', () => {
    expect(guideTarget(tutorialEngine(), TEAM_BLUE, 3)).toBeNull();
  });
});

describe('the steps', () => {
  it('leaves the barracks lesson up long enough to read, even when it is already built', () => {
    const e = tutorialEngine();
    const tut: Tutorial = { step: 0, t: 0 };
    const g = fake(e, tut);
    // the card the hand points at is a barracks: building it meets step 0 and step 1 at once
    e.team[TEAM_BLUE]!.built.barracks = 1;
    updateTutorial(g, 1 / 60);
    expect(tut.step).toBe(1);
    let secs = 0;
    while (tut.step === 1 && secs < 30) {
      updateTutorial(g, 1 / 60);
      secs += 1 / 60;
      expect(g.renderer.hint).toBe(en.tip_barracks);
    }
    expect(secs).toBeGreaterThan(3);
  });

  it('moves on from the barracks step on its own when nothing is built', () => {
    const e = tutorialEngine();
    const tut: Tutorial = { step: 1, t: 0 };
    const g = fake(e, tut);
    for (let i = 0; i < 17 * 60; i++) updateTutorial(g, 1 / 60);
    expect(tut.step).toBe(1);
    for (let i = 0; i < 2 * 60; i++) updateTutorial(g, 1 / 60);
    expect(tut.step).toBe(2);
  });

  it('is done for good after the last step, and says so in the save', () => {
    const e = tutorialEngine();
    const g = fake(e, { step: 3, t: 0 });
    for (let i = 0; i < 7 * 60 && g.tut; i++) updateTutorial(g, 1 / 60);
    expect(g.tut).toBeNull();
    expect(g.save.tutorialDone).toBe(true);
    expect(g.saves).toBe(1);
    expect(g.renderer.hint).toBeNull();
    expect(g.renderer.guide).toBeNull();
  });

  it('says nothing before the match has begun', () => {
    const e = new Engine({ seed: TUTORIAL_SEED, aiBlue: false, aiRed: false });
    const tut: Tutorial = { step: 0, t: 0 };
    const g = fake(e, tut);
    updateTutorial(g, 1);
    expect(g.renderer.hint).toBeNull();
    expect(tut.t).toBe(0);
  });
});
