import { describe, expect, it } from 'vitest';
import { catchUpRate, NetInput } from './netInput';
import type { FrameBatch, PackedFrame } from './frameBroadcast';

// The client's half of lockstep on its own: what take() hands the loop, and the input delay it
// reads off the stream. loopback.test.ts drives the same class against a real frame clock; this
// one pins the cases a loopback never produces — a command the relay swallows, two of them in one
// frame, a resync cutting across both.

const SEAT = 1;
/** A packed command: [tick, owner, flip, 0, 0, ff]. The frame is what carries it, so the tick in
 *  here is only what the relay stamped. */
const cmd = (owner: number, flip = 3): number[] => [0, owner, flip, 0, 0, 0];
const batch = (to: number, frames: PackedFrame[]): FrameBatch => ({ to, frames });

function fresh(): { net: NetInput; at: (ms: number) => void } {
  let nowMs = 0;
  const net = new NetInput({ seat: SEAT, startFrame: 0, bufferFrames: 3, now: () => nowMs });
  return { net, at: (ms) => void (nowMs = ms) };
}

describe('net input', () => {
  it('holds the loop until the relay closes the frame', () => {
    const { net } = fresh();
    expect(net.take(0)).toBeNull();
    net.onBatch(batch(2, [[0, [cmd(2)]]]));
    expect(net.take(0)).toHaveLength(1);
    // a frame the relay closed with nothing in it is still a frame
    expect(net.take(1)).toEqual([]);
    expect(net.take(3)).toBeNull();
  });

  it('runs the loop behind the newest confirmed frame by the jitter buffer', () => {
    const { net } = fresh();
    expect(net.target()).toBe(0);
    net.onBatch(batch(20, []));
    expect(net.target()).toBe(17);
    expect(net.backlog(5)).toBe(12);
    expect(net.backlog(17)).toBe(0);
    expect(net.backlog(25)).toBe(-8);
  });

  it('measures the delay from the send to the frame being stepped', () => {
    const { net, at } = fresh();
    expect(net.delayMs).toBe(150);
    at(0);
    net.noteSent();
    at(120);
    net.onBatch(batch(4, [[4, [cmd(SEAT)]]]));
    at(200);
    net.take(4);
    // one fifth of the way from 150 to 200
    expect(net.delayMs).toBeCloseTo(160, 6);
    // the other seat's commands say nothing about our own delay
    at(9000);
    net.onBatch(batch(5, [[5, [cmd(2)]]]));
    net.take(5);
    expect(net.delayMs).toBeCloseTo(160, 6);
  });

  it('gives up on a command the relay never confirmed instead of skewing every later one', () => {
    const { net, at } = fresh();
    at(0);
    net.noteSent(); // swallowed: the room was over, or the link died on the way
    at(6000);
    net.noteSent();
    at(6050);
    net.onBatch(batch(9, [[9, [cmd(SEAT)]]]));
    at(6100);
    net.take(9);
    // 100 ms, not the 6100 the stale entry would have claimed
    expect(net.delayMs).toBeCloseTo(140, 6);
  });

  it('pairs two own commands in one frame with the older send, and spends both', () => {
    const { net, at } = fresh();
    at(0);
    net.noteSent();
    at(100);
    net.noteSent();
    at(150);
    net.onBatch(batch(2, [[2, [cmd(SEAT, 3), cmd(SEAT, 4)]]]));
    at(300);
    expect(net.take(2)).toHaveLength(2);
    // the first tap waited 300 ms, and that is what the player felt
    expect(net.delayMs).toBeCloseTo(180, 6);
    const was = net.delayMs;
    // nothing is left over to pair with a later frame
    net.onBatch(batch(6, [[6, [cmd(SEAT)]]]));
    at(5000);
    net.take(6);
    expect(net.delayMs).toBe(was);
  });

  it('rebuilds the stream on a resync without double-counting or stale delays', () => {
    const { net, at } = fresh();
    at(0);
    net.noteSent();
    net.onBatch(batch(3, [[3, [cmd(SEAT)]]]));
    net.noteSent(); // in flight when the link went down
    at(4000);
    net.onResync({ curFrame: 6, log: [[3, SEAT, 3, 0, 0, 0], [5, 2, 7, 0, 0, 0]] });
    expect(net.confirmedTo).toBe(6);
    // frame 3 was already held: the relay's copy of it is not added a second time
    expect(net.take(3)).toHaveLength(1);
    expect(net.take(5)).toHaveLength(1);
    // neither the frame waiting to be stepped nor the command in flight measures across the gap
    expect(net.delayMs).toBe(150);
    expect(net.log).toHaveLength(2);
  });

  it('skips a malformed command without losing the frame', () => {
    const { net } = fresh();
    net.onBatch(batch(1, [[1, [[0, 2], cmd(2, 9)]]]));
    const l = net.take(1)!;
    expect(l).toHaveLength(1);
    expect(l[0]!.flip).toBe(9);
  });
});

describe('catch-up ladder', () => {
  it('runs faster the further behind it is, and eases off inside the buffer', () => {
    expect(catchUpRate(0)).toBe(1);
    expect(catchUpRate(6)).toBe(1);
    expect(catchUpRate(7)).toBe(1.25);
    expect(catchUpRate(31)).toBe(2);
    expect(catchUpRate(301)).toBe(3);
    expect(catchUpRate(901)).toBe(5);
    expect(catchUpRate(-1)).toBe(0.85);
  });
});
