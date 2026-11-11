// Serving the built game (dist/) out of the relay. Three small jobs the relay used to do inline,
// each of which got a request wrong:
//
//   * reading the path out of a URL. `decodeURIComponent` throws on a broken escape (`/%`), and a
//     throw inside a request handler is an uncaught exception, which ends the Node process: one
//     stray request took down every match in every room. A path with a NUL in it (`/%00`) is worse
//     still, because `fs.readFile` throws on it synchronously, past any guard on the decode.
//   * keeping the request under the root. `path.join(root, p).startsWith(root)` is true of a
//     sibling folder whose name merely begins with the root's (`dist` lets `dist-old` through);
//     the root itself, or the separator after it, has to be there.
//   * answering: the MIME type from the name, hashed assets cached forever and the page never.
//
// Node runs the relay as is (built-in type stripping), so this file uses erasable TypeScript only.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

/** The path a URL asks for, with the query dropped and the escapes undone, or null if it cannot be
 *  read as a path at all. A request for the root asks for the page. */
export function urlPath(url: string | undefined): string | null {
  let p: string;
  try {
    p = decodeURIComponent((url || '/').split('?')[0]!);
  } catch {
    return null; // a broken escape: not a path, and not worth a stack trace
  }
  if (p.includes('\0')) return null;
  return p === '/' ? '/index.html' : p;
}

/** The file under `root` that `p` asks for, or null if nothing under `root` answers it. `root`
 *  must already be absolute and normalised. */
export function safeJoin(root: string, p: string): string | null {
  const file = path.resolve(root, '.' + (p.startsWith('/') ? p : '/' + p));
  return file === root || file.startsWith(root + path.sep) ? file : null;
}

/** Answer a GET for the built game: the file, 403 for anything outside the root, 404 for a name
 *  that is not there (and a word about the build when there is no dist/ at all). */
export function serveStatic(root: string, p: string, res: http.ServerResponse): void {
  const file = safeJoin(root, p);
  if (!file) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end(fs.existsSync(root) ? 'not found' : 'no build: run npm run build first');
      return;
    }
    // hashed assets never change; the page itself must always be fresh
    const cache = p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': cache });
    res.end(data);
  });
}
