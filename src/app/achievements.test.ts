import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACH_ALL, BLITZ_SECS, HORDE, achCount, achievementsMet, newOnes, type MatchFacts } from './achievements';
import { GOAL_ALL, GOAL_WIN, SKIRMISH, STAGE_COUNT, STAGES_PER_CHAPTER } from './campaign';

const facts = (f: Partial<MatchFacts> = {}): MatchFacts => ({
  match: { kind: 'stage', id: 3 }, won: false, skirmish: 1, taken: 0, total: 8, secs: 400, peak: 10, legend: false, stages: [], hard: [], streak: 0, ...f,
});
const has = (bits: number, k: (typeof ACHIEVEMENTS)[number]) => (bits & (1 << ACHIEVEMENTS.indexOf(k))) !== 0;

describe('achievements', () => {
  it('a loss with nothing special earns nothing', () => {
    expect(achievementsMet(facts())).toBe(0);
  });

  it('a win earns the first one; a fast, full sweep more', () => {
    const a = achievementsMet(facts({ won: true, taken: 8, secs: BLITZ_SECS }));
    expect(newOnes(a, 0)).toEqual(['firstWin', 'sweep', 'blitz']);
    expect(has(achievementsMet(facts({ won: true, taken: 7, secs: BLITZ_SECS + 1 })), 'sweep')).toBe(false);
  });

  it('a legend and a horde count even in a loss', () => {
    const a = achievementsMet(facts({ legend: true, peak: HORDE }));
    expect(newOnes(a, 0)).toEqual(['legend', 'horde']);
  });

  it('a chapter won on Hard', () => {
    const ch = Array<number>(STAGES_PER_CHAPTER).fill(GOAL_WIN);
    expect(has(achievementsMet(facts({ hard: [0, ...ch.slice(1)] })), 'hardChapter')).toBe(false);
    expect(has(achievementsMet(facts({ hard: ch })), 'hardChapter')).toBe(true);
    expect(has(achievementsMet(facts({ hard: [...Array<number>(STAGES_PER_CHAPTER).fill(0), ...ch] })), 'hardChapter')).toBe(true);
    expect(has(achievementsMet(facts({ stages: ch })), 'hardChapter')).toBe(false);
  });

  it('brutal only for the hardest quick match', () => {
    const top = SKIRMISH.length - 1;
    expect(has(achievementsMet(facts({ won: true, match: { kind: 'quick' }, skirmish: top })), 'brutal')).toBe(true);
    expect(has(achievementsMet(facts({ won: true, match: { kind: 'quick' }, skirmish: top - 1 })), 'brutal')).toBe(false);
    expect(has(achievementsMet(facts({ won: true, skirmish: top })), 'brutal')).toBe(false);
  });

  it('a full chapter, the streak and the whole campaign', () => {
    const ch = Array(STAGES_PER_CHAPTER).fill(GOAL_ALL);
    expect(has(achievementsMet(facts({ stages: ch })), 'chapter')).toBe(true);
    expect(has(achievementsMet(facts({ stages: [...ch.slice(1), GOAL_WIN] })), 'chapter')).toBe(false);
    expect(has(achievementsMet(facts({ streak: 3 })), 'streak')).toBe(true);
    expect(has(achievementsMet(facts({ stages: Array(STAGE_COUNT).fill(GOAL_WIN) })), 'campaign')).toBe(true);
    expect(has(achievementsMet(facts({ stages: Array(STAGE_COUNT - 1).fill(GOAL_WIN) })), 'campaign')).toBe(false);
  });

  it('counts and lists only what is new', () => {
    expect(achCount(ACH_ALL)).toBe(ACHIEVEMENTS.length);
    expect(newOnes(0b111, 0b101)).toEqual(['sweep']);
  });
});
