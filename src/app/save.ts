import type { KeyValueStore } from '../platform/types';
import { QUALITY_MODES } from '../view/quality';
import { GOAL_ALL, SKIRMISH, SKIRMISH_STD, STAGE_COUNT } from './campaign';

// The one save: the record, whether the tutorial was played, the sound and music switches, whether
// the player shares their solo matches' replays (replayUpload.ts), the campaign's stars and best
// times (Normal and Hard), the quick match's difficulty, the daily challenge's day, streak and wins, the first-time
// hints already shown (hints.ts), the achievements (achievements.ts) and the settings (graphics
// quality, vibration: settings.ts). Kept as JSON
// under one key in the platform's storage (localStorage on the web, Bridge on Playgama).

export const SAVE_KEY = 'hexfront_save';

export interface Save {
  tutorialDone: boolean;
  wins: number;
  losses: number;
  draws: number;
  /** The sound effects are off (the key is older than the music switch). */
  muted: boolean;
  musicOff: boolean;
  /** Send each solo match's replay, without anything that says who played (on by default). */
  shareReplays: boolean;
  /** Per campaign stage, the goals ever met there (campaign.ts GOAL_* bits). */
  stages: number[];
  /** Per campaign stage, the fastest win in seconds of play; 0: not won yet. */
  best: number[];
  /** The hard campaign's goals and best times, the same way. */
  hard: number[];
  hardBest: number[];
  /** The quick match's difficulty (campaign.ts SKIRMISH). */
  skirmish: number;
  /** The day (campaign.ts dayNumber) whose daily challenge dailyGoals counts; -1: none yet. */
  dailyDay: number;
  dailyGoals: number;
  /** Daily challenges won on days in a row, the last of them on streakDay. */
  streak: number;
  streakDay: number;
  /** Daily challenges won, one a day at most (the daily leaderboard). */
  dailyWins: number;
  /** hints.ts HINT_* bits: the first-time hints already shown. */
  hints: number;
  /** achievements.ts bits: the achievements earned. */
  ach: number;
  /** The graphics: view/quality.ts QUALITY_MODES index (0 auto, 1 high, 2 saver). */
  quality: number;
  /** Vibrate on the big moments where the device can (haptics.ts). */
  vibrate: boolean;
}


export const freshSave = (): Save => ({
  tutorialDone: false, wins: 0, losses: 0, draws: 0, muted: false, musicOff: false, shareReplays: true,
  stages: [], best: [], hard: [], hardBest: [], skirmish: SKIRMISH_STD, dailyDay: -1, dailyGoals: 0, streak: 0, streakDay: -1,
  dailyWins: 0, hints: 0, ach: 0, quality: 0, vibrate: true,
});

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const intIn = (v: unknown, lo: number, hi: number, std: number): number => (Number.isSafeInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : std);
const goals = (v: unknown): number[] => (Array.isArray(v) ? v.slice(0, STAGE_COUNT).map((g) => intIn(g, 0, GOAL_ALL, 0)) : []);
const times = (v: unknown): number[] => (Array.isArray(v) ? v.slice(0, STAGE_COUNT).map(count) : []);
const bits = (v: unknown): number => intIn(v, 0, 0x3fffffff, 0);

/** The stored save, field by field: a missing, corrupt or foreign value falls back to the default. */
export function loadSave(store: KeyValueStore): Save {
  const s = freshSave();
  let raw: unknown;
  try {
    raw = JSON.parse(store.getItem(SAVE_KEY) ?? 'null');
  } catch {
    return s;
  }
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  const muted = r.muted === true, streak = count(r.streak);
  return {
    tutorialDone: r.tutorialDone === true, wins: count(r.wins), losses: count(r.losses), draws: count(r.draws), muted,
    // a save from before the music switch: its one switch silenced both
    musicOff: typeof r.musicOff === 'boolean' ? r.musicOff : muted,
    shareReplays: r.shareReplays !== false, stages: goals(r.stages), best: times(r.best), hard: goals(r.hard), hardBest: times(r.hardBest), skirmish: intIn(r.skirmish, 0, SKIRMISH.length - 1, SKIRMISH_STD),
    dailyDay: intIn(r.dailyDay, -1, 1e7, -1), dailyGoals: intIn(r.dailyGoals, 0, GOAL_ALL, 0), streak, streakDay: intIn(r.streakDay, -1, 1e7, -1),
    // a save from before the count: the streak is a floor for it
    dailyWins: Math.max(count(r.dailyWins), streak), hints: bits(r.hints), ach: bits(r.ach),
    quality: intIn(r.quality, 0, QUALITY_MODES.length - 1, 0), vibrate: r.vibrate !== false,
  };
}

export function persist(store: KeyValueStore, save: Save): void {
  store.setItem(SAVE_KEY, JSON.stringify(save));
}
