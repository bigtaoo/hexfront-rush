import { describe, expect, it } from 'vitest';
import { scriptedPlayer } from '../test/scriptedPlayer';
import { Engine } from '../sim/engine';
import { TICK_RATE } from '../sim/fixed';
import { Prng } from '../sim/prng';
import { runReplay } from '../sim/replay';
import { ENGINE_VERSION } from '../sim/rules';
import { makeConfig } from '../sim/setup';
import { FrameBroadcast, type FrameBatch } from './frameBroadcast';
import { catchUpRate, NetInput } from './netInput';

// Loopback lockstep: the relay's frame clock and two clients over a simulated jittery network,
// on a virtual millisecond clock. Both clients must hold identical state at every checkpoint,
// and the relay's log replayed offline must land on the same state.

interface Flight<T> {
  at: number;
  msg: T;
}
interface Client {
  seat: number;
  net: NetInput;
  engine: Engine;
  bot: ReturnType<typeof scriptedPlayer>;
  acc: number;
  checks: Map<number, number>;
  lastSentTick: number;
  down: Flight<FrameBatch>[];
  up: Flight<number[]>[];
  offline: [number, number] | null;
}

function loopback(seed: number, o: { ms: number; jitter?: number; offline?: [number, number] }) {
  const rng = new Prng(seed * 7 + 1);
  const fb = new FrameBroadcast({ startFrame: 0 });
  let nowMs = 0;
  const clients: Client[] = [1, 2].map((seat) => ({
    seat,
    net: new NetInput({ seat, startFrame: 0, now: () => nowMs }),
    engine: new Engine({ seed, aiBlue: false, aiRed: false }),
    bot: scriptedPlayer(seat, seed * 31 + seat),
    acc: 0,
    checks: new Map(),
    lastSentTick: -1,
    // in-flight messages, FIFO per direction (TCP keeps order)
    down: [],
    up: [],
    offline: null,
  }));
  if (o.offline) clients[1]!.offline = o.offline; // seat 2 disconnects, then resumes
  const lat = () => 20 + rng.int(o.jitter || 120);
  const deliver = <T,>(q: Flight<T>[], fn: (m: T) => void) => {
    while (q.length && q[0]!.at <= nowMs) fn(q.shift()!.msg);
  };
  const isOff = (c: Client) => !!c.offline && nowMs >= c.offline[0] && nowMs < c.offline[1];
  let maxBacklog = 0;
  let stalls = 0;
  for (nowMs = 0; nowMs < o.ms; nowMs++) {
    if (nowMs % 100 === 0) {
      const b = fb.tick();
      for (const c of clients) {
        if (isOff(c)) continue;
        const prev = c.down.length ? c.down[c.down.length - 1]!.at : 0;
        c.down.push({ at: Math.max(prev, nowMs + lat()), msg: b });
      }
    }
    for (const c of clients) {
      if (c.offline && nowMs === c.offline[1]) {
        // resume: the relay resends everything after what we have
        c.down.length = 0;
        c.net.onResync({ log: fb.logSince(c.net.confirmedTo), curFrame: fb.curFrame });
      }
      deliver(c.up, (m) => fb.submit(c.seat, m[0]!, m[1]!, m[2]!, m[3]!, 0));
      deliver(c.down, (m) => c.net.onBatch(m));
      // the client's render loop at ~60 fps; sim at 30 Hz with the catch-up ladder
      if (nowMs % 16 !== 0) continue;
      const back = c.net.backlog(c.engine.tick);
      if (back > maxBacklog) maxBacklog = back;
      c.acc += ((16 * TICK_RATE) / 1000) * catchUpRate(back);
      let steps = 0;
      while (c.acc >= 1 && steps < 40) {
        const cmds = c.net.take(c.engine.tick);
        if (!cmds) {
          stalls++;
          c.acc = 0;
          break;
        }
        c.engine.step(cmds);
        c.acc -= 1;
        steps++;
        if (c.engine.tick % 30 === 0) c.checks.set(c.engine.tick, c.engine.hash());
      }
      if (!isOff(c) && c.engine.tick !== c.lastSentTick) {
        c.lastSentTick = c.engine.tick;
        const cmd = c.bot(c.engine);
        if (cmd) {
          const prev = c.up.length ? c.up[c.up.length - 1]!.at : 0;
          c.up.push({ at: Math.max(prev, nowMs + lat()), msg: [cmd.flip, 0, 0, cmd.ff] });
          c.net.noteSent();
        }
      }
    }
  }
  const [a, b] = clients as [Client, Client];
  let compared = 0;
  let mismatch = -1;
  for (const [t, h] of a.checks) {
    if (!b.checks.has(t)) continue;
    compared++;
    if (b.checks.get(t) !== h && mismatch < 0) mismatch = t;
  }
  const minTick = Math.min(a.engine.tick, b.engine.tick);
  const rep = { v: ENGINE_VERSION, config: makeConfig({ seed }), log: fb.log, endTick: minTick, hash: 0, checks: [], result: null };
  const offline = runReplay(rep, minTick).engine;
  const ref = a.engine.tick === minTick ? a.engine : b.engine;
  return { compared, mismatch, ticks: [a.engine.tick, b.engine.tick], cmds: fb.log.length, maxBacklog, stalls, replayOk: offline.hash() === ref.hash() };
}

describe('loopback lockstep', () => {
  it('two clients over 120 ms jitter stay identical and keep up', () => {
    const r = loopback(2024, { ms: 60000, jitter: 120 });
    expect(r.mismatch).toBe(-1);
    expect(r.compared).toBeGreaterThan(50);
    expect(r.cmds).toBeGreaterThan(20);
    expect(r.replayOk).toBe(true);
    for (const t of r.ticks) expect(t).toBeGreaterThan(60 * TICK_RATE - 30);
  });

  it('a 12 s disconnect and resume catches up and stays in sync', () => {
    const r = loopback(77, { ms: 70000, jitter: 300, offline: [20000, 32000] });
    expect(r.mismatch).toBe(-1);
    expect(r.replayOk).toBe(true);
    expect(Math.abs(r.ticks[0]! - r.ticks[1]!)).toBeLessThan(20);
  });
});

describe('frame broadcast', () => {
  it('never stamps a command into a closed frame and orders a frame by owner', () => {
    const fb = new FrameBroadcast({ startFrame: 0 });
    fb.tick();
    expect(fb.submit(2, 7, 0, 0, 0, 0)).toBe(3);
    expect(fb.submit(1, 8, 0, 0, 0, 0)).toBe(3);
    const b = fb.tick();
    expect(b.to).toBe(5);
    expect(b.frames).toEqual([[3, [[3, 1, 8, 0, 0, 0], [3, 2, 7, 0, 0, 0]]]]);
    expect(fb.logSince(2)).toHaveLength(2);
    expect(fb.logSince(3)).toHaveLength(0);
  });
});
