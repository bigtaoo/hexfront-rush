// Test helpers shared by the sim and net suites: a seeded scripted player and a whole-match runner.
import { Engine } from '../sim/engine';
import { LocalInput, makeCmd, type Cmd, type PackedCmd } from '../sim/input';
import { NTILES } from '../sim/hex';
import { Prng } from '../sim/prng';
import { recordChecks } from '../sim/replay';
import { PHASE_END, TEAM_BLUE, TEAM_RED } from '../sim/rules';
import { makeConfig, type EngineConfig } from '../sim/setup';

export const hex = (h: number): string => (h >>> 0).toString(16).padStart(8, '0');

/** A scripted player: a seeded random mix of card flips and stray taps, deciding from the state it sees. */
export function scriptedPlayer(owner: number, seed: number): (e: Engine) => Cmd | null {
  const rng = new Prng(seed);
  let next = 0;
  return (e) => {
    if (e.tick < next) return null;
    next = e.tick + 6 + rng.int(40);
    const r = rng.int(10);
    if (r < 7) {
      const offers: number[] = [];
      e.team[owner]!.offers.forEach((o, i) => {
        if (o >= 0) offers.push(i);
      });
      if (offers.length) return makeCmd(owner, offers[rng.int(offers.length)], 0);
    }
    if (r < 9) return makeCmd(owner, rng.int(NTILES), 0);
    return makeCmd(owner, -1, 0);
  };
}

export interface MatchOpts {
  aiBlue?: boolean;
  hashEvery?: number;
  restoreEvery?: number;
}

/** Play a whole match: AI red, scripted blue (or AI both). */
export function playMatch(seed: number, o: MatchOpts = {}): { engine: Engine; log: PackedCmd[]; hashes: number[]; config: EngineConfig } {
  const config = makeConfig({ seed, aiBlue: !!o.aiBlue, aiRed: true });
  let e = new Engine(config);
  const input = new LocalInput();
  const bot = o.aiBlue ? null : scriptedPlayer(TEAM_BLUE, seed ^ 0x5a5a);
  const hashes: number[] = [];
  while (e.phase !== PHASE_END) {
    if (bot) input.push(bot(e));
    e.step(input.take(e.tick));
    recordChecks(e);
    if (o.hashEvery && e.tick % o.hashEvery === 0) hashes.push(e.hash());
    if (o.restoreEvery && e.tick % o.restoreEvery === 0) {
      const checks = e.checks;
      e = Engine.restore(e.snapshot());
      e.checks = checks;
    }
  }
  return { engine: e, log: input.log, hashes, config };
}

/** Two scripted players, as an online match does it: the command log, and the hash every
 *  `hashEvery` ticks as the relay gets them, up to `ticks` or the end. */
export function playOnline(seed: number, ticks = Infinity, hashEvery = 30): { engine: Engine; log: PackedCmd[]; checks: [number, number][] } {
  const e = new Engine({ seed, aiBlue: false, aiRed: false });
  const input = new LocalInput();
  const bots = [scriptedPlayer(TEAM_BLUE, seed), scriptedPlayer(TEAM_RED, seed + 1)];
  const checks: [number, number][] = [];
  while (e.phase !== PHASE_END && e.tick < ticks) {
    for (const b of bots) input.push(b(e));
    e.step(input.take(e.tick));
    recordChecks(e);
    if (e.tick % hashEvery === 0) checks.push([e.tick, e.hash()]);
  }
  return { engine: e, log: input.log, checks };
}
