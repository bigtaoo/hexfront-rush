// The replay tools: the shape check (replayShape.ts), playing back with hooks (replay.ts),
// the statistics (replayStats.ts, replayReport.ts) and the desync verdict (replayDesync.ts).

import { describe, expect, it } from 'vitest';
import { playMatch, playOnline } from '../test/scriptedPlayer';
import { Engine } from './engine';
import type { PackedCmd } from './input';
import { checkReplay, makeReplay, ReplayInput, runReplay, type Replay } from './replay';
import { desyncVerdict, formatVerdict } from './replayDesync';
import { formatReport } from './replayReport';
import { MAX_REPLAY_CMDS, parseReplay } from './replayShape';
import { addReplay, newStats } from './replayStats';
import { ENGINE_VERSION, TEAM_BLUE } from './rules';

const solo = playMatch(4242);
const soloReplay = makeReplay(solo.config, solo.log, solo.engine);

describe('replay shape', () => {
  it('keeps a replay through JSON, and drops unknown keys', () => {
    const back = parseReplay({ ...JSON.parse(JSON.stringify(soloReplay)), extra: 1 });
    expect(back).toEqual(soloReplay);
    expect(checkReplay(back!)).toBe(true);
  });

  it('says no to anything off', () => {
    const j = () => JSON.parse(JSON.stringify(soloReplay)) as Record<string, unknown> & Replay;
    const bad: unknown[] = [null, 7, [], 'x', {}];
    const tweaks: ((r: ReturnType<typeof j>) => void)[] = [
      (r) => (r.v = -1),
      (r) => (r.endTick = 1e9),
      (r) => (r.hash = -1),
      (r) => (r.config = { seed: 1.5, aiBlue: false, aiRed: true }),
      (r) => ((r.config as unknown as Record<string, unknown>).aiRed = 'yes'),
      (r) => r.log.push([r.endTick + 1, 1, 0, 0, 0, 0]),
      (r) => r.log.push([0, 3, 0, 0, 0, 0]),
      (r) => r.log.push([0, 1, 0.5, 0, 0, 0]),
      (r) => r.log.push([0, 1, 0, 0, 0] as unknown as PackedCmd),
      (r) => (r.log = Array.from({ length: MAX_REPLAY_CMDS + 1 }, () => [0, 1, 0, 0, 0, 0])),
      (r) => r.checks.push([0, 1]),
      (r) => (r.result = { winner: 3, reason: 'base', blue: 1, red: 1, tick: 1 }),
      (r) => (r.result = { winner: 1, reason: 'luck' as 'base', blue: 1, red: 1, tick: 1 }),
    ];
    for (const t of tweaks) {
      const r = j();
      t(r);
      bad.push(r);
    }
    for (const b of bad) expect(parseReplay(b)).toBeNull();
  });
});

describe('playing back', () => {
  it('runs the hooks before each command and each step', () => {
    let cmds = 0;
    let steps = 0;
    let seenTick = -1;
    const run = runReplay(soloReplay, undefined, undefined, {
      beforeCommand: (e, c) => {
        expect(c.tick).toBe(e.tick);
        cmds++;
      },
      beforeStep: (e) => {
        expect(e.tick).toBe(seenTick + 1);
        seenTick = e.tick;
        steps++;
      },
    });
    expect(run.ok).toBe(true);
    expect(cmds).toBe(solo.log.length);
    expect(steps).toBe(soloReplay.endTick);
  });

  it('checkReplay catches a changed command and another engine version', () => {
    const bad = JSON.parse(JSON.stringify(soloReplay)) as Replay;
    // the second half of the commands goes (one alone can be a no-op: the scripted player retries)
    bad.log.length = Math.floor(bad.log.length / 2);
    expect(checkReplay(bad)).toBe(false);
    expect(checkReplay({ ...soloReplay, v: ENGINE_VERSION + 1 })).toBe(false);
  });

  it('a ReplayInput feeds the match back and stops at its end', () => {
    const cut = makeReplay(solo.config, solo.log.filter((c) => c[0] < 1500), runReplay(soloReplay, 1500).engine);
    const src = new ReplayInput(cut);
    const e = new Engine(cut.config);
    for (;;) {
      const cmds = src.take(e.tick);
      if (!cmds) break;
      e.step(cmds);
    }
    expect(e.tick).toBe(1500);
    expect(e.hash()).toBe(cut.hash);
    expect(src.log).toEqual(cut.log);
    expect(src.take(1500)).toBeNull();
  });
});

describe('replay statistics', () => {
  it('counts solo and AI matches, and refuses broken ones', () => {
    const s = newStats();
    expect(addReplay(s, soloReplay)).toBe('ok');
    const ai = playMatch(77, { aiBlue: true });
    expect(addReplay(s, makeReplay(ai.config, ai.log, ai.engine))).toBe('ok');
    expect(addReplay(s, { ...soloReplay, v: ENGINE_VERSION - 1 })).toBe('old');
    expect(addReplay(s, { ...soloReplay, hash: soloReplay.hash ^ 1 })).toBe('desync');
    expect([s.played, s.oldVersion, s.desynced]).toEqual([2, 1, 1]);
    const k = s.kinds.get('solo')!;
    expect(k.matches).toBe(1);
    expect(k.ended).toBe(1);
    expect(k.player.seats).toBe(1);
    expect(k.ai.seats).toBe(1);
    // the scripted player tapped cards: its flips (and their misses) are counted from the commands
    expect(k.player.flips).toBe(solo.log.filter((c) => c[1] === TEAM_BLUE && c[2] >= 0).length);
    expect(k.player.firstFlips).toBe(1);
    const built = [...k.player.built.values(), ...k.ai.built.values()].reduce((a, b) => a + b, 0);
    expect(built).toBeGreaterThan(0);
    expect(s.kinds.get('ai')!.ai.seats).toBe(2);
    const text = formatReport(s);
    expect(text).toContain('replays played 2, other engine version 1, desynced 1');
    expect(text).toContain('solo: 1 matches, 1 played to the end');
    expect(text).toContain('ai: 1 matches');
  });

  it('counts a match cut short as not ended', () => {
    const s = newStats();
    const at = runReplay(soloReplay, 900).engine;
    expect(addReplay(s, makeReplay(solo.config, solo.log.filter((c) => c[0] < 900), at))).toBe('ok');
    expect(s.kinds.get('solo')!.ended).toBe(0);
  });
});

describe('desync verdict', () => {
  const m = playOnline(99, 1200);
  const agreedEnd = 900;
  const rep: Replay = {
    v: ENGINE_VERSION,
    config: { seed: 99, aiBlue: false, aiRed: false },
    log: m.log.filter((c) => c[0] < agreedEnd),
    endTick: agreedEnd,
    hash: m.checks.find((c) => c[0] === agreedEnd)![1],
    checks: m.checks.filter((c) => c[0] <= agreedEnd),
    result: null,
  };
  const right = m.checks.find((c) => c[0] === 1200)![1];
  const after = m.log.filter((c) => c[0] >= agreedEnd && c[0] < 1200);

  it('plays on to the disagreement and names the seat that played it right', () => {
    expect(checkReplay(rep)).toBe(true);
    const d = { tick: 1200, h: [right ^ 0xff, right] as [number, number], log: after };
    const v = desyncVerdict(rep, d);
    expect(v).toEqual({ tick: 1200, hash: right, agree: [2] });
    expect(formatVerdict(v, d)).toMatch(/red agrees with it$/);
  });

  it('says when neither seat agrees, or it cannot play there', () => {
    const d = { tick: 1200, h: [1, 2] as [number, number], log: after };
    expect(desyncVerdict(rep, d).agree).toEqual([]);
    expect(formatVerdict(desyncVerdict(rep, d), d)).toMatch(/neither seat/);
    expect(desyncVerdict({ ...rep, v: 0 }, d).note).toMatch(/engine v0/);
  });
});
