// The replay collector: POST /r takes the solo matches the game sends (src/app/replayUpload.ts),
// and onlineDoc turns an online room's frames and agreed hashes into the same kind of record, so
// every match can be played again (`npm run replays`). Both go on a ReplayShelf
// (server/replayShelf.ts). The relay (server/relay.ts) and the collector on its own
// (server/collect.ts, the hosted one) both answer through Collector.handle, which also serves the
// privacy page (server/privacy.ts) at /privacy.
//
// Before a byte of a body is read: a sender gets PER_ADDRESS uploads per 10 minutes, and at most
// MAX_BODIES bodies are read at once (503 with Retry-After past that). A body over MAX_BODY gets
// 413, one not done in BODY_MS gets 408. A sender's address is kept in memory for the rate
// limit's window and never written down.
// Node runs this file as is (type stripping).

import type http from 'node:http';
import type { Replay } from '../src/sim/replay.ts';
import { parseReplay } from '../src/sim/replayShape.ts';
import { privacyPage } from './privacy.ts';
import { cleanUpload, type ReplayShelf, type ShelfDoc } from './replayShelf.ts';

/** The largest body POST /r reads: a solo match's replay is a few kilobytes. */
export const MAX_BODY = 256 * 1024;
/** Uploads one address may make per window. */
export const PER_ADDRESS = 40;
/** Bodies read at once, from everyone. */
export const MAX_BODIES = 32;
/** A body not done in this long is dropped (408). */
export const BODY_MS = 20_000;
const WINDOW_MS = 10 * 60_000;
const PRUNE_MS = 3600_000;

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

export interface CollectorOptions {
  /** Behind a proxy (TRUST_PROXY=1): the sender is Cloudflare's CF-Connecting-IP, else the
   *  first X-Forwarded-For address. */
  trustProxy?: boolean;
  /** Who to write to about the data, shown on the privacy page (PRIVACY_CONTACT). */
  contact?: string;
  bodyMs?: number;
  maxBodies?: number;
}

/** The address a request is charged to. */
export function addressOf(req: Pick<http.IncomingMessage, 'headers' | 'socket'>, trustProxy: boolean): string {
  if (trustProxy) {
    const cf = String(req.headers['cf-connecting-ip'] ?? '').trim();
    if (cf) return cf;
    const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]!.trim();
    if (fwd) return fwd;
  }
  return req.socket?.remoteAddress || '?';
}

export class Collector {
  private readonly hits = new Map<string, { from: number; n: number }>();
  private readonly pruneT: ReturnType<typeof setInterval>;
  readonly shelf: ReplayShelf;
  private readonly log: (...a: unknown[]) => void;
  private readonly trustProxy: boolean;
  private readonly bodyMs: number;
  private readonly maxBodies: number;
  private readonly privacy: string;
  /** Bodies being read now. */
  reading = 0;

  // fields set by hand, not as parameter properties: Node strips types but runs nothing else
  constructor(shelf: ReplayShelf, log: (...a: unknown[]) => void = console.log, o: CollectorOptions = {}) {
    this.shelf = shelf;
    this.log = log;
    this.trustProxy = !!o.trustProxy;
    this.bodyMs = o.bodyMs ?? BODY_MS;
    this.maxBodies = o.maxBodies ?? MAX_BODIES;
    this.privacy = privacyPage(o.contact);
    shelf.prune(Date.now());
    this.pruneT = setInterval(() => {
      shelf.prune(Date.now());
      const now = Date.now();
      for (const [a, h] of this.hits) if (now - h.from > WINDOW_MS) this.hits.delete(a);
    }, PRUNE_MS);
    this.pruneT.unref?.();
  }

  /** Stops the hourly prune (tests, a server closing). */
  close(): void {
    clearInterval(this.pruneT);
  }

  /** Whether `addr` may upload now; counts the upload. */
  allow(addr: string, now: number): boolean {
    const h = this.hits.get(addr);
    if (!h || now - h.from > WINDOW_MS) {
      this.hits.set(addr, { from: now, n: 1 });
      return true;
    }
    return ++h.n <= PER_ADDRESS;
  }

  /** Answers /r and /privacy; false for any other path (the caller serves it). */
  handle(req: http.IncomingMessage, res: http.ServerResponse, path: string): boolean {
    if (path === '/privacy') {
      const get = req.method === 'GET' || req.method === 'HEAD';
      res.writeHead(get ? 200 : 405, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'max-age=3600' });
      res.end(req.method === 'GET' ? this.privacy : undefined);
      return true;
    }
    if (path !== '/r') return false;
    let answered = false;
    const end = (code: number, more: Record<string, string> = {}) => {
      if (answered) return;
      answered = true;
      res.writeHead(code, { ...CORS, ...more });
      res.end();
    };
    if (req.method === 'OPTIONS') {
      end(204);
      return true;
    }
    if (req.method !== 'POST') {
      end(405);
      return true;
    }
    if (Number(req.headers['content-length']) > MAX_BODY) {
      req.resume();
      end(413);
      return true;
    }
    if (this.reading >= this.maxBodies) {
      req.resume();
      end(503, { 'retry-after': '5' });
      return true;
    }
    if (!this.allow(addressOf(req, this.trustProxy), Date.now())) {
      req.resume();
      end(429);
      return true;
    }
    this.reading++;
    let open = true;
    const done = () => {
      if (!open) return;
      open = false;
      this.reading--;
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      done();
      end(408);
      req.destroy();
    }, this.bodyMs);
    const parts: Buffer[] = [];
    let size = 0;
    req.on('data', (b: Buffer) => {
      if (!open) return;
      size += b.length;
      if (size > MAX_BODY) {
        done();
        end(413);
        req.destroy();
        return;
      }
      parts.push(b);
    });
    req.on('error', done);
    req.on('end', () => {
      if (!open) return;
      done();
      let doc: ShelfDoc | null = null;
      try {
        doc = cleanUpload(JSON.parse(Buffer.concat(parts).toString('utf8')), Date.now());
      } catch {
        doc = null;
      }
      if (!doc) return end(400);
      try {
        this.shelf.put(doc);
      } catch (e) {
        this.log('replays: could not keep', doc.id, e instanceof Error ? e.message : e);
        return end(500);
      }
      end(204);
    });
    // a sender gone mid-body frees its place
    req.on('close', () => {
      if (open && !req.complete) done();
    });
    return true;
  }
}

/** What the relay knows of an online match when its room closes. */
export interface RoomRecord {
  code: string;
  seed: number;
  /** The engine version both seats said they run (they may not differ). */
  ev: number;
  /** The frame broadcaster's log: [frame, seat, flip, 0, 0, ff]. */
  log: readonly number[][];
  /** [tick, hash] both seats reported alike. */
  checks: readonly [number, number][];
  /** The seats' end reports (index 1, 2). */
  reports: readonly ({ winner: number; h: number; tick: number } | null)[];
  desync: { tick: number; h: [number, number] } | null;
}

/** The record of an online match, played to the last hash the relay trusts: the seats' agreed
 *  end, else one seat's end report, else the last agreed checkpoint. With a desync, it stops at
 *  the last agreed checkpoint before it, and `desync` holds the two hashes the seats sent at the
 *  first disagreement: `npm run replays` says which of them the engine agrees with. Null when
 *  nothing was confirmed yet. */
export function onlineDoc(r: RoomRecord, at: number): ShelfDoc | null {
  const [, a, b] = r.reports;
  let desync = r.desync;
  if (!desync && a && b && a.tick === b.tick && a.h !== b.h) desync = { tick: a.tick, h: [a.h, b.h] };
  let end: { tick: number; h: number } | null = null;
  if (!desync) end = a && b && a.h === b.h ? a : (a ?? b ?? null);
  if (!end) {
    const last = [...r.checks].reverse().find((c) => !desync || c[0] < desync.tick);
    if (last) end = { tick: last[0], h: last[1] };
  }
  if (!end || end.tick <= 0) return null;
  const endTick = end.tick;
  const raw: Replay = {
    v: r.ev,
    config: { seed: r.seed >>> 0, aiBlue: false, aiRed: false },
    log: r.log.filter((c) => c[0]! < endTick).map((c) => c.slice()),
    endTick,
    hash: end.h >>> 0,
    checks: r.checks.filter((c) => c[0] <= endTick).map((c) => [c[0], c[1] >>> 0] as [number, number]),
    result: null,
  };
  const replay = parseReplay(raw);
  if (!replay) return null;
  const doc: ShelfDoc = { id: `o-${r.code}-${r.seed}`, kind: 'online', end: desync ? 'desync' : a || b ? 'over' : 'left', at, replay };
  if (desync) {
    const to = desync.tick;
    doc.desync = { tick: to, h: [desync.h[0] >>> 0, desync.h[1] >>> 0], log: r.log.filter((c) => c[0]! >= endTick && c[0]! < to).map((c) => c.slice()) };
  }
  return doc;
}
