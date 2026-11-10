// The achievements: nine feats, one bit each in the save (Save.ach), earned at the end of a
// match played against the AI (a stage, the daily, a quick match) and never lost. Each says how
// to earn it in plain words (lang tables: ach_<key> and ach_<key>_d); none hints at what the
// face-down cards hold. A pure checker (achievements.test.ts); result.ts shows what was new, the
// menu's medal button the whole set.

import { STAGES_PER_CHAPTER, STAGE_COUNT, CHAPTERS, GOAL_WIN, SKIRMISH, chapterStars } from './campaign';
import type { MatchKind } from './campaignUi';

/** In order: the bit is the index. */
export const ACHIEVEMENTS = ['firstWin', 'sweep', 'legend', 'blitz', 'chapter', 'streak', 'brutal', 'horde', 'campaign'] as const;
export type AchKey = (typeof ACHIEVEMENTS)[number];
export const ACH_ALL = (1 << ACHIEVEMENTS.length) - 1;

/** A win within this many seconds of play earns "blitz". */
export const BLITZ_SECS = 150;
/** This many troops on the field at once earns "horde" (the troop cap before the siege). */
export const HORDE = 50;
/** Daily challenges won on days in a row for "streak". */
export const STREAK_DAYS = 3;

export interface MatchFacts {
  match: MatchKind;
  won: boolean;
  /** The quick match's difficulty (SKIRMISH index). */
  skirmish: number;
  taken: number;
  total: number;
  secs: number;
  /** The most troops the player had on the field at once. */
  peak: number;
  legend: boolean;
  /** The campaign's goals and the daily streak after this match was recorded. */
  stages: readonly number[];
  streak: number;
}

const bit = (k: AchKey): number => 1 << ACHIEVEMENTS.indexOf(k);

/** Every achievement this match's facts meet (with those already held, the caller masks). */
export function achievementsMet(f: MatchFacts): number {
  let a = 0;
  if (f.won) a |= bit('firstWin');
  if (f.won && f.total > 0 && f.taken >= f.total) a |= bit('sweep');
  if (f.legend) a |= bit('legend');
  if (f.won && f.secs <= BLITZ_SECS) a |= bit('blitz');
  if (CHAPTERS.some((_, ch) => chapterStars(f.stages, ch) === STAGES_PER_CHAPTER * 3)) a |= bit('chapter');
  if (f.streak >= STREAK_DAYS) a |= bit('streak');
  if (f.won && f.match.kind === 'quick' && f.skirmish === SKIRMISH.length - 1) a |= bit('brutal');
  if (f.peak >= HORDE) a |= bit('horde');
  let all = true;
  for (let i = 0; i < STAGE_COUNT; i++) if (!((f.stages[i] ?? 0) & GOAL_WIN)) all = false;
  if (all) a |= bit('campaign');
  return a;
}

/** The achievements newly earned (bits), in order. */
export const newOnes = (now: number, had: number): AchKey[] => ACHIEVEMENTS.filter((_, i) => now & ~had & (1 << i));
export const achCount = (bits: number): number => ACHIEVEMENTS.reduce((n, _, i) => n + ((bits >> i) & 1), 0);
