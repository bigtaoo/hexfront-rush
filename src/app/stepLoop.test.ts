import { describe, expect, it } from 'vitest';
import { MAX_STEPS, StepLoop } from './stepLoop';

describe('StepLoop', () => {
  it('runs one step per whole tick and keeps the fraction as alpha', () => {
    const l = new StepLoop();
    let n = 0;
    expect(l.run(2.25, () => (n++, true))).toBeCloseTo(0.25);
    expect(n).toBe(2);
    expect(l.run(0.5, () => (n++, true))).toBeCloseTo(0.75);
    expect(n).toBe(2);
  });

  it('banks exactly one tick on a stall, so the step runs as soon as it can', () => {
    const l = new StepLoop();
    let ok = false;
    let n = 0;
    expect(l.run(5, () => ok && (n++, true))).toBe(1);
    expect(l.acc).toBe(1);
    ok = true;
    l.run(0, () => (n++, true));
    expect(n).toBe(1);
  });

  it('drops what is left after MAX_STEPS in one frame', () => {
    const l = new StepLoop();
    let n = 0;
    expect(l.run(MAX_STEPS * 3, () => (n++, true))).toBe(0);
    expect(n).toBe(MAX_STEPS);
    expect(l.acc).toBe(0);
  });

  it('starts from zero after reset', () => {
    const l = new StepLoop();
    l.run(0.9, () => true);
    l.reset();
    expect(l.acc).toBe(0);
  });
});
