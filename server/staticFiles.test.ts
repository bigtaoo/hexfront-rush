// Serving dist/ over real HTTP, because what went wrong here could not be seen from the outside:
// the server answered the request before it, and then the process was gone. Each case below asks
// for the next one afterwards, so a crash shows up as the rest of the file failing too.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { safeJoin, serveStatic, urlPath } from './staticFiles.ts';

// a dist/ with a page and a hashed asset, and a sibling whose name starts with the same letters
const tmp = mkdtempSync(join(tmpdir(), 'hf-static-'));
const ROOT = join(tmp, 'dist');
mkdirSync(join(ROOT, 'assets'), { recursive: true });
writeFileSync(join(ROOT, 'index.html'), '<!doctype html>the game');
writeFileSync(join(ROOT, 'assets', 'app-9f3.js'), 'console.log(1)');
mkdirSync(join(tmp, 'dist-old'));
writeFileSync(join(tmp, 'dist-old', 'secret.txt'), 'the old build');
writeFileSync(join(tmp, 'secret.txt'), 'not for the web');

const server = http.createServer((req, res) => {
  const p = urlPath(req.url);
  if (p === null) {
    res.writeHead(400);
    res.end();
    return;
  }
  serveStatic(ROOT, p, res);
});

beforeAll(() => new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done())));
afterAll(() => {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** A raw GET, so a path the URL parser would tidy up reaches the server as written. */
function get(target: string): Promise<{ code: number; body: string; cache: string; type: string }> {
  return new Promise((done, fail) => {
    const req = http.request({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, path: target }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d: string) => (body += d));
      res.on('end', () =>
        done({
          code: res.statusCode ?? 0,
          body,
          cache: String(res.headers['cache-control'] ?? ''),
          type: String(res.headers['content-type'] ?? ''),
        }),
      );
    });
    req.on('error', fail);
    req.end();
  });
}

describe('reading the path out of a URL', () => {
  it('drops the query and opens the page at the root', () => {
    expect(urlPath('/')).toBe('/index.html');
    expect(urlPath(undefined)).toBe('/index.html');
    expect(urlPath('/?server=wss://x')).toBe('/index.html');
    expect(urlPath('/assets/app-9f3.js?v=2')).toBe('/assets/app-9f3.js');
    expect(urlPath('/a%20b.png')).toBe('/a b.png');
  });

  it('reads a URL that is not a path as no path, rather than throwing out of the handler', () => {
    // `decodeURIComponent` throws on a broken escape, and a NUL throws out of fs.readFile later:
    // either one, uncaught in a request handler, ends the process and every match it is relaying
    expect(urlPath('/%')).toBe(null);
    expect(urlPath('/%zz')).toBe(null);
    expect(urlPath('/%e0%a4%a')).toBe(null);
    expect(urlPath('/%00')).toBe(null);
    expect(urlPath('/a%00.png')).toBe(null);
  });
});

describe('keeping a request under the root', () => {
  it('takes a plain name and the root itself', () => {
    expect(safeJoin(ROOT, '/index.html')).toBe(join(ROOT, 'index.html'));
    expect(safeJoin(ROOT, '/assets/app-9f3.js')).toBe(join(ROOT, 'assets', 'app-9f3.js'));
    expect(safeJoin(ROOT, '/')).toBe(ROOT);
  });

  it('refuses a way out, including a sibling whose name merely starts the same', () => {
    // `join(root, p).startsWith(root)` was true of all of these
    expect(safeJoin(ROOT, '/../secret.txt')).toBe(null);
    expect(safeJoin(ROOT, '/../dist-old/secret.txt')).toBe(null);
    expect(safeJoin(ROOT, '/a/../../dist-old/secret.txt')).toBe(null);
    expect(safeJoin(ROOT, '/..')).toBe(null);
  });
});

describe('the files it answers with', () => {
  it('serves the page fresh and the hashed assets forever', async () => {
    const page = await get('/');
    expect(page.code).toBe(200);
    expect(page.body).toContain('the game');
    expect(page.type).toBe('text/html');
    expect(page.cache).toBe('no-cache');
    const asset = await get('/assets/app-9f3.js');
    expect(asset.code).toBe(200);
    expect(asset.type).toBe('text/javascript');
    expect(asset.cache).toContain('immutable');
  });

  it('stays up and says 400 when the URL is not a path', async () => {
    for (const bad of ['/%', '/%zz', '/%00', '/assets/%e0%a4%a']) expect((await get(bad)).code).toBe(400);
    expect((await get('/')).code).toBe(200); // still there
  });

  it('says 403 to a way out of the root and 404 to a name that is not there', async () => {
    expect((await get('/../secret.txt')).code).toBe(403);
    expect((await get('/../dist-old/secret.txt')).code).toBe(403);
    expect((await get('/..%2fdist-old%2fsecret.txt')).code).toBe(403);
    expect((await get('/nothing/here.png')).code).toBe(404);
    expect((await get('/')).code).toBe(200); // and still there after all of that
  });
});
