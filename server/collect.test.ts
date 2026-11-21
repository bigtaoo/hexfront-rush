// The collector on its own (collect.ts), over real HTTP: a solo replay kept, the privacy page, the
// health check (a full disk or a folder gone is unhealthy) and 404 for the rest.

import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkReplay, makeReplay } from '../src/sim/replay.ts';
import { playMatch } from '../src/test/scriptedPlayer.ts';
import { collectServer, healthy } from './collect.ts';
import { Collector } from './collector.ts';
import { readShelf, ReplayShelf } from './replayShelf.ts';

const dir = mkdtempSync(join(tmpdir(), 'hf-collect-'));
const quiet = () => {};
// bodyMs is wall clock: the collector drops a body that takes too long to arrive. Over loopback
// nothing is ever slow, but a CI runner sharing two cores with the rest of the suite can starve
// this process past the 20 s default while the bytes sit in the socket, and the dropped socket
// reached the test as ECONNRESET. The limit itself is covered in collectorLimits.test.ts.
const c = new Collector(new ReplayShelf(dir, undefined, quiet), quiet, { trustProxy: true, bodyMs: 180_000 });
const server = collectServer(c, dir);
let base = '';

/**
 * One request, on a connection of its own. Between two of the requests below a whole match is
 * replayed, which on a loaded CI runner takes longer than the five seconds node keeps a spare
 * connection alive: the server closed the idle socket, undici reached for it anyway, and the next
 * request came back as ECONNRESET. Raising the server's idle limit only moves that race further
 * out; asking for no reuse at all removes it, however slow the machine is.
 */
function req(path: string, o: RequestInit = {}): Promise<Response> {
  return fetch(`${base}${path}`, { ...o, headers: { ...o.headers, connection: 'close' } });
}

beforeAll(async () => {
  // Node's own wall-clock limits on a request. They are there for the real internet; here they
  // only ever fire because this machine is busy, so they are given the room the work really takes.
  server.headersTimeout = 180_000;
  server.requestTimeout = 180_000;
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  c.close();
  await new Promise((done) => server.close(done));
  rmSync(dir, { recursive: true, force: true });
});

describe('collect.ts', () => {
  it('keeps a solo replay posted as the game posts it', async () => {
    const m = playMatch(808);
    const body = JSON.stringify({ id: '00112233aabbccdd', end: 'lost', build: '0.4.0+abc', platform: 'playgama', replay: makeReplay(m.config, m.log, m.engine) });
    const pre = await req('/r', { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    const r = await req('/r', { method: 'POST', body, headers: { 'content-type': 'text/plain', 'cf-connecting-ip': '203.0.113.9' } });
    expect(r.status).toBe(204);
    const docs = readShelf(dir, quiet);
    expect(docs.map((d) => [d.id, d.end, d.platform])).toEqual([['s-00112233aabbccdd', 'lost', 'playgama']]);
    expect(checkReplay(docs[0]!.replay)).toBe(true);
    expect((await req('/r', { method: 'POST', body: 'nope' })).status).toBe(400);
  });

  it('serves the privacy page, the health check, and 404 for the rest', async () => {
    const p = await req('/privacy');
    expect(p.status).toBe(200);
    expect(await p.text()).toMatch(/match replays and privacy/);
    const h = await req('/health');
    expect([h.status, await h.text()]).toEqual([200, 'ok']);
    expect((await req('/')).status).toBe(404);
    expect((await req('/%E0%A4%A')).status).toBe(404);
    expect((await req('/index.html')).status).toBe(404);
  });

  it('is unhealthy when the disk is nearly full or the folder is gone', async () => {
    expect(healthy(dir)).toBe(true);
    expect(healthy(dir, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(healthy(join(dir, 'missing'))).toBe(false);
    const full = collectServer(c, dir, Number.MAX_SAFE_INTEGER);
    await new Promise<void>((done) => full.listen(0, '127.0.0.1', done));
    const r = await fetch(`http://127.0.0.1:${(full.address() as AddressInfo).port}/health`);
    expect([r.status, await r.text()]).toEqual([503, 'unhealthy']);
    await new Promise((done) => full.close(done));
  });
});
