// Hexfront Rush's replay collector on its own, the hosted one (server/deploy/): HTTP only, no
// WebSocket, no game files. It answers
//   POST /r       a solo match's replay (server/collector.ts), kept on the shelf (replayShelf.ts);
//   GET /privacy  what is kept and for how long (server/privacy.ts);
//   GET /health   200 `ok` while the shelf's folder takes writes with MIN_FREE left on its disk,
//                 503 `unhealthy` otherwise (the container's healthcheck), never rate limited;
// and 404 to anything else.
//
//   node server/collect.ts [port]
// Settings (environment): PORT (8787), REPLAY_DIR (data/replays; the image sets /data/replays),
// REPLAY_BYTES (1 GiB), TRUST_PROXY=1 behind Cloudflare or another proxy, PRIVACY_CONTACT.
// Node runs this file as is (type stripping), so it uses erasable TypeScript only.

import { accessSync, constants, mkdirSync, statfsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Collector } from './collector.ts';
import { ReplayShelf } from './replayShelf.ts';

/** Free disk below this and /health answers 503. */
export const MIN_FREE = 256 * 1024 * 1024;

/** Whether `dir` takes writes with at least `minFree` bytes left on its disk. */
export function healthy(dir: string, minFree = MIN_FREE): boolean {
  try {
    accessSync(dir, constants.W_OK);
    const s = statfsSync(dir);
    return s.bavail * s.bsize >= minFree;
  } catch {
    return false;
  }
}

/** The collector's HTTP server (not listening yet). */
export function collectServer(c: Collector, dir: string, minFree = MIN_FREE): http.Server {
  return http.createServer((req, res) => {
    let p = '/';
    try {
      p = decodeURIComponent((req.url || '/').split('?')[0]!);
    } catch {
      /* a broken escape is just an unknown path */
    }
    if (c.handle(req, res, p)) return;
    req.resume();
    if (p === '/health') {
      const ok = healthy(dir, minFree);
      res.writeHead(ok ? 200 : 503, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end(ok ? 'ok' : 'unhealthy');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
}

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(0, 19).replace('T', ' '), ...a);

function main(): void {
  const port = Number(process.argv[2] || process.env.PORT || 8787);
  const dir = process.env.REPLAY_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'replays');
  mkdirSync(dir, { recursive: true });
  const shelf = new ReplayShelf(dir, Number(process.env.REPLAY_BYTES) || undefined, log);
  const c = new Collector(shelf, log, { trustProxy: process.env.TRUST_PROXY === '1', contact: process.env.PRIVACY_CONTACT });
  const server = collectServer(c, dir);
  // a slow sender cannot hold a socket open forever (Collector times bodies out itself too)
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.listen(port, () => log(`Hexfront replay collector on :${port}, ${shelf.count} replays in ${dir}`));
  const stop = () => {
    c.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
