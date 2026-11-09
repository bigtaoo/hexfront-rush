// The fixed-step accumulator. Real time adds ticks' worth to `acc` (already scaled by the tick
// rate, the dev speed and the online catch-up rate); each whole tick runs one sim step. A step
// that cannot run yet (online: the relay has not confirmed that frame) stalls the loop with one
// tick banked, so it runs the moment its frame lands. At most MAX_STEPS per frame, so a long stall
// cannot freeze the page: what is left over is dropped. Returns the interpolation alpha.

export const MAX_STEPS = 40;

export class StepLoop {
  acc = 0;

  reset(): void {
    this.acc = 0;
  }

  /** `step` runs one tick and returns false when it could not (nothing to step yet). */
  run(ticks: number, step: () => boolean): number {
    this.acc += ticks;
    let steps = 0;
    while (this.acc >= 1 && steps < MAX_STEPS) {
      if (!step()) {
        this.acc = 1;
        break;
      }
      this.acc -= 1;
      steps++;
    }
    if (steps >= MAX_STEPS) this.acc = 0;
    return Math.min(1, this.acc);
  }
}
