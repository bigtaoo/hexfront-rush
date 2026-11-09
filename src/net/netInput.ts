// Client-side input source for lockstep (after daydayup's NetInputSource).
// Frames arrive from the relay in batches. take(tick) hands the sim a frame only once the relay
// has closed it (tick <= confirmedTo); otherwise it returns null and the loop waits. Nothing is
// ever predicted inside the sim, so every client steps the identical command stream.
//
// The play head trails the newest confirmed frame by bufferFrames, so the 100 ms batch rhythm
// and network jitter are absorbed instead of showing up as stutter. The loop reads backlog() to
// run faster when it falls behind (tab in background, reconnect) and to ease off when it is
// eating into the buffer.

import { packCmd, unpackCmd, type Cmd, type InputSource, type PackedCmd } from '../sim/input';
import type { FrameBatch, PackedFrame } from './frameBroadcast';

export interface NetInputOptions {
  startFrame?: number;
  bufferFrames?: number;
  seat?: number;
  now?: () => number;
}

export class NetInput implements InputSource {
  readonly startFrame: number;
  readonly bufferFrames: number;
  readonly seat: number;
  confirmedTo: number;
  /** frame -> commands */
  private frames = new Map<number, Cmd[]>();
  /** Packed commands, for replays. */
  log: PackedCmd[] = [];
  /** Send times of own commands awaiting confirmation (FIFO). */
  private sent: number[] = [];
  /** frame -> send time of an own command landing there */
  private ownAt = new Map<number, number>();
  /** Measured input -> applied delay (EMA), shown in the status line. */
  delayMs = 150;
  private now: () => number;

  constructor(o: NetInputOptions = {}) {
    this.startFrame = o.startFrame || 0;
    this.bufferFrames = o.bufferFrames === undefined ? 3 : o.bufferFrames;
    this.seat = o.seat || 0;
    this.confirmedTo = this.startFrame - 1;
    this.now = o.now || (() => performance.now());
  }

  /** Remember that an own command left now (call right after sending it). */
  noteSent(): void {
    this.sent.push(this.now());
  }

  private addFrames(frames: readonly PackedFrame[], to: number): void {
    for (const fr of frames) {
      const f = fr[0];
      if (f <= this.confirmedTo || this.frames.has(f)) continue; // duplicate after resync
      const list: Cmd[] = [];
      for (const a of fr[1]) {
        const c = unpackCmd(a);
        if (!c) continue;
        list.push(c);
        this.log.push(packCmd(c));
        if (c.owner === this.seat && this.sent.length) this.ownAt.set(f, this.sent.shift()!);
      }
      this.frames.set(f, list);
    }
    if (to > this.confirmedTo) this.confirmedTo = to;
  }

  /** frame_batch { to, frames } */
  onBatch(msg: FrameBatch): void {
    this.addFrames(msg.frames, msg.to);
  }

  /** conn_resync { log, curFrame }: everything after what we had, rebuilt from the relay log. */
  onResync(msg: { log: number[][]; curFrame: number }): void {
    const by = new Map<number, number[][]>();
    for (const a of msg.log) {
      if (a[0] <= this.confirmedTo) continue;
      let l = by.get(a[0]);
      if (!l) {
        l = [];
        by.set(a[0], l);
      }
      l.push(a);
    }
    const frames: PackedFrame[] = [];
    for (const [f, l] of by) frames.push([f, l]);
    frames.sort((a, b) => a[0] - b[0]);
    this.sent.length = 0;
    this.addFrames(frames, msg.curFrame);
  }

  /** The tick the loop should be at: newest confirmed frame minus the jitter buffer. */
  target(): number {
    return Math.max(this.startFrame, this.confirmedTo - this.bufferFrames);
  }
  backlog(tick = 0): number {
    return this.target() - tick;
  }
  ready(tick: number): boolean {
    return tick <= this.confirmedTo;
  }
  take(tick: number): Cmd[] | null {
    if (tick > this.confirmedTo) return null;
    const l = this.frames.get(tick) || [];
    this.frames.delete(tick);
    const t = this.ownAt.get(tick);
    if (t !== undefined) {
      this.ownAt.delete(tick);
      const d = this.now() - t;
      this.delayMs += (d - this.delayMs) * 0.2;
    }
    return l;
  }
}

/** Catch-up ladder: sim speed multiplier for a given backlog in ticks. */
export function catchUpRate(backlog: number): number {
  if (backlog > 900) return 5;
  if (backlog > 300) return 3;
  if (backlog > 30) return 2;
  if (backlog > 6) return 1.25;
  if (backlog < 0) return 0.85; // eating into the jitter buffer: slow down a touch
  return 1;
}
