import { describe, expect, it } from 'vitest';
import { FaultGuard, markRestart, RECOVER_GAP_MS, REPORT_GAP_MS, RESTART_GAP_MS, restartedLately, STRIKE_MS, STRIKES } from './faultGuard';

function guard(canRestart = true): { g: FaultGuard; at(ms: number): void } {
  let t = 0;
  return { g: new FaultGuard(() => t, () => canRestart), at: (ms) => (t = ms) };
}

describe('FaultGuard', () => {
  it('recovers from the first fault and reports it', () => {
    const { g } = guard();
    expect(g.fault()).toEqual({ report: true, act: 'recover' });
  });

  it('waits while a recovery is fresh and reports at most once per gap', () => {
    const { g, at } = guard();
    g.fault();
    at(RECOVER_GAP_MS - 1);
    expect(g.fault()).toEqual({ report: false, act: 'wait' });
    at(RECOVER_GAP_MS);
    expect(g.fault()).toEqual({ report: false, act: 'recover' });
    at(REPORT_GAP_MS);
    expect(g.fault().report).toBe(true);
  });

  it('restarts once recoveries keep failing', () => {
    const { g, at } = guard();
    const acts: string[] = [];
    for (let i = 0; i < STRIKES; i++) {
      at(i * RECOVER_GAP_MS);
      acts.push(g.fault().act);
    }
    expect(acts).toEqual([...Array<string>(STRIKES - 1).fill('recover'), 'restart']);
  });

  it('rests and then recovers again where it cannot restart (it just restarted)', () => {
    const { g, at } = guard(false);
    for (let i = 0; i < STRIKES; i++) {
      at(i * RECOVER_GAP_MS);
      g.fault();
    }
    const rested = (STRIKES - 1) * RECOVER_GAP_MS;
    at(rested + STRIKE_MS - 1);
    expect(g.fault().act).toBe('wait');
    at(rested + STRIKE_MS);
    expect(g.fault().act).toBe('recover');
    at(rested + 10 * STRIKE_MS);
    expect(g.fault().act).toBe('recover');
  });

  it('forgets recoveries older than the strike window', () => {
    const { g, at } = guard();
    for (let i = 0; i < STRIKES * 3; i++) {
      at(i * STRIKE_MS);
      expect(g.fault().act).toBe('recover');
    }
  });
});

describe('restartedLately', () => {
  it('remembers a restart for RESTART_GAP_MS', () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(restartedLately(store, 1000)).toBe(false);
    markRestart(store, 1000);
    expect(restartedLately(store, 1000 + RESTART_GAP_MS - 1)).toBe(true);
    expect(restartedLately(store, 1000 + RESTART_GAP_MS)).toBe(false);
  });

  it('says no where storage is missing or throws', () => {
    const fail = (): never => {
      throw new Error('denied');
    };
    expect(restartedLately(undefined)).toBe(false);
    expect(() => markRestart({ getItem: fail, setItem: fail })).not.toThrow();
    expect(restartedLately({ getItem: fail, setItem: fail })).toBe(false);
  });
});
