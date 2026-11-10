// Replays: (config, packed command log) reproduces a match bit for bit. A replay also stores the
// final hash and checkpoint hashes, so a mismatch says *when* two runs diverged.
//
// Where they come from: the game keeps the last match (Game.lastReplay); a solo match goes to the
// collector's POST /r (app/replayUpload.ts); the relay records each online match itself, with the
// hashes both seats agreed on as checkpoints (server/collector.ts onlineDoc). `npm run replays` plays
// the collected ones again (replayStats.ts), and the game can show one (Game.watch, ReplayInput).

import { Engine } from './engine';
import { unpackCmd, type Cmd, type InputSource, type PackedCmd } from './input';
import { ENGINE_VERSION } from './rules';
import { makeConfig, type ConfigInput } from './setup';
import type { EngineConfig, MatchResult } from './types';

/** Ticks between stored checkpoint hashes. */
export const REPLAY_CHECK_EVERY = 300;

export interface Replay {
  /** ENGINE_VERSION of the engine that played it: another version plays it differently. */
  v: number;
  config: EngineConfig;
  log: PackedCmd[];
  endTick: number;
  hash: number;
  checks: [number, number][];
  result: MatchResult | null;
}

export function makeReplay(config: ConfigInput, log: readonly PackedCmd[], engine: Engine): Replay {
  return {
    v: ENGINE_VERSION, config: makeConfig(config),
    log: log.slice(), endTick: engine.tick, hash: engine.hash(), checks: engine.checks.slice(), result: engine.result,
  };
}

/** Group a packed log by tick: tick -> [cmd]. */
export function indexLog(log: readonly PackedCmd[]): Map<number, Cmd[]> {
  const by = new Map<number, Cmd[]>();
  for (const a of log) {
    const c = unpackCmd(a);
    if (!c) continue;
    let l = by.get(c.tick);
    if (!l) {
      l = [];
      by.set(c.tick, l);
    }
    l.push(c);
  }
  return by;
}

/** Looks inside a replay as it plays: the state just before each command and each step (the
 *  state after a step, with its events, is what onTick sees). */
export interface PlayHooks {
  beforeCommand?(e: Engine, c: Cmd): void;
  beforeStep?(e: Engine): void;
}

export interface ReplayRun {
  engine: Engine;
  /** Every checkpoint matched and, played to its end, so did the final hash. */
  ok: boolean;
  /** The first checkpoint tick whose hash differs, -1 when all match. */
  firstBad: number;
}

/** Run a replay to `untilTick` (default: its end). Throws on a replay from another engine version. */
export function runReplay(rep: Replay, untilTick?: number, onTick?: (e: Engine) => void, hooks: PlayHooks = {}): ReplayRun {
  if (rep.v !== ENGINE_VERSION) throw new Error(`replay from engine v${rep.v}, this is v${ENGINE_VERSION}`);
  const e = new Engine(rep.config);
  const by = indexLog(rep.log);
  const end = untilTick === undefined ? rep.endTick : untilTick;
  const checks = new Map<number, number>();
  for (const ch of rep.checks || []) checks.set(ch[0], ch[1]);
  let firstBad = -1;
  while (e.tick < end) {
    const cmds = by.get(e.tick) || null;
    if (cmds && hooks.beforeCommand) for (const c of cmds) hooks.beforeCommand(e, c);
    hooks.beforeStep?.(e);
    e.step(cmds);
    if (onTick) onTick(e);
    if (checks.has(e.tick) && firstBad < 0 && checks.get(e.tick) !== e.hash()) firstBad = e.tick;
  }
  const ok = firstBad < 0 && (end !== rep.endTick || e.hash() === rep.hash);
  return { engine: e, ok, firstBad };
}

/** Whether `rep` plays back to its own hashes on this engine (false for another version). */
export function checkReplay(rep: Replay): boolean {
  if (rep.v !== ENGINE_VERSION) return false;
  try {
    return runReplay(rep).ok;
  } catch {
    return false;
  }
}

/** Call after each step to record the checkpoint hashes a replay stores. */
export function recordChecks(engine: Engine): void {
  if (engine.tick > 0 && engine.tick % REPLAY_CHECK_EVERY === 0) engine.checks.push([engine.tick, engine.hash()]);
}

/** An input source that feeds a replay's commands back, for showing it: it stops (null) at the
 *  replay's end, so a replay cut short (the page was hidden) holds its last state. */
export class ReplayInput implements InputSource {
  private readonly by: Map<number, Cmd[]>;
  /** What was fed, as a LocalInput logs it. */
  readonly log: PackedCmd[] = [];
  readonly replay: Replay;
  constructor(replay: Replay) {
    this.replay = replay;
    this.by = indexLog(replay.log);
  }
  take(tick: number): Cmd[] | null {
    if (tick >= this.replay.endTick) return null;
    const cmds = this.by.get(tick) ?? [];
    for (const c of cmds) this.log.push([c.tick, c.owner, c.flip, 0, 0, c.ff]);
    return cmds;
  }
  backlog(): number {
    return 0;
  }
}
