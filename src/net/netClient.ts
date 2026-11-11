// WebSocket link to the lockstep relay (server/relay.ts). It only moves JSON messages; the match
// flow (rooms, frames, hashes) lives in app/online.ts. While `want` is set it reconnects on its
// own with a growing back-off, and calls onOpen each time so the caller can create, join or
// resume. It also pings every PING_MS and keeps an RTT estimate for the HUD.
//
// A socket that goes quiet is not trusted: a phone that slept or a Wi-Fi handover leaves a socket
// that still says "open" while nothing crosses it, and the operating system can take minutes to
// notice. The ping doubles as a heartbeat, and DEAD_MS without a word drops the link and
// reconnects, which is what gets the match moving again.

export type NetState = 'idle' | 'connecting' | 'open' | 'retry';
/** A relay message: always an object with a string type `t`. */
export interface NetMsg {
  t: string;
  [k: string]: unknown;
}
export interface NetHandlers {
  onOpen?(): void;
  onMessage(m: NetMsg): void;
  onState?(s: NetState): void;
}
/** Seams for the tests: the clock and the socket. */
export interface NetClientOptions {
  now?: () => number;
  make?: (url: string) => WebSocket;
}

/** The relay's own port (server/relay.ts), where the dev server's pages find it. */
export const DEV_RELAY_PORT = 8787;
/** How often a ping goes out while the link is open. */
export const PING_MS = 2000;
/** Nothing heard for this long on an open link: four pings unanswered, so it is dead. */
export const DEAD_MS = 8000;
/** The back-off between reconnects, in ms: 400, 640, 1024 ... capped. */
export const RETRY_MS = (retries: number): number => Math.round(Math.min(4000, 400 * Math.pow(1.6, retries)));

/** Relay URL: ?server=ws(s)://host[:port], else the page's own host when that is a local or LAN
 *  address (the relay serves the built game there; under the Vite dev server, whose port is not
 *  the relay's, the same host on DEV_RELAY_PORT). Null when there is no relay to use. */
export function relayUrl(
  loc: Pick<Location, 'search' | 'protocol' | 'hostname' | 'host'> = location,
  dev: boolean = import.meta.env?.DEV ?? false,
): string | null {
  const q = new URLSearchParams(loc.search);
  const s = q.get('server');
  const ws = loc.protocol === 'https:' ? 'wss://' : 'ws://';
  if (s) return /^wss?:\/\//.test(s) ? s : ws + s;
  if (loc.protocol === 'http:' || loc.protocol === 'https:') {
    const local = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(loc.hostname);
    if (local) return dev ? `${ws}${loc.hostname}:${DEV_RELAY_PORT}` : ws + loc.host;
  }
  return null;
}

export class NetClient {
  ws: WebSocket | null = null;
  want = false;
  state: NetState = 'idle';
  retries = 0;
  rtt = 0;
  /** When the relay was last heard from, or -1 while no link is open. A clock that starts at
   *  zero is a real case (the page has just loaded), so the two cannot share a value. */
  private heard = -1;
  private pingT: ReturnType<typeof setInterval> | undefined;
  private retryT: ReturnType<typeof setTimeout> | undefined;
  private now: () => number;
  private make: (url: string) => WebSocket;

  constructor(readonly url: string, private h: NetHandlers, o: NetClientOptions = {}) {
    this.now = o.now || (() => performance.now());
    this.make = o.make || ((u) => new WebSocket(u));
  }

  private setState(s: NetState): void {
    if (s === this.state) return;
    this.state = s;
    this.h.onState?.(s);
  }

  connect(): void {
    this.want = true;
    if (this.ws) return;
    clearTimeout(this.retryT);
    this.setState('connecting');
    let ws: WebSocket;
    try {
      ws = this.make(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.retries = 0;
      this.heard = this.now();
      this.setState('open');
      this.ping();
      clearInterval(this.pingT);
      this.pingT = setInterval(() => this.beat(), PING_MS);
      this.h.onOpen?.();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (ws !== this.ws) return;
      // any word at all is a sign of life, whatever it turns out to say
      this.heard = this.now();
      let m: NetMsg;
      try {
        m = JSON.parse(String(ev.data)) as NetMsg;
      } catch {
        return;
      }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'pong') {
        const ts = Number(m.ts);
        // a pong without a usable stamp still counts as alive, but it must not poison the RTT
        if (Number.isFinite(ts)) {
          const r = Math.max(0, this.now() - ts);
          this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.3 : r;
        }
        return;
      }
      this.h.onMessage(m);
    };
    ws.onclose = () => {
      if (ws !== this.ws) return;
      this.ws = null;
      this.heard = -1;
      clearInterval(this.pingT);
      if (this.want) this.scheduleRetry();
      else this.setState('idle');
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  /** The ping interval: first make sure there is still someone on the other end. */
  private beat(): void {
    if (this.ws && this.heard >= 0 && this.now() - this.heard > DEAD_MS) {
      this.drop();
      return;
    }
    this.ping();
  }

  /** Let go of a socket that is open in name only; `want` still stands, so a retry follows. */
  private drop(): void {
    const ws = this.ws;
    this.ws = null;
    this.heard = -1;
    clearInterval(this.pingT);
    try {
      ws?.close();
    } catch {
      /* gone */
    }
    if (this.want) this.scheduleRetry();
    else this.setState('idle');
  }

  private scheduleRetry(): void {
    this.ws = null;
    this.heard = -1;
    this.setState('retry');
    const wait = RETRY_MS(this.retries++);
    clearTimeout(this.retryT);
    this.retryT = setTimeout(() => {
      if (this.want) this.connect();
    }, wait);
  }

  ping(): void {
    this.send({ t: 'ping', ts: this.now() });
  }

  send(m: NetMsg): boolean {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(m));
      return true;
    }
    return false;
  }

  close(): void {
    this.want = false;
    clearTimeout(this.retryT);
    clearInterval(this.pingT);
    // the next connect() on this client starts fresh: no back-off and no stale RTT from last time
    this.retries = 0;
    this.rtt = 0;
    this.heard = -1;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close(1000);
      } catch {
        /* gone */
      }
    }
    this.setState('idle');
  }
}
