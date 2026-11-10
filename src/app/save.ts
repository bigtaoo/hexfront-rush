import type { KeyValueStore } from '../platform/types';
import { GOAL_ALL, SKIRMISH, SKIRMISH_STD, STAGE_COUNT } from './campaign';

// The one save: the record, whether the tutorial was played, the sound switch, whether the
// player shares their solo matches' replays (replayUpload.ts), the campaign's stars, the quick
// match's difficulty and the daily challenge's day and streak. Kept as JSON
// under one key in the platform's storage (localStorage on the web, Bridge on Playgama).

export const SAVE_KEY = 'hexfront_save';

export interface Save {
  tutorialDone: boolean;
  wins: number;
  losses: number;
  draws: number;
  muted: boolean;
  /** Send each solo match's replay, without anything that says who played (on by default). */
  shareReplays: boolean;
  /** Per campaign stage, the goals ever met there (campaign.ts GOAL_* bits). */
  stages: number[];
  /** The quick match's difficulty (campaign.ts SKIRMISH). */
  skirmish: number;
  /** The day (campaign.ts dayNumber) whose daily challenge dailyGoals counts; -1: none yet. */
  dailyDay: number;
  dailyGoals: number;
  /** Daily challenges won on days in a row, the last of them on streakDay. */
  streak: number;
  streakDay: number;
}

export const freshSave = (): Save => ({
  tutorialDone: false, wins: 0, losses: 0, draws: 0, muted: false, shareReplays: true,
  stages: [], skirmish: SKIRMISH_STD, dailyDay: -1, dailyGoals: 0, streak: 0, streakDay: -1,
});

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const intIn = (v: unknown, lo: number, hi: number, std: number): number => (Number.isSafeInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : std);
const goals = (v: unknown): number[] => (Array.isArray(v) ? v.slice(0, STAGE_COUNT).map((g) => intIn(g, 0, GOAL_ALL, 0)) : []);

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
  return {
    tutorialDone: r.tutorialDone === true, wins: count(r.wins), losses: count(r.losses), draws: count(r.draws), muted: r.muted === true,
    shareReplays: r.shareReplays !== false, stages: goals(r.stages), skirmish: intIn(r.skirmish, 0, SKIRMISH.length - 1, SKIRMISH_STD),
    dailyDay: intIn(r.dailyDay, -1, 1e7, -1), dailyGoals: intIn(r.dailyGoals, 0, GOAL_ALL, 0), streak: count(r.streak), streakDay: intIn(r.streakDay, -1, 1e7, -1),
  };
}

export function persist(store: KeyValueStore, save: Save): void {
  store.setItem(SAVE_KEY, JSON.stringify(save));
}
