// Hexfront Rush lockstep relay + static file server.
//   node server/relay.js [port]        (default 8787; PORT env also works)
// Open http://localhost:8787/ in two tabs, press Online, create a room in one, join with its code
// in the other. Anything that can host Node can host this; the game page points at it with
// ?server=wss://host[:port].
//
// The relay is deliberately dumb: it never runs the sim. Per room it owns a FrameBroadcast
// (frame clock + command log), stamps each command with the sender's seat and the next open
// frame, and broadcasts closed frames every 100 ms. Clients report state hashes at checkpoints;
// with two players there is no majority, so any mismatch is reported to both as a desync.
// A seat that stays offline for FORFEIT_MS gets a forfeit command injected on its behalf.

const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { FrameBroadcast, FB_BATCH_MS } = require('../js/net/frameBroadcast.js');

const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const ROOT = path.join(__dirname, '..');
const PROTOCOL = 1;
const FORFEIT_MS = 30000;
const IDLE_ROOM_MS = 120000;
const MAX_MSG = 4096;
const HASH_KEEP = 64;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webp': 'image/webp' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: 1, rooms: rooms.size })); return; }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || file.includes(path.sep + 'server' + path.sep) || file.includes('node_modules')) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const rooms = new Map();   // code -> Room
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

class Room {
  constructor(code) {
    this.code = code;
    this.seats = [null, null, null];      // seat -> { token, ws, online, offSince }
    this.seed = crypto.randomInt(1, 0x7fffffff);
    this.fb = null;
    this.timer = null;
    this.hashes = new Map();              // tick -> [null, h1, h2]
    this.over = null;
    this.touched = Date.now();
  }
  started() { return !!this.fb; }
  broadcast(msg) { for (let s = 1; s <= 2; s++) if (this.seats[s]) send(this.seats[s].ws, msg); }
  seatOf(ws) { for (let s = 1; s <= 2; s++) if (this.seats[s] && this.seats[s].ws === ws) return s; return 0; }
  join(ws) {
    const seat = !this.seats[1] ? 1 : !this.seats[2] ? 2 : 0;
    if (!seat) return 0;
    this.seats[seat] = { token: crypto.randomBytes(12).toString('hex'), ws, online: true, offSince: 0 };
    ws.room = this; ws.seat = seat;
    send(ws, { t: 'room', code: this.code, seat, token: this.seats[seat].token, v: PROTOCOL });
    if (this.seats[1] && this.seats[2]) this.start();
    return seat;
  }
  start() {
    this.fb = new FrameBroadcast({ startFrame: 0 });
    for (let s = 1; s <= 2; s++) send(this.seats[s].ws, { t: 'match_start', seed: this.seed, startFrame: 0, seat: s, code: this.code });
    this.timer = setInterval(() => this.pulse(), FB_BATCH_MS);
    log('room', this.code, 'start seed', this.seed);
  }
  pulse() {
    const now = Date.now();
    for (let s = 1; s <= 2; s++) {
      const st = this.seats[s];
      if (st && !st.online && !this.over && now - st.offSince > FORFEIT_MS && !st.forfeited) {
        st.forfeited = true;
        this.fb.submit(s, -1, 0, 0, 1, 0);
        log('room', this.code, 'seat', s, 'forfeits (offline)');
      }
    }
    const batch = this.fb.tick();
    this.broadcast({ t: 'frame_batch', to: batch.to, frames: batch.frames });
    if (this.over && now - this.over.at > 5000) this.close('over');
    else if (!this.seats.some((s) => s && s.online) && now - this.touched > IDLE_ROOM_MS) this.close('idle');
  }
  onCmd(seat, m) {
    if (this.over || !this.fb) return;
    const c = m.c;
    if (!Array.isArray(c) || c.length !== 4 || !c.every(Number.isSafeInteger)) return;
    this.fb.submit(seat, c[0], c[1], c[2], c[3], 0);
  }
  onHash(seat, m) {
    if (!Number.isSafeInteger(m.tick) || !Number.isSafeInteger(m.h)) return;
    let e = this.hashes.get(m.tick);
    if (!e) {
      e = [null, null, null];
      this.hashes.set(m.tick, e);
      if (this.hashes.size > HASH_KEEP) this.hashes.delete(this.hashes.keys().next().value);
    }
    e[seat] = m.h;
    if (e[1] !== null && e[2] !== null) {
      if (e[1] !== e[2]) {
        log('room', this.code, 'DESYNC at tick', m.tick, e[1].toString(16), e[2].toString(16));
        this.broadcast({ t: 'desync', tick: m.tick });
      }
      this.hashes.delete(m.tick);
    }
  }
  onOver(seat, m) {
    if (!this.over) this.over = { at: Date.now(), reports: [null, null, null] };
    this.over.reports[seat] = { winner: m.winner | 0, h: m.h | 0, tick: m.tick | 0 };
    const r = this.over.reports;
    if (r[1] && r[2]) {
      const agree = r[1].h === r[2].h;
      this.broadcast({ t: 'match_over', winner: r[1].winner, agree });
      log('room', this.code, 'over winner', r[1].winner, agree ? 'hashes agree' : 'RESULT HASH MISMATCH');
    }
  }
  onClose(seat) {
    const st = this.seats[seat];
    if (!st) return;
    st.online = false; st.offSince = Date.now(); st.ws = null;
    this.touched = Date.now();
    if (!this.started()) { this.seats[seat] = null; if (!this.seats[1] && !this.seats[2]) this.close('empty'); return; }
    this.broadcast({ t: 'peer_status', seat, online: false });
  }
  resume(ws, seat, have) {
    const st = this.seats[seat];
    if (st.ws && st.ws !== ws) { st.ws.room = null; try { st.ws.close(4000, 'replaced'); } catch (e) { /* already gone */ } }
    st.ws = ws; st.online = true; st.offSince = 0;
    ws.room = this; ws.seat = seat;
    const from = Number.isSafeInteger(have) ? have : -1;
    send(ws, { t: 'conn_resync', seed: this.seed, seat, code: this.code, startFrame: 0, curFrame: this.fb.curFrame,
      log: this.fb.logSince(from) });
    this.broadcast({ t: 'peer_status', seat, online: true });
  }
  close(why) {
    clearInterval(this.timer);
    this.timer = null;
    for (let s = 1; s <= 2; s++) if (this.seats[s] && this.seats[s].ws) { send(this.seats[s].ws, { t: 'room_closed', why }); this.seats[s].ws.room = null; }
    rooms.delete(this.code);
    log('room', this.code, 'closed', why);
  }
}

const wss = new WebSocketServer({ server, maxPayload: MAX_MSG });
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const room = ws.room;
    switch (m.t) {
      case 'ping': send(ws, { t: 'pong', ts: m.ts }); return;
      case 'create': {
        if (room) return;
        const r = new Room(newCode());
        rooms.set(r.code, r);
        r.join(ws);
        log('room', r.code, 'created');
        return;
      }
      case 'join': {
        if (room) return;
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r || r.started()) { send(ws, { t: 'error', code: 'no_room' }); return; }
        r.join(ws);
        return;
      }
      case 'resume': {
        const r = rooms.get(String(m.code || '').toUpperCase());
        const seat = m.seat | 0;
        if (!r || !r.started() || (seat !== 1 && seat !== 2) || !r.seats[seat] || r.seats[seat].token !== m.token) {
          send(ws, { t: 'error', code: 'no_resume' });
          return;
        }
        r.resume(ws, seat, m.have);
        return;
      }
      case 'leave':
        if (room) {
          const seat = ws.seat;
          if (room.started() && !room.over) room.fb.submit(seat, -1, 0, 0, 1, 0);
          room.onClose(seat);
          ws.room = null;
        }
        return;
    }
    if (!room) return;
    const seat = ws.seat;
    if (m.t === 'cmd') room.onCmd(seat, m);
    else if (m.t === 'hash') room.onHash(seat, m);
    else if (m.t === 'over') room.onOver(seat, m);
  });
  ws.on('close', () => { if (ws.room) ws.room.onClose(ws.seat); });
});

// drop dead sockets (laptop lid closed etc.) so the seat goes offline and can resume
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 10000);

server.listen(PORT, () => log('Hexfront relay on http://localhost:' + PORT));
