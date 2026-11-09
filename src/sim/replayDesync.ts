// Whose client went wrong in an online match that went out of sync. The relay keeps the match up
// to the last checkpoint both seats agreed on, plus the commands from there to the first one they
// did not (server/collector.ts onlineDoc); played on to that tick, this engine's hash matches the
// seat that played it right, and the other seat's client is the one to look at.

import { runReplay, type Replay } from './replay';
import { parseReplay } from './replayShape';
import { ENGINE_VERSION } from './rules';

export interface Desync {
  tick: number;
  /** The hashes seat 1 (blue) and seat 2 (red) sent for `tick`. */
  h: [number, number];
  /** The commands from the replay's end up to `tick`. */
  log: number[][];
}

export interface DesyncVerdict {
  tick: number;
  /** This engine's hash at `tick`; null when it could not play there. */
  hash: number | null;
  /** The seats whose hash it matches (1 blue, 2 red). */
  agree: number[];
  /** Why it could not play there. */
  note?: string;
}

export function desyncVerdict(rep: Replay, d: Desync): DesyncVerdict {
  const out: DesyncVerdict = { tick: d.tick, hash: null, agree: [] };
  if (rep.v !== ENGINE_VERSION) return { ...out, note: `engine v${rep.v}, this is v${ENGINE_VERSION}` };
  const on = parseReplay({ ...rep, log: [...rep.log, ...(d.log ?? [])], endTick: d.tick, hash: 0, result: null });
  if (!on) return { ...out, note: 'the commands up to it do not read' };
  try {
    const run = runReplay(on);
    if (run.firstBad >= 0) return { ...out, note: `already off at the agreed checkpoint ${run.firstBad}` };
    const h = run.engine.hash();
    return { ...out, hash: h, agree: [1, 2].filter((s) => d.h[s - 1] === h) };
  } catch (e) {
    return { ...out, note: e instanceof Error ? e.message : String(e) };
  }
}

const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
const SEAT = ['', 'blue', 'red'];

/** One line for `npm run replays`. */
export function formatVerdict(v: DesyncVerdict, d: Desync): string {
  if (v.hash === null) return `tick ${v.tick}: ${v.note ?? 'not played'}`;
  const who = v.agree.length ? `${v.agree.map((s) => SEAT[s]).join(' and ')} agree${v.agree.length === 1 ? 's' : ''} with it` : 'neither seat agrees with it';
  return `tick ${v.tick}: engine ${hex(v.hash)}, blue ${hex(d.h[0])}, red ${hex(d.h[1])}: ${who}`;
}
