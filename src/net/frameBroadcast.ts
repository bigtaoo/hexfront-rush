// The relay's frame clock (after daydayup's engine/net/FrameBroadcast). The relay never runs the
// sim: it only decides *which frame* each command belongs to and tells everyone, in order. A
// metronome calls tick() every FB_BATCH_MS; each call closes framesPerBatch frames and returns
// them as one batch. Frames advance at TICK_RATE on average, so frame == sim tick.
//
// A command submitted while frames ..cur are closed lands on cur+1 (+ `into` for scheduled
// commands), never in the past, so a batch once sent is final. Within a frame, commands are
// ordered by owner and then by arrival, which is all the sim needs (it applies by owner).
// Packed command: [frame, owner, flip, 0, 0, ff].
//
// No imports and only erasable TypeScript: Node runs this file directly for the relay
// (server/relay.ts) as well as bundling it for the tests.

export const FB_FRAMES_PER_BATCH = 3;
export const FB_BATCH_MS = 100;

export type PackedFrame = [frame: number, cmds: number[][]];
export interface FrameBatch {
  to: number;
  frames: PackedFrame[];
}

export class FrameBroadcast {
  readonly framesPerBatch: number;
  readonly startFrame: number;
  /** Last closed frame. */
  curFrame: number;
  /** frame -> packed commands waiting for it to close */
  private pending = new Map<number, number[][]>();
  /** Every closed command, in frame order. */
  log: number[][] = [];

  constructor(opts: { framesPerBatch?: number; startFrame?: number } = {}) {
    this.framesPerBatch = opts.framesPerBatch || FB_FRAMES_PER_BATCH;
    this.startFrame = opts.startFrame || 0;
    this.curFrame = this.startFrame - 1;
  }

  /** Stamp a command onto the next open frame. Returns the frame it landed on. */
  submit(owner: number, flip: number, r1: number, r2: number, ff: number, into: number): number {
    const frame = this.curFrame + 1 + Math.max(0, into | 0);
    let l = this.pending.get(frame);
    if (!l) {
      l = [];
      this.pending.set(frame, l);
    }
    l.push([frame, owner | 0, flip | 0, r1 | 0, r2 | 0, ff ? 1 : 0]);
    return frame;
  }

  /** Close the next batch of frames: { to, frames: [[frame, [packed...]], ...] } (sparse). */
  tick(): FrameBatch {
    const from = this.curFrame + 1, to = this.curFrame + this.framesPerBatch;
    const frames: PackedFrame[] = [];
    for (let f = from; f <= to; f++) {
      const l = this.pending.get(f);
      if (!l) continue;
      this.pending.delete(f);
      const sorted = l
        .map((c, i) => [c, i] as const)
        .sort((a, b) => a[0][1] - b[0][1] || a[1] - b[1])
        .map((p) => p[0]);
      frames.push([f, sorted]);
      for (const c of sorted) this.log.push(c);
    }
    this.curFrame = to;
    return { to, frames };
  }

  /** Every closed command after `frame`, for a reconnecting client. */
  logSince(frame: number): number[][] {
    const out: number[][] = [];
    for (const c of this.log) if (c[0] > frame) out.push(c);
    return out;
  }
}
