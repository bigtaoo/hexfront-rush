// A stored replay's shape, checked without the engine. Replays come from outside (the relay's
// POST /r, files on disk for `npm run replays`), so nothing in them is trusted: parseReplay keeps
// a clean copy or says no. Its one value import (setup.ts) has none of its own, so Node runs
// this file as is from server/.

import type { Replay } from './replay';
import { parseConfig } from './setup.ts';

/** Ticks in one replay, at most: half an hour at 30 Hz (a match is 3 minutes plus the intro). */
export const MAX_REPLAY_TICKS = 30 * 60 * 30;
/** Commands in one replay, at most: each seat sends at most one per tick. */
export const MAX_REPLAY_CMDS = 20_000;
/** Checkpoint hashes in one replay, at most (the relay keeps one every second). */
export const MAX_REPLAY_CHECKS = 2_000;

const REASONS = ['base', 'time', 'forfeit'];

const int = (v: unknown, lo: number, hi: number): v is number => Number.isSafeInteger(v) && (v as number) >= lo && (v as number) <= hi;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const U32 = 0xffffffff;

/** A clean copy of `x` when it is a replay, else null. Unknown keys are dropped. */
export function parseReplay(x: unknown): Replay | null {
  if (!obj(x) || !int(x.v, 0, 1000) || !int(x.endTick, 0, MAX_REPLAY_TICKS) || !int(x.hash, 0, U32)) return null;
  const config = parseConfig(x.config);
  if (!config) return null;
  const endTick = x.endTick;
  if (!Array.isArray(x.log) || x.log.length > MAX_REPLAY_CMDS) return null;
  const log: number[][] = [];
  for (const a of x.log) {
    if (!Array.isArray(a) || a.length !== 6 || !a.every((n) => Number.isSafeInteger(n))) return null;
    if (!int(a[0], 0, endTick) || !int(a[1], 1, 2)) return null;
    log.push([a[0], a[1], a[2], a[3], a[4], a[5]]);
  }
  const checks: [number, number][] = [];
  if (x.checks !== undefined) {
    if (!Array.isArray(x.checks) || x.checks.length > MAX_REPLAY_CHECKS) return null;
    for (const ch of x.checks) {
      if (!Array.isArray(ch) || ch.length !== 2 || !int(ch[0], 1, endTick) || !int(ch[1], 0, U32)) return null;
      checks.push([ch[0], ch[1]]);
    }
  }
  let result: Replay['result'] = null;
  const r = x.result;
  if (r !== null && r !== undefined) {
    if (!obj(r) || !int(r.winner, 0, 2) || typeof r.reason !== 'string' || !REASONS.includes(r.reason)) return null;
    if (!int(r.blue, 0, 1e6) || !int(r.red, 0, 1e6) || !int(r.tick, 0, MAX_REPLAY_TICKS)) return null;
    result = { winner: r.winner, reason: r.reason as 'base' | 'time' | 'forfeit', blue: r.blue, red: r.red, tick: r.tick };
  }
  return { v: x.v, config, log, endTick, hash: x.hash, checks, result };
}
