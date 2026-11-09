// Hexfront Rush lockstep relay + static file server for the built game (dist/).
//   npm run build && node server/relay.ts [port]     (default 8787; PORT env also works)
// Open http://localhost:8787/ in two tabs, press Online, create a room in one, join with its code
// in the other. In development `npm run dev` serves the game on 5207 and its pages connect here on 8787.
// Anything that can host Node can host this; the game page points at it with
// ?server=wss://host[:port].
//
// The relay is deliberately dumb: it never runs the sim. Per room it owns a FrameBroadcast
// (frame clock + command log), stamps each command with the sender's seat and the next open
// frame, and broadcasts closed frames every 100 ms. Clients report state hashes at checkpoints;
// with two players there is no majority, so any mismatch is reported to both as a desync.
// A seat that stays offline for FORFEIT_MS gets a forfeit command injected on its behalf.
//
// It also keeps replays (server/collector.ts): each online match, recorded from its frames with
// the hashes both seats agreed on as checkpoints (a desync keeps both seats' hashes), and the
// solo matches the game posts to /r. They go to REPLAY_DIR (default data/replays; `off` keeps
// none) for `npm run replays`.
//
// Node runs this file as is (built-in type stripping), so it uses erasable TypeScript only.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { FB_BATCH_MS, FrameBroadcast } from '../src/net/frameBroadcast.ts';
import { MAX_REPLAY_CHECKS } from '../src/sim/replayShape.ts';
import { Collector, onlineDoc } from './collector.ts';
import { ReplayShelf } from './replayShelf.ts';

const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PROTOCOL = 1;
const FORFEIT_MS = 30000;
const IDLE_ROOM_MS = 120000;
const MAX_MSG = 4096;
const HASH_KEEP = 64;

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

const rooms = new Map<string, Room>();

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  if (collector?.handle(req, res, p)) return;
  if (p === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: 1, rooms: rooms.size }));
    return;
  }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end(fs.existsSync(ROOT) ? 'not found' : 'no build: run npm run build first');
      return;
    }
    // hashed assets never change; the page itself must always be fresh
    const cache = p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': cache });
    res.end(data);
  });
});

interface Seat {
  token: string;
  ws: Client | null;
  online: boolean;
  offSince: number;
  forfeited?: boolean;
}
interface Report {
  winner: number;
  h: number;
  tick: number;
}
type Client = WebSocket & { room?: Room | null; seat?: number; isAlive?: boolean };
type Msg = Record<string, unknown> & { t: string };

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const send = (ws: Client | null, msg: Msg) => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
};
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const int = (v: unknown): number => (Number.isSafeInteger(v) ? (v as number) : 0);

const REPLAY_DIR = process.env.REPLAY_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'replays');
const collector =
  REPLAY_DIR === 'off' ? null : new Collector(new ReplayShelf(REPLAY_DIR, Number(process.env.REPLAY_BYTES) || undefined, log), log, {
        trustProxy: process.env.TRUST_PROXY === '1',
        contact: process.env.PRIVACY_CONTACT,
      });

class Room {
  code: string;
  seats: (Seat | null)[] = [null, null, null];
  seed = crypto.randomInt(1, 0x7fffffff);
  /** The engine version the creator runs; a joiner must run the same (lockstep). */
  ev = 0;
  /** [tick, hash] both seats reported alike, and the first tick they did not. */
  checks: [number, number][] = [];
  desync: { tick: number; h: [number, number] } | null = null;
  fb: FrameBroadcast | null = null;
  timer: ReturnType<typeof setInterval> | null = null;
  /** tick -> [null, h1, h2] */
  hashes = new Map<number, (number | null)[]>();
  over: { at: number; reports: (Report | null)[] } | null = null;
  touched = Date.now();

  constructor(code: string) {
    this.code = code;
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
    this.timer = setInterval(() => this.pulse(), FB_BATCH_MS);
    log('room', this.code, 'start seed', this.seed);
  }
  pulse(): void {
    const fb = this.fb!;
    const now = Date.now();
    for (let s = 1; s <= 2; s++) {
      const st = this.seats[s];
      if (st && !st.online && !this.over && now - st.offSince > FORFEIT_MS && !st.forfeited) {
        st.forfeited = true;
        fb.submit(s, -1, 0, 0, 1, 0);
        log('room', this.code, 'seat', s, 'forfeits (offline)');
      }
    }
    const batch = fb.tick();
    this.broadcast({ t: 'frame_batch', to: batch.to, frames: batch.frames });
    if (this.over && now - this.over.at > 5000) this.close('over');
    else if (!this.seats.some((s) => s && s.online) && now - this.touched > IDLE_ROOM_MS) this.close('idle');
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
        log('room', this.code, 'DESYNC at tick', tick, e[1].toString(16), e[2].toString(16));
        if (!this.desync) this.desync = { tick, h: [e[1], e[2]] };
        this.broadcast({ t: 'desync', tick });
      } else if (!this.desync && this.checks.length < MAX_REPLAY_CHECKS && tick > (this.checks[this.checks.length - 1]?.[0] ?? 0)) this.checks.push([tick, e[1]]);
      this.hashes.delete(tick);
    }
  }
  onOver(seat: number, m: Msg): void {
    if (!this.over) this.over = { at: Date.now(), reports: [null, null, null] };
    this.over.reports[seat] = { winner: int(m.winner), h: int(m.h), tick: int(m.tick) };
    const r = this.over.reports;
    if (r[1] && r[2]) {
      const agree = r[1].h === r[2].h;
      this.broadcast({ t: 'match_over', winner: r[1].winner, agree });
      log('room', this.code, 'over winner', r[1].winner, agree ? 'hashes agree' : 'RESULT HASH MISMATCH');
    }
  }
  onClose(seat: number): void {
    const st = this.seats[seat];
    if (!st) return;
    st.online = false;
    st.offSince = Date.now();
    st.ws = null;
    this.touched = Date.now();
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
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.fb && collector) this.record();
    for (let s = 1; s <= 2; s++) {
      const st = this.seats[s];
      if (st && st.ws) {
        send(st.ws, { t: 'room_closed', why });
        st.ws.room = null;
      }
    }
    rooms.delete(this.code);
    log('room', this.code, 'closed', why);
  }

  /** Keeps the match on the replay shelf (once, when the room closes). */
  record(): void {
    const reports = this.over ? this.over.reports : [null, null, null];
    const doc = onlineDoc({ code: this.code, seed: this.seed, ev: this.ev, log: this.fb!.log, checks: this.checks, reports, desync: this.desync }, Date.now());
    if (!doc) return;
    try {
      collector!.shelf.put(doc);
      log('room', this.code, 'replay kept', doc.end, 'to tick', doc.replay.endTick);
    } catch (e) {
      log('room', this.code, 'replay not kept:', e instanceof Error ? e.message : e);
    }
  }
}

function onMessage(ws: Client, m: Msg): void {
  const room = ws.room;
  switch (m.t) {
    case 'ping':
      send(ws, { t: 'pong', ts: m.ts });
      return;
    case 'create': {
      if (room) return;
      const r = new Room(newCode());
      r.ev = int(m.ev);
      rooms.set(r.code, r);
      r.join(ws);
      log('room', r.code, 'created');
      return;
    }
    case 'join': {
      if (room) return;
      const r = rooms.get(String(m.code || '').toUpperCase());
      if (!r || r.started()) {
        send(ws, { t: 'error', code: 'no_room' });
        return;
      }
      if (int(m.ev) !== r.ev) {
        send(ws, { t: 'error', code: 'version' });
        return;
      }
      r.join(ws);
      return;
    }
    case 'resume': {
      const r = rooms.get(String(m.code || '').toUpperCase());
      const seat = int(m.seat);
      if (!r || !r.started() || (seat !== 1 && seat !== 2) || !r.seats[seat] || r.seats[seat]!.token !== m.token) {
        send(ws, { t: 'error', code: 'no_resume' });
        return;
      }
      r.resume(ws, seat, m.have);
      return;
    }
    case 'leave':
      if (room) {
        const seat = ws.seat!;
        if (room.started() && !room.over) room.fb!.submit(seat, -1, 0, 0, 1, 0);
        room.onClose(seat);
        ws.room = null;
      }
      return;
  }
  if (!room) return;
  const seat = ws.seat!;
  if (m.t === 'cmd') room.onCmd(seat, m);
  else if (m.t === 'hash') room.onHash(seat, m);
  else if (m.t === 'over') room.onOver(seat, m);
}

const wss = new WebSocketServer({ server, maxPayload: MAX_MSG });
wss.on('connection', (sock) => {
  const ws = sock as Client;
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (data) => {
    let m: Msg;
    try {
      m = JSON.parse(String(data)) as Msg;
    } catch {
      return;
    }
    if (!m || typeof m.t !== 'string') return;
    onMessage(ws, m);
  });
  ws.on('close', () => {
    if (ws.room) ws.room.onClose(ws.seat!);
  });
});

// drop dead sockets (laptop lid closed etc.) so the seat goes offline and can resume
setInterval(() => {
  for (const sock of wss.clients) {
    const ws = sock as Client;
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 10000);

server.listen(PORT, () => log('Hexfront relay on http://localhost:' + PORT));
