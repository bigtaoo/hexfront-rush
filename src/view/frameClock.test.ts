import { describe, expect, it } from 'vitest';
import { FrameClock } from './frameClock';

const V60 = 1000 / 60, V30 = 1000 / 30, V120 = 1000 / 120;

/** How late in turn an iOS callback runs: never early - the display has already ticked. */
const LATE = [0, 7, 3, 5, 9, 6, 2, 8, 4, 6];
/** How far a step may sit off a whole refresh: the share of the lag a frame gives back. */
const CATCH_UP = 0.3;

/** The times a clock gives for a run of stamps, and the steps between them. */
function run(stamps: number[], vsync: number, c = new FrameClock()): { times: number[]; steps: number[] } {
  const times = stamps.map((s) => c.tick(s, vsync));
  const steps = times.slice(1).map((t, i) => t - times[i]!);
  return { times, steps };
}

/** Even stamps, as desktop Chrome hands them out. */
const even = (n: number, v: number, t0 = 1000): number[] => Array.from({ length: n }, (_, i) => t0 + i * v);

describe('frame clock', () => {
  it('hands even stamps straight back', () => {
    const { times, steps } = run(even(90, V60), V60);
    expect(times[0]).toBe(1000);
    for (const s of steps) expect(s).toBeCloseTo(V60, 6);
  });

  it('steps a whole number of refreshes however the stamps jitter', () => {
    // iOS: the callback runs late by up to half a refresh, the frame still a refresh after the last
    const stamps = even(60, V60).map((t, i) => t + LATE[i % LATE.length]!);
    const { steps } = run(stamps, V60);
    for (const s of steps) {
      const refreshes = s / V60;
      expect(Math.abs(refreshes - Math.round(refreshes))).toBeLessThan(CATCH_UP);
      expect(Math.round(refreshes)).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps up with real time under jitter (no drift either way)', () => {
    // a run of late frames rounds up again and again: unless the surplus is given back the whole
    // game speeds up on a phone that is drawing a heavy scene
    const stamps = even(600, V60).map((t, i) => t + LATE[i % LATE.length]!);
    const { times } = run(stamps, V60);
    const drift = times[times.length - 1]! - stamps[stamps.length - 1]!;
    expect(Math.abs(drift)).toBeLessThan(V60 / 2);
  });

  it('carries a late stamp rather than counting it as two refreshes', () => {
    // 30 Hz (Low Power Mode): a callback 24 ms late is still the next refresh
    const c = new FrameClock();
    c.tick(1000, V30);
    c.tick(1000 + V30, V30);
    const a = c.tick(1000 + V30 + V30 + 24, V30);
    const b = c.tick(1000 + V30 * 3 + 24, V30);
    expect(a - (1000 + V30 * 2)).toBeCloseTo(0, 1);
    expect(Math.abs(b - a - V30)).toBeLessThan(V30 * CATCH_UP);
  });

  it('counts a frame that really was skipped as two refreshes', () => {
    const c = new FrameClock();
    c.tick(1000, V60);
    c.tick(1000 + V60, V60);
    const a = c.tick(1000 + V60, V60); // same stamp: the ticker skips the frame
    expect(a).toBeCloseTo(1000 + V60, 6);
    const b = c.tick(1000 + V60 * 3, V60);
    expect(b - a).toBeCloseTo(V60 * 2, 1);
  });

  it('takes a stall as it is and starts counting again', () => {
    const c = new FrameClock();
    c.tick(1000, V60);
    const stalled = c.tick(1000 + 400, V60); // a tab in the background, a long GC
    expect(stalled).toBeCloseTo(1400, 6);
    const next = c.tick(1000 + 400 + V60, V60);
    expect(next - stalled).toBeCloseTo(V60, 6);
  });

  it('never goes backwards on a stamp that does', () => {
    const c = new FrameClock();
    const a = c.tick(1000, V60);
    const b = c.tick(990, V60);
    expect(b).toBe(a);
    const d = c.tick(1000 + V60, V60);
    expect(d).toBeGreaterThanOrEqual(b);
  });

  it('measures afresh when the display changes', () => {
    const c = new FrameClock();
    run(even(30, V60), V60, c);
    const { steps } = run(even(30, V120, 2000), V120, c);
    for (const s of steps.slice(2)) expect(s).toBeCloseTo(V120, 1);
  });

  it('follows a display whose real refresh is off the gate estimate', () => {
    // the gate's median says 60 Hz, the panel really runs at 59.3
    const real = 1000 / 59.3;
    const { steps, times } = run(even(600, real), V60);
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    expect(mean).toBeCloseTo(real, 1);
    expect(Math.abs(times[times.length - 1]! - (1000 + 599 * real))).toBeLessThan(V60);
  });

  it('gives a 30 Hz screen whole ticks', () => {
    const jit = [0, 11, 5, 14, 3, 8];
    const stamps = even(120, V30).map((t, i) => t + jit[i % jit.length]!);
    const { steps, times } = run(stamps, V30);
    for (const s of steps) {
      const refreshes = s / V30;
      expect(Math.abs(refreshes - Math.round(refreshes))).toBeLessThan(CATCH_UP);
    }
    expect(Math.abs(times[times.length - 1]! - stamps[stamps.length - 1]!)).toBeLessThan(V30);
  });
});
