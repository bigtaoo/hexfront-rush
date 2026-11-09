// The collector's guards before and while a body is read (collector.ts): whose address a request
// is charged to, the declared size, the cap on bodies read at once, the body timeout, a sender
// gone mid-body, and the privacy page it serves beside /r.

import { EventEmitter } from 'node:events';
import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { makeReplay } from '../src/sim/replay.ts';
import { playMatch } from '../src/test/scriptedPlayer.ts';
import { addressOf, Collector, MAX_BODY, type CollectorOptions } from './collector.ts';
import { ReplayShelf } from './replayShelf.ts';

const dir = mkdtempSync(join(tmpdir(), 'hf-limits-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const quiet = () => {};
let n = 0;
const collector = (o: CollectorOptions = {}) => new Collector(new ReplayShelf(join(dir, String(n++)), undefined, quiet), quiet, o);

const solo = playMatch(707);
const body = JSON.stringify({ id: 'fedcba9876543210', end: 'won', replay: makeReplay(solo.config, solo.log, solo.engine) });

interface Open {
  req: EventEmitter & { complete: boolean; destroyed: boolean };
  /** The status and headers it answered with. */
  answer: Promise<{ code: number; headers: Record<string, string>; body: string }>;
}

/** Starts a request through `c.handle`; the test feeds its body. */
function start(c: Collector, method: string, o: { path?: string; headers?: Record<string, string>; addr?: string } = {}): Open {
  const req = Object.assign(new EventEmitter(), {
    method,
    headers: o.headers ?? {},
    socket: { remoteAddress: o.addr ?? '10.0.0.1' },
    complete: false,
    destroyed: false,
    resume: () => {},
    destroy() {
      req.destroyed = true;
    },
  });
  let code = 0;
  let headers: Record<string, string> = {};
  const answer = new Promise<{ code: number; headers: Record<string, string>; body: string }>((done) => {
    const res = {
      writeHead: (c2: number, h: Record<string, string> = {}) => {
        code = c2;
        headers = h;
      },
      end: (b?: string) => done({ code, headers, body: b ?? '' }),
    };
    if (!c.handle(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse, o.path ?? '/r')) done({ code: -1, headers: {}, body: '' });
  });
  return { req, answer };
}

const finish = (o: Open, text: string) => {
  o.req.emit('data', Buffer.from(text));
  o.req.complete = true;
  o.req.emit('end');
  return o.answer;
};

describe('addressOf', () => {
  const req = (headers: Record<string, string>) => ({ headers, socket: { remoteAddress: '10.0.0.7' } }) as unknown as http.IncomingMessage;
  it("behind a proxy reads Cloudflare's header first, then X-Forwarded-For, then the socket", () => {
    expect(addressOf(req({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }), true)).toBe('1.1.1.1');
    expect(addressOf(req({ 'x-forwarded-for': '2.2.2.2, 10.0.0.1' }), true)).toBe('2.2.2.2');
    expect(addressOf(req({}), true)).toBe('10.0.0.7');
  });
  it('trusts no header otherwise', () => {
    expect(addressOf(req({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }), false)).toBe('10.0.0.7');
  });
});

describe('POST /r guards', () => {
  it('refuses a body declared too big before reading it', async () => {
    const c = collector();
    const o = start(c, 'POST', { headers: { 'content-length': String(MAX_BODY + 1) } });
    expect((await o.answer).code).toBe(413);
    expect(c.reading).toBe(0);
  });

  it('reads at most maxBodies at once, then frees the places', async () => {
    const c = collector({ maxBodies: 2 });
    const a = start(c, 'POST');
    const b = start(c, 'POST');
    expect(c.reading).toBe(2);
    const full = await start(c, 'POST').answer;
    expect(full.code).toBe(503);
    expect(full.headers['retry-after']).toBe('5');
    expect((await finish(a, body)).code).toBe(204);
    expect((await finish(b, '{}')).code).toBe(400);
    expect(c.reading).toBe(0);
    expect((await finish(start(c, 'POST'), body)).code).toBe(204);
    expect(c.shelf.count).toBe(1);
  });

  it('drops a body that takes too long', async () => {
    const c = collector({ bodyMs: 20 });
    const o = start(c, 'POST');
    o.req.emit('data', Buffer.from(body.slice(0, 50)));
    expect((await o.answer).code).toBe(408);
    expect(o.req.destroyed).toBe(true);
    expect(c.reading).toBe(0);
    // what comes after the timeout changes nothing
    o.req.emit('data', Buffer.from(body.slice(50)));
    o.req.emit('end');
    expect(c.shelf.count).toBe(0);
  });

  it('frees the place of a sender gone mid-body', () => {
    const c = collector();
    const o = start(c, 'POST');
    o.req.emit('data', Buffer.from('{"id":'));
    expect(c.reading).toBe(1);
    o.req.emit('close');
    expect(c.reading).toBe(0);
    c.close();
  });

  it('frees the place of a body over MAX_BODY', async () => {
    const c = collector();
    const o = start(c, 'POST');
    o.req.emit('data', Buffer.alloc(MAX_BODY + 1, 120));
    expect((await o.answer).code).toBe(413);
    expect(c.reading).toBe(0);
  });
});

describe('/privacy', () => {
  it('serves the page, with the contact escaped', async () => {
    const page = await start(collector({ contact: 'ops <at> example' }), 'GET', { path: '/privacy' }).answer;
    expect(page.code).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.body).toMatch(/15 days/);
    expect(page.body).toMatch(/15 天/);
    expect(page.body).toContain('ops &#60;at&#62; example');
    expect(page.body).not.toContain('<at>');
    expect((await start(collector(), 'GET', { path: '/privacy' }).answer).body).not.toMatch(/Questions:/);
    expect((await start(collector(), 'POST', { path: '/privacy' }).answer).code).toBe(405);
  });
});
