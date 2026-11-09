// WebSocket link to the lockstep relay (server/relay.ts). It only moves JSON messages; the match
// flow (rooms, frames, hashes) lives in app/online.ts. While `want` is set it reconnects on its
// own with a growing back-off, and calls onOpen each time so the caller can create, join or
// resume. It also pings every 2 s and keeps an RTT estimate for the HUD.

export const NET_PROTOCOL = 1;

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

/** The relay's own port (server/relay.ts), where the dev server's pages find it. */
export const DEV_RELAY_PORT = 8787;

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
  private pingT: ReturnType<typeof setInterval> | undefined;
  private retryT: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly url: string, private h: NetHandlers) {}

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
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.retries = 0;
      this.setState('open');
      this.ping();
      clearInterval(this.pingT);
      this.pingT = setInterval(() => this.ping(), 2000);
      this.h.onOpen?.();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (ws !== this.ws) return;
      let m: NetMsg;
      try {
        m = JSON.parse(String(ev.data)) as NetMsg;
      } catch {
        return;
      }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'pong') {
        const r = performance.now() - Number(m.ts);
        this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.3 : r;
        return;
      }
      this.h.onMessage(m);
    };
    ws.onclose = () => {
      if (ws !== this.ws) return;
      this.ws = null;
      clearInterval(this.pingT);
      if (this.want) this.scheduleRetry();
      else this.setState('idle');
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleRetry(): void {
    this.ws = null;
    this.setState('retry');
    const wait = Math.min(4000, 400 * Math.pow(1.6, this.retries++));
    clearTimeout(this.retryT);
    this.retryT = setTimeout(() => {
      if (this.want) this.connect();
    }, wait);
  }

  ping(): void {
    this.send({ t: 'ping', ts: performance.now() });
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
