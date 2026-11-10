import { describe, expect, it } from 'vitest';
import { generateMap } from '../sim/map';
import { AI_SKILLS, AI_STYLES } from '../sim/ai';
import {
  CHAPTERS, GOAL_ALL, GOAL_EVENTS, GOAL_PAR, GOAL_WIN, SKIRMISH, STAGE_COUNT, STAGES_PER_CHAPTER, chapterStars, dailyStage,
  eventsGoal, goalsMet, nextStage, stageAt, stageLabel, stageOpen, starCount,
} from './campaign';
import { TUTORIAL_SEED } from './tutorial';

describe('campaign', () => {
  it('has six full chapters, each stage on its own map of the chapter theme', () => {
    expect(STAGE_COUNT).toBe(42);
    const seeds = new Set<number>();
    for (const c of CHAPTERS) {
      expect(c.stages.length).toBe(STAGES_PER_CHAPTER);
      for (const st of c.stages) {
        seeds.add(st.seed);
        if (st.seed !== TUTORIAL_SEED) expect(generateMap(st.seed).themeKey).toBe(c.theme);
        expect(AI_SKILLS[st.rival.skill]).toBeDefined();
        expect(AI_STYLES[st.rival.style ?? 0]).toBeDefined();
        expect(st.par).toBeGreaterThan(0);
      }
    }
    expect(seeds.size).toBe(STAGE_COUNT);
    for (const r of SKIRMISH) expect(AI_SKILLS[r.skill]).toBeDefined();
  });

  it('opens with the tutorial map', () => {
    expect(stageAt(0).seed).toBe(TUTORIAL_SEED);
    expect(stageLabel(0)).toBe('1-1');
    expect(stageLabel(9)).toBe('2-3');
  });

  it('scores the three goals', () => {
    expect(goalsMet(false, 9, 9, 10, 200)).toBe(0);
    expect(goalsMet(true, 0, 6, 300, 200)).toBe(GOAL_WIN);
    expect(goalsMet(true, 3, 6, 300, 200)).toBe(GOAL_WIN | GOAL_EVENTS);
    expect(goalsMet(true, 2, 5, 200, 200)).toBe(GOAL_WIN | GOAL_PAR);
    expect(goalsMet(true, 0, 0, 100, 200)).toBe(GOAL_ALL);
    expect(eventsGoal(3, 5)).toBe(true);
    expect(starCount(GOAL_ALL)).toBe(3);
    expect(starCount(GOAL_WIN | GOAL_PAR)).toBe(2);
  });

  it('opens stages one win at a time', () => {
    expect(stageOpen([], 0)).toBe(true);
    expect(stageOpen([], 1)).toBe(false);
    expect(stageOpen([GOAL_WIN], 1)).toBe(true);
    expect(nextStage([])).toBe(0);
    expect(nextStage([GOAL_ALL, GOAL_WIN])).toBe(2);
    // a stage given up on (lost, never won) is where the button leads back to
    expect(nextStage([GOAL_WIN, 0])).toBe(1);
    const all = Array<number>(STAGE_COUNT).fill(GOAL_WIN);
    expect(nextStage(all)).toBe(STAGE_COUNT - 1);
    expect(chapterStars(all.map(() => GOAL_ALL), 2)).toBe(STAGES_PER_CHAPTER * 3);
  });

  it('gives everyone the same daily challenge, a new one each day', () => {
    expect(dailyStage(20400)).toEqual(dailyStage(20400));
    const seeds = new Set(Array.from({ length: 30 }, (_, i) => dailyStage(20400 + i).seed));
    expect(seeds.size).toBe(30);
    expect(dailyStage(20400).rival.style).toBe(20400 % 5);
  });
});
