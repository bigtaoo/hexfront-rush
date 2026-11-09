import { describe, expect, it } from 'vitest';
import { hex, playMatch } from '../test/scriptedPlayer';
import { Engine } from './engine';
import golden from './golden.json';
import { makeCmd, type Cmd } from './input';
import { makeReplay, runReplay, type Replay } from './replay';
import { ENGINE_VERSION, OFFER_LIST, PHASE_PLAY } from './rules';

// Determinism suite for the lockstep sim. golden.json pins the final hash of six whole matches;
// change it only together with an ENGINE_VERSION bump after an intended rules change
// (UPDATE_GOLDEN=1 npx vitest run src/sim/golden.test.ts prints the new values).

const SEEDS = [1, 42, 9001] as const;

describe('golden hashes', () => {
  it('golden.json is for this engine version', () => {
    expect(golden.v).toBe(ENGINE_VERSION);
  });
  for (const seed of SEEDS) {
    it(`seed ${seed}: AI vs AI and scripted vs AI end on the pinned state`, () => {
      const ai = hex(playMatch(seed, { aiBlue: true }).engine.hash());
      const human = hex(playMatch(seed).engine.hash());
      if (process.env.UPDATE_GOLDEN) console.log(`golden v${ENGINE_VERSION} seed ${seed}: ai ${ai} human ${human}`);
      expect(ai).toBe(golden.ai[String(seed) as keyof typeof golden.ai]);
      expect(human).toBe(golden.human[String(seed) as keyof typeof golden.human]);
    });
  }
});

describe('determinism', () => {
  it('two runs agree at every 30-tick checkpoint', () => {
    const a = playMatch(77, { hashEvery: 30 });
    const b = playMatch(77, { hashEvery: 30 });
    expect(a.hashes.length).toBeGreaterThan(50);
    expect(b.hashes).toEqual(a.hashes);
  });

  it('hashing every tick and restoring snapshots change nothing', () => {
    const plain = playMatch(5150).engine.hash();
    expect(playMatch(5150, { hashEvery: 1 }).engine.hash()).toBe(plain);
    expect(hex(playMatch(5150, { restoreEvery: 457 }).engine.hash())).toBe(hex(plain));
  });

  it('a snapshot is plain JSON', () => {
    const e = new Engine({ seed: 5150, aiBlue: true, aiRed: true });
    while (e.tick < 2000) e.step(null);
    const text = JSON.stringify(e.snapshot());
    expect(text.length).toBeGreaterThan(1000);
    expect(Engine.restore(JSON.parse(text)).hash()).toBe(e.hash());
  });
});

describe('replays', () => {
  const m = playMatch(31337);
  const text = JSON.stringify(makeReplay(m.config, m.log, m.engine));

  it('reproduce the match from JSON', () => {
    const back = runReplay(JSON.parse(text) as Replay);
    expect(back.ok).toBe(true);
    expect(back.engine.hash()).toBe(m.engine.hash());
  });

  it('notice a forfeit slipped in halfway', () => {
    const bad = JSON.parse(text) as Replay;
    const mid = Math.floor(bad.log.length / 2);
    bad.log.splice(mid, 0, [bad.log[mid]![0]!, 1, -1, 0, 0, 1]);
    const res = runReplay(bad);
    expect(res.ok).toBe(false);
    expect(res.firstBad).toBeGreaterThan(0);
  });

  it('refuse a replay from another engine version', () => {
    const old = JSON.parse(text) as Replay;
    old.v = ENGINE_VERSION - 1;
    expect(() => runReplay(old)).toThrow();
  });
});

describe('commands', () => {
  it('junk commands are ignored and the state stays integer', () => {
    const e = new Engine({ seed: 3, aiRed: true });
    const junk = [
      { owner: 9, flip: 5, ff: 0 },
      { owner: 1, flip: 99999, ff: 0 },
      { owner: 1, flip: -5, ff: 0 },
      { owner: 1, flip: 2.5, ff: 0 },
      { owner: 1, flip: e.blds.find((b) => b.team === 2)!.tile, ff: 0 },
    ];
    // and blue tapping every tile that is only a red offer
    e.team[2]!.offers.forEach((o, i) => {
      if (o >= 0 && e.team[1]!.offers[i]! < 0) junk.push({ owner: 1, flip: i, ff: 0 });
    });
    const cmds = junk as unknown as Cmd[];
    expect(() => {
      for (let i = 0; i < 600; i++) {
        e.step(cmds);
        e.hash();
      }
    }).not.toThrow();
    expect(e.blds.filter((b) => b.team === 1).length).toBe(1);
    expect(Number.isInteger(e.team[1]!.gold)).toBe(true);
  });

  it('flipping an own card builds it on that tick', () => {
    const e = new Engine({ seed: 5 });
    while (e.phase !== PHASE_PLAY) e.step([]);
    const T = e.team[1]!;
    const ti = T.offers.findIndex((o) => o >= 0 && OFFER_LIST[o]!.cost <= T.gold && OFFER_LIST[o]!.kind !== 'mystery');
    expect(ti).toBeGreaterThanOrEqual(0);
    const g0 = T.gold;
    const n0 = e.blds.length;
    e.step([makeCmd(1, ti, 0)]);
    expect(e.blds.length).toBe(n0 + 1);
    expect(e.tiles[ti]!.bld).toBeTruthy();
    expect(e.tiles[ti]!.owner).toBe(1);
    expect(g0 - T.gold).toBeGreaterThan(0);
  });
});
