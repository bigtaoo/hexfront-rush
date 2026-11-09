// The time a frame is drawn for, whole display refreshes apart. iOS stamps an animation frame
// when its callback runs, not when the display ticked: a callback a few ms late, or 20 ms late
// and the next one early, while the frames still reach the screen a refresh apart. Fed to the
// sim and the view as it is, that jitter moves the world unevenly from one even refresh to the
// next; at 30 Hz (an iPhone in Low Power Mode) one frame is a whole sim tick and a 20 ms slip
// is more than half of one, so steady motion judders. This clock advances by the refreshes
// that went by instead, each frame at least one, so every step is a whole number of refreshes.
// Stamps only ever run late, so a gap counts a refresh more only once it is LATE refreshes past
// the last: a callback 24 ms late at 30 Hz is still the next refresh, its lateness carried.
//
// The refresh is the clock's own slow average of the gaps that read as one refresh: a late gap
// and the early one after it both fall outside and drop out together, so lateness does not bend
// it. The frame gate's running estimate (FrameGate.vsync, a median of a second of gaps) only
// seeds it and tells a changed display; it wanders a few percent either side, and a clock
// stepping a few percent short of real time catches up with a double step every second or so.
// Whatever real time the clock is behind or ahead (its lag) it gains or gives back a few percent
// of every frame, under a millisecond, so it stays locked to real time both ways. A screen whose
// stamps are already even (desktop Chrome) gets them back as they are. Pure.

/** A gap this long is a pause or a stall: taken as it is, and the count starts again. */
const PAUSE_MS = 100;
/** How far past a whole refresh (in refreshes) a gap must run to count the next one. */
const LATE = 0.75;
/** Off the gate's estimate by more than this share, the display changed: measure afresh. */
const CHANGED = 0.15;
/** A gap within this share of the refresh counts towards measuring it. */
const ONE = 0.3;
/** Weight of each such gap in the average. */
const AVERAGE = 1 / 16;
/** Share of the lag a frame's step takes up. */
const PULL = 1 / 32;

export class FrameClock {
  /** The current frame's time, ms. */
  time = 0;
  private last = -Infinity;
  /** Real time not yet given to the clock (negative: given ahead), at most a refresh either way. */
  private lag = 0;
  /** The measured refresh, ms. */
  private refresh = 0;

  /** The time to draw a frame stamped `now` for, on a display the gate reads as refreshing every `vsync` ms. */
  tick(now: number, vsync: number): number {
    const gap = now - this.last;
    this.last = now;
    if (gap === Infinity) this.time = now;
    // a stamp that did not move draws the same time again (the ticker then skips the frame)
    if (!(gap > 0 && gap < PAUSE_MS && vsync > 0)) {
      if (gap > 0 && gap < Infinity) this.time += gap;
      this.lag = 0;
      return this.time;
    }
    if (!(Math.abs(this.refresh / vsync - 1) <= CHANGED)) this.refresh = vsync;
    const refresh = this.refresh;
    if (Math.abs(gap / refresh - 1) <= ONE) this.refresh += (gap - refresh) * AVERAGE;
    const step = Math.max(1, Math.floor((gap + this.lag) / refresh + 1 - LATE)) * refresh + this.lag * PULL;
    this.lag = Math.max(-refresh, Math.min(refresh, this.lag + gap - step));
    this.time += step;
    return this.time;
  }
}
