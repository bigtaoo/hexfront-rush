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
// This file is the sockets and the lobby of codes: what a room itself does is room.ts, and
// serving dist/ is staticFiles.ts, so both can be tested without a relay running.
//
// Node runs this file as is (built-in type stripping), so it uses erasable TypeScript only.

import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { FB_BATCH_MS } from '../src/net/frameBroadcast.ts';
import { Collector } from './collector.ts';
import { ReplayShelf } from './replayShelf.ts';
import { Room, send, type Client, type Msg, type RoomHost } from './room.ts';
import { serveStatic, urlPath } from './staticFiles.ts';

const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const MAX_MSG = 4096;

const rooms = new Map<string, Room>();

const server = http.createServer((req, res) => {
  const p = urlPath(req.url);
  if (p === null) {
    // a URL that is not a path (a broken escape, a NUL): answered, never thrown (staticFiles.ts)
    res.writeHead(400);
    res.end();
    return;
  }
  if (collector?.handle(req, res, p)) return;
  if (p === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: 1, rooms: rooms.size }));
    return;
  }
  serveStatic(ROOT, p, res);
});

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const int = (v: unknown): number => (Number.isSafeInteger(v) ? (v as number) : 0);

const REPLAY_DIR = process.env.REPLAY_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'replays');
const collector =
  REPLAY_DIR === 'off' ? null : new Collector(new ReplayShelf(REPLAY_DIR, Number(process.env.REPLAY_BYTES) || undefined, log), log, {
        trustProxy: process.env.TRUST_PROXY === '1',
        contact: process.env.PRIVACY_CONTACT,
      });

/** What every room here is given: the wall clock, the console, the lobby to tell when it is gone,
 *  and the replay shelf. A started room is beaten by a timer that stops with the room. */
const host: RoomHost = {
  now: Date.now,
  log,
  closed: (code) => rooms.delete(code),
  keep: collector ? (doc) => collector.shelf.put(doc) : null,
  armed: (room) => {
    const timer = setInterval(() => {
      if (!room.pulse()) clearInterval(timer);
    }, FB_BATCH_MS);
  },
};

function onMessage(ws: Client, m: Msg): void {
  const room = ws.room;
  switch (m.t) {
    case 'ping':
      send(ws, { t: 'pong', ts: m.ts });
      return;
    case 'create': {
      if (room) return;
      const r = new Room(newCode(), host);
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
