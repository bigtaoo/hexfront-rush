'use strict';
// WebSocket link to the lockstep relay (server/relay.js). It only moves JSON messages; the match
// flow (rooms, frames, hashes) lives in main.js. While `want` is set it reconnects on its own with
// a growing back-off, and calls onOpen each time so the caller can create, join or resume.
// It also pings every 2 s and keeps an RTT estimate for the HUD.

const NET_PROTOCOL = 1;

/** Relay URL: ?server=ws(s)://host[:port], or the page's own host when it is served by the relay. */
function relayUrl() {
  const q = new URLSearchParams(location.search);
  const s = q.get('server');
  if (s) return /^wss?:\/\//.test(s) ? s : (location.protocol === 'https:' ? 'wss://' : 'ws://') + s;
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    const local = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(location.hostname);
    if (local) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  }
  return null;
}

class NetClient {
  constructor(url, h) {
    this.url = url;
    this.h = h;              // { onOpen(), onMessage(m), onState(state) }
    this.ws = null;
    this.want = false;
    this.state = 'idle';     // idle | connecting | open | retry
    this.retries = 0;
    this.rtt = 0;
    this.pingT = null;
    this.retryT = null;
  }
  setState(s) { if (s !== this.state) { this.state = s; if (this.h.onState) this.h.onState(s); } }
  connect() {
    this.want = true;
    if (this.ws) return;
    clearTimeout(this.retryT);
    this.setState('connecting');
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { this.scheduleRetry(); return; }
    this.ws = ws;
    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.retries = 0;
      this.setState('open');
      this.ping();
      clearInterval(this.pingT);
      this.pingT = setInterval(() => this.ping(), 2000);
      if (this.h.onOpen) this.h.onOpen();
    };
    ws.onmessage = (ev) => {
      if (ws !== this.ws) return;
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'pong') {
        const r = performance.now() - m.ts;
        this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.3 : r;
        return;
      }
      this.h.onMessage(m);
    };
    ws.onclose = () => {
      if (ws !== this.ws) return;
      this.ws = null;
      clearInterval(this.pingT);
      if (this.want) this.scheduleRetry(); else this.setState('idle');
    };
    ws.onerror = () => { /* onclose follows */ };
  }
  scheduleRetry() {
    this.ws = null;
    this.setState('retry');
    const wait = Math.min(4000, 400 * Math.pow(1.6, this.retries++));
    clearTimeout(this.retryT);
    this.retryT = setTimeout(() => { if (this.want) this.connect(); }, wait);
  }
  ping() { this.send({ t: 'ping', ts: performance.now() }); }
  send(m) {
    if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(m)); return true; }
    return false;
  }
  close() {
    this.want = false;
    clearTimeout(this.retryT);
    clearInterval(this.pingT);
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { ws.close(1000); } catch (e) { /* gone */ } }
    this.setState('idle');
  }
}
