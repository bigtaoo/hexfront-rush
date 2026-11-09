import type { KeyValueStore } from '../platform/types';

// The one save: the record, whether the tutorial was played, the sound switch and whether the
// player shares their solo matches' replays (replayUpload.ts). Kept as JSON
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
}

export const freshSave = (): Save => ({ tutorialDone: false, wins: 0, losses: 0, draws: 0, muted: false, shareReplays: true });

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

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
    shareReplays: r.shareReplays !== false,
  };
}

export function persist(store: KeyValueStore, save: Save): void {
  store.setItem(SAVE_KEY, JSON.stringify(save));
}
