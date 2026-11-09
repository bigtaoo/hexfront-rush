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
const c = new Collector(new ReplayShelf(dir, undefined, quiet), quiet, { trustProxy: true });
const server = collectServer(c, dir);
let base = '';

beforeAll(async () => {
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
    const pre = await fetch(`${base}/r`, { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    const r = await fetch(`${base}/r`, { method: 'POST', body, headers: { 'content-type': 'text/plain', 'cf-connecting-ip': '203.0.113.9' } });
    expect(r.status).toBe(204);
    const docs = readShelf(dir, quiet);
    expect(docs.map((d) => [d.id, d.end, d.platform])).toEqual([['s-00112233aabbccdd', 'lost', 'playgama']]);
    expect(checkReplay(docs[0]!.replay)).toBe(true);
    expect((await fetch(`${base}/r`, { method: 'POST', body: 'nope' })).status).toBe(400);
  });

  it('serves the privacy page, the health check, and 404 for the rest', async () => {
    const p = await fetch(`${base}/privacy`);
    expect(p.status).toBe(200);
    expect(await p.text()).toMatch(/match replays and privacy/);
    const h = await fetch(`${base}/health`);
    expect([h.status, await h.text()]).toEqual([200, 'ok']);
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/%E0%A4%A`)).status).toBe(404);
    expect((await fetch(`${base}/index.html`)).status).toBe(404);
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
