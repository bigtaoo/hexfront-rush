// One online room: two seats, the frame clock they share, and everything that can happen to them
// while a match runs. The relay (relay.ts) owns the sockets and the lobby of codes; this file owns
// what a room does, and it is told the time and where its replay goes, so a test can run a whole
// room's life in a few milliseconds without a socket or a clock.
//
// The room never runs the sim. It stamps each command with the sender's seat and hands out closed
// frames; the seats agree on state hashes at checkpoints, and with only two of them any mismatch
// is a desync for both. A seat that stays offline for FORFEIT_MS gives up on its own behalf.
//
// Node runs the relay as is (built-in type stripping), so this file uses erasable TypeScript only.

import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import { FrameBroadcast } from '../src/net/frameBroadcast.ts';
import { MAX_REPLAY_CHECKS } from '../src/sim/replayShape.ts';
import { onlineDoc } from './collector.ts';
import type { ShelfDoc } from './replayShelf.ts';

/** The protocol version the client is told it is speaking. */
export const PROTOCOL = 1;
/** A seat offline this long, mid-match, forfeits on its own behalf. */
export const FORFEIT_MS = 30000;
/** A room nobody is connected to is kept this long, so a dropped pair can come back to it. */
export const IDLE_ROOM_MS = 120000;
/** The room closes this long after the first seat reported the result. */
export const OVER_MS = 5000;
/** Hashes still waiting for the other seat's answer, at most. */
const HASH_KEEP = 64;

export interface Seat {
  token: string;
  ws: Client | null;
  online: boolean;
  offSince: number;
  forfeited?: boolean;
}
export interface Report {
  winner: number;
  h: number;
  tick: number;
}
export type Client = WebSocket & { room?: Room | null; seat?: number; isAlive?: boolean };
export type Msg = Record<string, unknown> & { t: string };

/** What a room needs from the world: the time, somewhere to log, the lobby to tell when it is
 *  gone, and the shelf its replay goes on (null keeps none). */
export interface RoomHost {
  now: () => number;
  log: (...a: unknown[]) => void;
  closed: (code: string) => void;
  keep: ((doc: ShelfDoc) => void) | null;
  /** The match has begun: beat the room (pulse) every FB_BATCH_MS until it says it is done. */
  armed: (room: Room) => void;
}

export const send = (ws: Client | null, msg: Msg): void => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
};
const int = (v: unknown): number => (Number.isSafeInteger(v) ? (v as number) : 0);

export class Room {
  seats: (Seat | null)[] = [null, null, null];
  seed = crypto.randomInt(1, 0x7fffffff);
  /** The engine version the creator runs; a joiner must run the same (lockstep). */
  ev = 0;
  /** [tick, hash] both seats reported alike, and the first tick they did not. */
  checks: [number, number][] = [];
  desync: { tick: number; h: [number, number] } | null = null;
  fb: FrameBroadcast | null = null;
  /** tick -> [null, h1, h2] */
  hashes = new Map<number, (number | null)[]>();
  over: { at: number; reports: (Report | null)[] } | null = null;
  touched: number;
  /** Set when the room closes, so it closes, and keeps its replay, exactly once. */
  gone = false;

  readonly code: string;
  private readonly host: RoomHost;

  constructor(code: string, host: RoomHost) {
    this.code = code;
    this.host = host;
    this.touched = host.now();
  }
  started(): boolean {
    return !!this.fb;
  }
  broadcast(msg: Msg): void {
    for (let s = 1; s <= 2; s++) {
      const st = this.seats[s];
      if (st) send(st.ws, msg);
    }
  }
  join(ws: Client): number {
    const seat = !this.seats[1] ? 1 : !this.seats[2] ? 2 : 0;
    if (!seat) return 0;
    const st: Seat = { token: crypto.randomBytes(12).toString('hex'), ws, online: true, offSince: 0 };
    this.seats[seat] = st;
    ws.room = this;
    ws.seat = seat;
    send(ws, { t: 'room', code: this.code, seat, token: st.token, v: PROTOCOL });
    if (this.seats[1] && this.seats[2]) this.start();
    return seat;
  }
  start(): void {
    this.fb = new FrameBroadcast({ startFrame: 0 });
    for (let s = 1; s <= 2; s++) send(this.seats[s]!.ws, { t: 'match_start', seed: this.seed, startFrame: 0, seat: s, code: this.code });
    this.host.log('room', this.code, 'start seed', this.seed);
    this.host.armed(this);
  }
  /** One beat of the frame clock (FB_BATCH_MS): the forfeits that are due, the frames that have
   *  closed, and the room's own end. False once it has closed and must not be beaten again. */
  pulse(): boolean {
    if (this.gone) return false;
    const fb = this.fb!;
    const now = this.host.now();
    for (let s = 1; s <= 2; s++) {
      const st = this.seats[s];
      if (st && !st.online && !this.over && now - st.offSince > FORFEIT_MS && !st.forfeited) {
        st.forfeited = true;
        fb.submit(s, -1, 0, 0, 1, 0);
        this.host.log('room', this.code, 'seat', s, 'forfeits (offline)');
      }
    }
    const batch = fb.tick();
    this.broadcast({ t: 'frame_batch', to: batch.to, frames: batch.frames });
    if (this.over && now - this.over.at > OVER_MS) this.close('over');
    else if (!this.seats.some((s) => s && s.online) && now - this.touched > IDLE_ROOM_MS) this.close('idle');
    return !this.gone;
  }
  onCmd(seat: number, m: Msg): void {
    if (this.over || !this.fb) return;
    const c = m.c;
    if (!Array.isArray(c) || c.length !== 4 || !c.every((v) => Number.isSafeInteger(v))) return;
    this.fb.submit(seat, c[0], c[1], c[2], c[3], 0);
  }
  onHash(seat: number, m: Msg): void {
    if (!Number.isSafeInteger(m.tick) || !Number.isSafeInteger(m.h)) return;
    const tick = m.tick as number;
    let e = this.hashes.get(tick);
    if (!e) {
      e = [null, null, null];
      this.hashes.set(tick, e);
      if (this.hashes.size > HASH_KEEP) this.hashes.delete(this.hashes.keys().next().value!);
    }
    e[seat] = m.h as number;
    if (e[1] !== null && e[2] !== null) {
      if (e[1] !== e[2]) {
        this.host.log('room', this.code, 'DESYNC at tick', tick, e[1].toString(16), e[2].toString(16));
        if (!this.desync) this.desync = { tick, h: [e[1], e[2]] };
        this.broadcast({ t: 'desync', tick });
      } else if (!this.desync && this.checks.length < MAX_REPLAY_CHECKS && tick > (this.checks[this.checks.length - 1]?.[0] ?? 0)) this.checks.push([tick, e[1]]);
      this.hashes.delete(tick);
    }
  }
  onOver(seat: number, m: Msg): void {
    if (!this.over) this.over = { at: this.host.now(), reports: [null, null, null] };
    this.over.reports[seat] = { winner: int(m.winner), h: int(m.h), tick: int(m.tick) };
    const r = this.over.reports;
    if (r[1] && r[2]) {
      const agree = r[1].h === r[2].h;
      this.broadcast({ t: 'match_over', winner: r[1].winner, agree });
      this.host.log('room', this.code, 'over winner', r[1].winner, agree ? 'hashes agree' : 'RESULT HASH MISMATCH');
    }
  }
  onClose(seat: number): void {
    const st = this.seats[seat];
    if (!st) return;
    st.online = false;
    st.offSince = this.host.now();
    st.ws = null;
    this.touched = this.host.now();
    if (!this.started()) {
      this.seats[seat] = null;
      if (!this.seats[1] && !this.seats[2]) this.close('empty');
      return;
    }
    this.broadcast({ t: 'peer_status', seat, online: false });
  }
  resume(ws: Client, seat: number, have: unknown): void {
    const st = this.seats[seat]!;
    if (st.ws && st.ws !== ws) {
      st.ws.room = null;
      try {
        st.ws.close(4000, 'replaced');
      } catch {
        /* already gone */
      }
    }
    st.ws = ws;
    st.online = true;
    st.offSince = 0;
    ws.room = this;
    ws.seat = seat;
    const from = Number.isSafeInteger(have) ? (have as number) : -1;
    const fb = this.fb!;
    send(ws, { t: 'conn_resync', seed: this.seed, seat, code: this.code, startFrame: 0, curFrame: fb.curFrame, log: fb.logSince(from) });
    this.broadcast({ t: 'peer_status', seat, online: true });
  }
  close(why: string): void {
    if (this.gone) return;
    this.gone = true;
    if (this.fb && this.host.keep) this.record();
    for (let s = 1; s <= 2; s++) {
      const st = this.seats[s];
      if (st && st.ws) {
        send(st.ws, { t: 'room_closed', why });
        st.ws.room = null;
      }
    }
    this.host.closed(this.code);
    this.host.log('room', this.code, 'closed', why);
  }

  /** Keeps the match on the replay shelf (once, when the room closes). */
  record(): void {
    const reports = this.over ? this.over.reports : [null, null, null];
    const doc = onlineDoc({ code: this.code, seed: this.seed, ev: this.ev, log: this.fb!.log, checks: this.checks, reports, desync: this.desync }, this.host.now());
    if (!doc) return;
    try {
      this.host.keep!(doc);
      this.host.log('room', this.code, 'replay kept', doc.end, 'to tick', doc.replay.endTick);
    } catch (e) {
      this.host.log('room', this.code, 'replay not kept:', e instanceof Error ? e.message : e);
    }
  }
}
