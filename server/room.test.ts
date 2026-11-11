// A room's whole life, run on a clock we move by hand: two seats arriving, the commands they send,
// the hashes they agree (or do not) on, a seat that drops out and comes back, one that never does,
// and the four ways a room ends. None of it needed a socket or a second of real time, and none of
// it had a test before: the online path is the one part of the game that cannot be stepped through
// in a browser on its own.

import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../src/sim/rules.ts';
import type { ShelfDoc } from './replayShelf.ts';
import { FORFEIT_MS, IDLE_ROOM_MS, OVER_MS, PROTOCOL, Room, type Client, type Msg, type RoomHost } from './room.ts';

/** A socket that keeps what was sent to it, and remembers being closed. */
function fakeWs() {
  const got: Msg[] = [];
  const closes: number[] = [];
  const ws = {
    readyState: 1,
    send: (s: string) => got.push(JSON.parse(s) as Msg),
    close: (code: number) => closes.push(code),
  } as unknown as Client;
  return { ws, got, closes, last: (t: string) => [...got].reverse().find((m) => m.t === t) };
}

function table() {
  let now = 100000;
  const kept: ShelfDoc[] = [];
  const gone: string[] = [];
  const host: RoomHost = {
    now: () => now,
    log: () => {},
    closed: (code) => gone.push(code),
    keep: (doc) => kept.push(doc),
    armed: () => {},
  };
  const room = new Room('ABCD', host);
  room.ev = ENGINE_VERSION;
  return { room, kept, gone, pass: (ms: number) => (now += ms), at: () => now };
}

/** Both seats in, the match started, their sockets handed back. */
function started() {
  const t = table();
  const a = fakeWs(), b = fakeWs();
  t.room.join(a.ws);
  t.room.join(b.ws);
  return { ...t, a, b };
}

describe('taking seats', () => {
  it('seats two and starts, and has nothing left for a third', () => {
    const t = table();
    const a = fakeWs(), b = fakeWs(), c = fakeWs();
    expect(t.room.join(a.ws)).toBe(1);
    expect(t.room.started()).toBe(false);
    expect(a.got[0]).toMatchObject({ t: 'room', code: 'ABCD', seat: 1, v: PROTOCOL });
    expect(String(a.got[0]!.token)).toHaveLength(24); // a token nobody can guess their way into

    expect(t.room.join(b.ws)).toBe(2);
    expect(t.room.started()).toBe(true);
    expect(a.last('match_start')).toMatchObject({ seed: t.room.seed, seat: 1, startFrame: 0 });
    expect(b.last('match_start')).toMatchObject({ seed: t.room.seed, seat: 2, startFrame: 0 });
    expect(a.got[0]!.token).not.toBe(b.got[0]!.token);

    expect(t.room.join(c.ws)).toBe(0);
    expect(c.got).toEqual([]);
  });

  it('gives a seat back when it leaves before the match, and closes with the last one', () => {
    const t = table();
    const a = fakeWs(), b = fakeWs();
    t.room.join(a.ws);
    t.room.onClose(1);
    expect(t.room.seats[1]).toBe(null);
    expect(t.gone).toEqual(['ABCD']); // nobody in it and nothing started: gone at once
    // the seat it gave back is the one the next player takes
    const t2 = table();
    t2.room.join(a.ws);
    t2.room.join(b.ws);
    expect(t2.room.started()).toBe(true);
  });
});

describe('the commands it stamps', () => {
  it('puts each on the next open frame, under the seat that sent it', () => {
    const t = started();
    t.room.onCmd(1, { t: 'cmd', c: [7, 0, 0, 0] });
    t.room.onCmd(2, { t: 'cmd', c: [9, 0, 0, 0] });
    t.room.pulse();
    // [frame, owner, flip, r1, r2, ff], ordered by owner within the frame
    expect(t.room.fb!.log).toEqual([
      [0, 1, 7, 0, 0, 0],
      [0, 2, 9, 0, 0, 0],
    ]);
    expect(t.a.last('frame_batch')).toMatchObject({ to: 2, frames: [[0, [[0, 1, 7, 0, 0, 0], [0, 2, 9, 0, 0, 0]]]] });
    expect(t.b.last('frame_batch')).toBeTruthy(); // both seats get the same batch
  });

  it('drops anything that is not four whole numbers, rather than stamping it', () => {
    // the sim unpacks these without looking: a string or a float here is a desync at best
    const t = started();
    for (const c of [undefined, 'flip', [1, 2, 3], [1, 2, 3, 4, 5], [1, 2, 3, 1.5], [1, 2, 3, '4'], [1, 2, 3, NaN]]) {
      t.room.onCmd(1, { t: 'cmd', c });
    }
    t.room.pulse();
    expect(t.room.fb!.log).toEqual([]);
  });

  it('takes nothing more once the match is over', () => {
    const t = started();
    t.room.onOver(1, { t: 'over', winner: 1, h: 5, tick: 90 });
    t.room.onCmd(2, { t: 'cmd', c: [7, 0, 0, 0] });
    t.room.pulse();
    expect(t.room.fb!.log).toEqual([]);
  });
});

describe('the hashes the seats report', () => {
  const hash = (r: Room, seat: number, tick: number, h: number) => r.onHash(seat, { t: 'hash', tick, h });

  it('keeps a checkpoint the two of them agree on', () => {
    const t = started();
    hash(t.room, 1, 30, 0xabc);
    expect(t.room.checks).toEqual([]); // one seat alone says nothing
    hash(t.room, 2, 30, 0xabc);
    hash(t.room, 1, 60, 0xdef);
    hash(t.room, 2, 60, 0xdef);
    expect(t.room.checks).toEqual([[30, 0xabc], [60, 0xdef]]);
    expect(t.room.hashes.size).toBe(0); // and the answered ticks are let go
    expect(t.a.got.some((m) => m.t === 'desync')).toBe(false);
  });

  it('tells both seats the moment they differ, and remembers the first time', () => {
    const t = started();
    hash(t.room, 1, 30, 0xabc);
    hash(t.room, 2, 30, 0xabc);
    hash(t.room, 1, 60, 1);
    hash(t.room, 2, 60, 2);
    expect(t.room.desync).toEqual({ tick: 60, h: [1, 2] });
    expect(t.a.last('desync')).toMatchObject({ tick: 60 });
    expect(t.b.last('desync')).toMatchObject({ tick: 60 });
    // from here the two of them are playing different matches: no later tick is a checkpoint,
    // and the first parting of the ways is the one worth keeping
    hash(t.room, 1, 90, 7);
    hash(t.room, 2, 90, 7);
    hash(t.room, 1, 120, 3);
    hash(t.room, 2, 120, 4);
    expect(t.room.checks).toEqual([[30, 0xabc]]);
    expect(t.room.desync).toEqual({ tick: 60, h: [1, 2] });
  });

  it('ignores a tick or a hash that is not a whole number, and forgets the oldest unanswered', () => {
    const t = started();
    t.room.onHash(1, { t: 'hash', tick: 1.5, h: 1 });
    t.room.onHash(1, { t: 'hash', tick: 30, h: 'x' });
    expect(t.room.hashes.size).toBe(0);
    // a seat that falls behind and never answers must not grow the room without end
    for (let k = 1; k <= 200; k++) hash(t.room, 1, k * 30, k);
    expect(t.room.hashes.size).toBeLessThanOrEqual(64);
    expect(t.room.checks).toEqual([]);
  });
});

describe('a seat that goes away', () => {
  it('tells the other seat, and forfeits for it after half a minute', () => {
    const t = started();
    t.room.onClose(2);
    expect(t.a.last('peer_status')).toMatchObject({ seat: 2, online: false });
    t.pass(FORFEIT_MS);
    t.room.pulse();
    expect(t.room.fb!.log).toEqual([]); // not yet: a train tunnel is not a forfeit
    t.pass(1);
    t.room.pulse();
    expect(t.room.fb!.log).toEqual([[3, 2, -1, 0, 0, 1]]); // flip -1, ff 1: seat 2 gives up
    t.pass(FORFEIT_MS * 2);
    t.room.pulse();
    t.room.pulse();
    expect(t.room.fb!.log).toHaveLength(1); // and only ever once
  });

  it('picks the match up again where it left off', () => {
    const t = started();
    t.room.onCmd(1, { t: 'cmd', c: [7, 0, 0, 0] });
    t.room.pulse();
    t.room.onCmd(1, { t: 'cmd', c: [8, 0, 0, 0] });
    t.room.pulse();
    t.room.onClose(2);
    const again = fakeWs();
    t.room.resume(again.ws, 2, 1); // it has everything up to frame 1
    expect(t.room.seats[2]!.online).toBe(true);
    expect(again.last('conn_resync')).toMatchObject({ seed: t.room.seed, seat: 2, curFrame: t.room.fb!.curFrame, log: [[3, 1, 8, 0, 0, 0]] });
    expect(t.a.last('peer_status')).toMatchObject({ seat: 2, online: true });
    // and it no longer forfeits for a seat that is back
    t.pass(FORFEIT_MS + 1);
    t.room.pulse();
    expect(t.room.fb!.log.every((c) => c[2] !== -1)).toBe(true);
  });

  it('hangs up on the socket a seat is resuming away from', () => {
    // the same player on a second tab, or a connection the server has not noticed is dead
    const t = started();
    const again = fakeWs();
    t.room.resume(again.ws, 2, -1);
    expect(t.b.closes).toEqual([4000]);
    expect(again.last('conn_resync')).toBeTruthy();
    expect(t.room.seats[2]!.ws).toBe(again.ws);
  });
});

describe('the ways it ends', () => {
  it('tells both seats the result when both have reported it, and says whether they agree', () => {
    const t = started();
    t.room.onOver(1, { t: 'over', winner: 1, h: 42, tick: 900 });
    expect(t.a.got.some((m) => m.t === 'match_over')).toBe(false);
    t.room.onOver(2, { t: 'over', winner: 1, h: 42, tick: 900 });
    expect(t.a.last('match_over')).toEqual({ t: 'match_over', winner: 1, agree: true });
    expect(t.b.last('match_over')).toEqual({ t: 'match_over', winner: 1, agree: true });
  });

  it('says so when the two of them disagree about what happened', () => {
    const t = started();
    t.room.onOver(1, { t: 'over', winner: 1, h: 42, tick: 900 });
    t.room.onOver(2, { t: 'over', winner: 2, h: 43, tick: 900 });
    expect(t.a.last('match_over')).toEqual({ t: 'match_over', winner: 1, agree: false });
  });

  it('closes a few seconds after the result, keeps the replay, and beats no more', () => {
    const t = started();
    t.room.onCmd(1, { t: 'cmd', c: [7, 0, 0, 0] });
    t.room.pulse();
    t.room.onHash(1, { t: 'hash', tick: 1, h: 99 });
    t.room.onHash(2, { t: 'hash', tick: 1, h: 99 });
    t.room.onOver(1, { t: 'over', winner: 1, h: 99, tick: 1 });
    t.room.onOver(2, { t: 'over', winner: 1, h: 99, tick: 1 });
    t.pass(OVER_MS);
    expect(t.room.pulse()).toBe(true);
    expect(t.gone).toEqual([]);
    t.pass(1);
    expect(t.room.pulse()).toBe(false);
    expect(t.gone).toEqual(['ABCD']);
    expect(t.a.last('room_closed')).toMatchObject({ why: 'over' });
    expect(t.kept).toHaveLength(1);
    expect(t.kept[0]).toMatchObject({ kind: 'online', end: 'over' });
    // whatever happens next, the room is gone and its replay is kept once
    t.room.close('again');
    expect(t.room.pulse()).toBe(false);
    expect(t.gone).toEqual(['ABCD']);
    expect(t.kept).toHaveLength(1);
  });

  it('waits two minutes for a pair that both dropped out, then gives up on them', () => {
    const t = started();
    t.room.onCmd(1, { t: 'cmd', c: [7, 0, 0, 0] });
    t.room.pulse();
    t.room.onClose(1);
    t.pass(IDLE_ROOM_MS / 2);
    t.room.onClose(2);
    t.pass(IDLE_ROOM_MS);
    expect(t.room.pulse()).toBe(true); // the clock runs from the last one to leave
    t.pass(1);
    expect(t.room.pulse()).toBe(false);
    expect(t.gone).toEqual(['ABCD']);
  });

  it('keeps nothing from a match that never started', () => {
    const t = table();
    const a = fakeWs();
    t.room.join(a.ws);
    t.room.onClose(1);
    expect(t.gone).toEqual(['ABCD']);
    expect(t.kept).toEqual([]);
  });
});
