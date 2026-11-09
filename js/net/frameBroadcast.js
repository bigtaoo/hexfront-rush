'use strict';
// The relay's frame clock (after daydayup's engine/net/FrameBroadcast). The relay never runs
// the sim: it only decides *which frame* each command belongs to and tells everyone, in order.
// A metronome calls tick() every BATCH_MS; each call closes framesPerBatch frames and returns
// them as one batch. Frames advance at TICK_RATE on average, so frame == sim tick.
//
// A command submitted while frames ..cur are closed lands on cur+1 (+ `into` for scheduled
// commands), never in the past, so a batch once sent is final. Within a frame, commands are
// ordered by owner and then by arrival, which is all the sim needs (it applies by owner).
// Packed command: [frame, owner, goto, kx, ky, ff].

const FB_FRAMES_PER_BATCH = 3;
const FB_BATCH_MS = 100;

class FrameBroadcast {
  constructor(opts) {
    const o = opts || {};
    this.framesPerBatch = o.framesPerBatch || FB_FRAMES_PER_BATCH;
    this.startFrame = o.startFrame || 0;
    this.curFrame = this.startFrame - 1;   // last closed frame
    this.pending = new Map();              // frame -> [packed]
    this.log = [];                         // every closed command, in frame order
  }
  /** Stamp a command onto the next open frame. Returns the frame it landed on. */
  submit(owner, goto, kx, ky, ff, into) {
    const frame = this.curFrame + 1 + Math.max(0, into | 0);
    let l = this.pending.get(frame);
    if (!l) { l = []; this.pending.set(frame, l); }
    l.push([frame, owner | 0, goto | 0, kx | 0, ky | 0, ff ? 1 : 0]);
    return frame;
  }
  /** Close the next batch of frames: { to, frames: [[frame, [packed...]], ...] } (sparse). */
  tick() {
    const from = this.curFrame + 1, to = this.curFrame + this.framesPerBatch;
    const frames = [];
    for (let f = from; f <= to; f++) {
      const l = this.pending.get(f);
      if (!l) continue;
      this.pending.delete(f);
      const sorted = l.map((c, i) => [c, i]).sort((a, b) => a[0][1] - b[0][1] || a[1] - b[1]).map((p) => p[0]);
      frames.push([f, sorted]);
      for (const c of sorted) this.log.push(c);
    }
    this.curFrame = to;
    return { to, frames };
  }
  /** Every closed command after `frame`, for a reconnecting client. */
  logSince(frame) {
    const out = [];
    for (const c of this.log) if (c[0] > frame) out.push(c);
    return out;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { FrameBroadcast, FB_FRAMES_PER_BATCH, FB_BATCH_MS };
