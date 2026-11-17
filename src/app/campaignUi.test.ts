import { describe, expect, it } from 'vitest';
import { EVENTS_ON_MAP, GOAL_EVENTS, GOAL_PAR, GOAL_WIN, SKIRMISH, STAGE_COUNT, STAGES_PER_CHAPTER, dailyStage, stageAt } from './campaign';
import {
  allStars, bestOf, chapterOfNext, fmtTime, goalText, goalTrack, goalsOf, matchConfig, menuHidden, nextOpen, recordGoals, stageOf, twists,
  type MatchKind,
} from './campaignUi';
import { freshSave, type Save } from './save';

const save = (over: Partial<Save> = {}): Save => ({ ...freshSave(), ...over });
const stage = (id: number, hard = false): MatchKind => ({ kind: 'stage', id, hard });
const WON = [GOAL_WIN, GOAL_WIN | GOAL_EVENTS | GOAL_PAR];

describe('campaign ui', () => {
  it('reads the stars and times of the campaign being played', () => {
    const s = save({ stages: [1], best: [90], hard: [7], hardBest: [60] });
    expect(goalsOf(s, false)).toBe(s.stages);
    expect(goalsOf(s, undefined)).toBe(s.stages);
    expect(goalsOf(s, true)).toBe(s.hard);
    expect(bestOf(s, false)).toBe(s.best);
    expect(bestOf(s, true)).toBe(s.hardBest);
    // the stars board counts both campaigns
    expect(allStars(s)).toBe(1 + 3);
  });

  it('writes a time as minutes and seconds', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(9)).toBe('0:09');
    expect(fmtTime(65)).toBe('1:05');
    expect(fmtTime(600)).toBe('10:00');
  });

  it('plays a stage, the hard one, the day or a free map', () => {
    expect(stageOf(stage(3))).toEqual(stageAt(3));
    expect(stageOf(stage(3, true))!.rival.skill).toBeGreaterThanOrEqual(stageAt(3).rival.skill);
    expect(stageOf({ kind: 'daily', day: 42 })).toEqual(dailyStage(42));
    expect(stageOf({ kind: 'quick' })).toBe(null);
  });

  it('gives a quick match the drawn seed and the chosen difficulty', () => {
    const s = save({ skirmish: 2 });
    const cfg = matchConfig({ kind: 'quick' }, s, 1234);
    expect(cfg.seed).toBe(1234);
    expect(cfg.red).toBe(SKIRMISH[2]);
    // a stage plays its own map, whatever seed was drawn
    expect(matchConfig(stage(5), s, 1234).seed).toBe(stageAt(5).seed);
  });

  it('earns nothing for a quick match', () => {
    const s = save();
    expect(recordGoals({ kind: 'quick' }, s, true, 8, 8, 10)).toBe(null);
    expect(s.stages).toEqual([]);
  });

  it('keeps every star a stage ever earned', () => {
    const s = save();
    const st = stageAt(2);
    const fast = recordGoals(stage(2), s, true, 0, EVENTS_ON_MAP, st.par - 1);
    expect(fast).toEqual({ now: GOAL_WIN | GOAL_PAR, before: 0 });
    expect(s.stages[2]).toBe(GOAL_WIN | GOAL_PAR);
    // a slower win that took the chests adds the second star without losing the third
    const slow = recordGoals(stage(2), s, true, EVENTS_ON_MAP, EVENTS_ON_MAP, st.par + 60);
    expect(slow).toEqual({ now: GOAL_WIN | GOAL_EVENTS, before: GOAL_WIN | GOAL_PAR });
    expect(s.stages[2]).toBe(GOAL_WIN | GOAL_EVENTS | GOAL_PAR);
    // the stages before it are left at zero, not left as holes
    expect(s.stages.slice(0, 2)).toEqual([0, 0]);
    // and a loss earns nothing but keeps what was there
    expect(recordGoals(stage(2), s, false, EVENTS_ON_MAP, EVENTS_ON_MAP, 10)).toEqual({ now: 0, before: 7 });
    expect(s.stages[2]).toBe(7);
  });

  it("keeps the hard campaign's stars apart from the normal one's", () => {
    const s = save();
    recordGoals(stage(1, true), s, true, 0, EVENTS_ON_MAP, 9999);
    expect(s.hard[1]).toBe(GOAL_WIN);
    expect(s.stages).toEqual([]);
  });

  it("counts the day's challenge once a day, and the streak over days in a row", () => {
    const s = save();
    const day = 500;
    const got = recordGoals({ kind: 'daily', day }, s, true, 0, EVENTS_ON_MAP, 9999);
    expect(got).toEqual({ now: GOAL_WIN, before: 0 });
    expect([s.dailyDay, s.dailyGoals, s.streak, s.streakDay, s.dailyWins]).toEqual([day, GOAL_WIN, 1, day, 1]);
    // played again the same day: the stars add up, the win counts once
    recordGoals({ kind: 'daily', day }, s, true, EVENTS_ON_MAP, EVENTS_ON_MAP, 9999);
    expect(s.dailyGoals).toBe(GOAL_WIN | GOAL_EVENTS);
    expect([s.streak, s.dailyWins]).toEqual([1, 1]);
    // the next day starts its own stars and carries the streak on
    recordGoals({ kind: 'daily', day: day + 1 }, s, true, 0, EVENTS_ON_MAP, 9999);
    expect([s.dailyDay, s.dailyGoals, s.streak, s.dailyWins]).toEqual([day + 1, GOAL_WIN, 2, 2]);
    // a day missed breaks it
    recordGoals({ kind: 'daily', day: day + 3 }, s, true, 0, EVENTS_ON_MAP, 9999);
    expect([s.streak, s.streakDay, s.dailyWins]).toEqual([1, day + 3, 3]);
  });

  it('a lost daily leaves the streak and the count alone', () => {
    const s = save({ dailyDay: 9, dailyGoals: GOAL_WIN, streak: 4, streakDay: 9, dailyWins: 4 });
    recordGoals({ kind: 'daily', day: 10 }, s, false, 0, EVENTS_ON_MAP, 9999);
    expect([s.dailyDay, s.dailyGoals, s.streak, s.streakDay, s.dailyWins]).toEqual([10, 0, 4, 9, 4]);
    // winning it later the same day still carries the streak on from yesterday
    recordGoals({ kind: 'daily', day: 10 }, s, true, 0, EVENTS_ON_MAP, 9999);
    expect([s.streak, s.streakDay, s.dailyWins]).toEqual([5, 10, 5]);
  });

  it('offers the next stage only where there is one, open', () => {
    const s = save({ stages: WON.slice(0, 1) });
    expect(nextOpen(stage(0), s)).toBe(true);
    expect(nextOpen(stage(1), s)).toBe(false);
    expect(nextOpen({ kind: 'quick' }, s)).toBe(false);
    expect(nextOpen({ kind: 'daily', day: 1 }, s)).toBe(false);
    const all = save({ stages: Array.from({ length: STAGE_COUNT }, () => GOAL_WIN), hard: Array.from({ length: STAGE_COUNT }, () => GOAL_WIN) });
    expect(nextOpen(stage(STAGE_COUNT - 1), all)).toBe(false);
    expect(nextOpen(stage(0, true), all)).toBe(true);
  });

  it('opens the campaign on the chapter holding the next stage', () => {
    expect(chapterOfNext(save())).toBe(0);
    const s = save({ stages: Array.from({ length: STAGES_PER_CHAPTER }, () => GOAL_WIN) });
    expect(chapterOfNext(s)).toBe(1);
    // every stage won: the last one, not a chapter past the end
    const all = save({ stages: Array.from({ length: STAGE_COUNT }, () => GOAL_WIN) });
    expect(chapterOfNext(all)).toBe(Math.floor((STAGE_COUNT - 1) / STAGES_PER_CHAPTER));
  });

  it('shows the first screen bare until the tutorial is done', () => {
    const first = menuHidden(save(), true);
    expect(Object.values(first).every((v) => v)).toBe(true);
    const on = menuHidden(save({ tutorialDone: true }), true);
    expect(Object.values(on).some((v) => v)).toBe(false);
    // online also needs a relay to talk to
    expect(menuHidden(save({ tutorialDone: true }), false).onlineBtn).toBe(true);
  });

  it('asks for half the chests, and says so the same way in the match and on the card', () => {
    const st = stageAt(0);
    const need = Math.ceil(EVENTS_ON_MAP / 2);
    expect(goalText(GOAL_WIN, st)).not.toBe('');
    expect(goalText(GOAL_EVENTS, st)).toContain(String(EVENTS_ON_MAP));
    expect(goalText(GOAL_EVENTS, st, 1)).toContain(`1/${need}`);
    // more than enough still reads as the goal, not as 6/4
    expect(goalText(GOAL_EVENTS, st, EVENTS_ON_MAP)).toContain(`${need}/${need}`);
    expect(goalText(GOAL_PAR, st)).toContain(fmtTime(st.par));

    const track = goalTrack(stage(0), need - 1)!;
    expect(track.text).toContain(`${need - 1}/${need}`);
    expect(track.text).toContain(fmtTime(st.par));
    expect(track.color).toBe(undefined);
    expect(goalTrack(stage(0), need)!.color).toBeTruthy();
    expect(goalTrack(stage(0), need + 2)!.text).toContain(`${need}/${need}`);
    expect(goalTrack({ kind: 'quick' }, 3)).toBe(null);
  });

  it('says what each stage changes, once for a handicap both sides share', () => {
    // 1-1 only changes the rival (the gentlest one, on a short purse)
    const first = twists(stageAt(0));
    expect(first.length).toBeGreaterThan(1);
    expect(first.filter((t) => t.includes('%')).length).toBeGreaterThan(0);
    for (const ch of [0, 1, 2, 3, 4, 5]) {
      for (let s = 0; s < STAGES_PER_CHAPTER; s++) {
        const lines = twists(stageAt(ch * STAGES_PER_CHAPTER + s));
        // every line is a translated string, never a missing key or an undefined
        for (const t of lines) expect(t).not.toMatch(/undefined|NaN|^tw_/);
        expect(new Set(lines).size).toBe(lines.length);
      }
    }
  });
});
