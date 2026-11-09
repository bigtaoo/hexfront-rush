// The relay's replay collector (collector.ts): POST /r for solo uploads, and onlineDoc, which
// turns an online room's frame log and agreed hashes into a replay, desyncs included.

import { EventEmitter } from 'node:events';
import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkReplay, makeReplay } from '../src/sim/replay.ts';
import { desyncVerdict } from '../src/sim/replayDesync.ts';
import { ENGINE_VERSION } from '../src/sim/rules.ts';
import { playMatch, playOnline } from '../src/test/scriptedPlayer.ts';
import { Collector, MAX_BODY, onlineDoc, PER_ADDRESS, type RoomRecord } from './collector.ts';
import { readShelf, ReplayShelf } from './replayShelf.ts';

const dir = mkdtempSync(join(tmpdir(), 'hf-collector-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const quiet = () => {};

const solo = playMatch(606);
const body = JSON.stringify({ id: '0123456789abcdef', end: 'lost', build: '0.4.0', platform: 'web', replay: makeReplay(solo.config, solo.log, solo.engine) });

/** Sends one request through `c.handle`; the status it answered. */
function request(c: Collector, method: string, chunks: string[], o: { path?: string; addr?: string; fwd?: string } = {}): Promise<number | 'not mine'> {
  const req = Object.assign(new EventEmitter(), {
    method,
    headers: o.fwd ? { 'x-forwarded-for': o.fwd } : {},
    socket: { remoteAddress: o.addr ?? '10.0.0.1' },
    resume: () => {},
    destroy: () => {},
  });
  return new Promise((done) => {
    const res = { writeHead: (code: number) => done(code), end: () => {} };
    if (!c.handle(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse, o.path ?? '/r')) return done('not mine');
    for (const ch of chunks) req.emit('data', Buffer.from(ch));
    req.emit('end');
  });
}

describe('POST /r', () => {
  const shelf = new ReplayShelf(dir, undefined, quiet);
  const c = new Collector(shelf, quiet);

  it('keeps a solo upload sent in pieces', async () => {
    expect(await request(c, 'POST', [body.slice(0, 100), body.slice(100)])).toBe(204);
    const docs = readShelf(dir, quiet);
    expect(docs.map((d) => [d.id, d.end, d.build])).toEqual([['s-0123456789abcdef', 'lost', '0.4.0']]);
    expect(checkReplay(docs[0]!.replay)).toBe(true);
  });

  it('answers the preflight, and refuses other methods, junk and big bodies', async () => {
    expect(await request(c, 'OPTIONS', [])).toBe(204);
    expect(await request(c, 'GET', [])).toBe(405);
    expect(await request(c, 'POST', ['{"id":'])).toBe(400);
    expect(await request(c, 'POST', [JSON.stringify({ id: '0123456789abcdef', end: 'won' })])).toBe(400);
    expect(await request(c, 'POST', ['x'.repeat(MAX_BODY), 'x'])).toBe(413);
    expect(await request(c, 'POST', [body], { path: '/' })).toBe('not mine');
    expect(shelf.count).toBe(1);
  });

  it('limits each address, behind a proxy by X-Forwarded-For', async () => {
    const own = new Collector(new ReplayShelf(join(dir, 'limit'), undefined, quiet), quiet, { trustProxy: true });
    // preflights are free; each POST counts, kept or not
    expect(await request(own, 'OPTIONS', [], { fwd: '1.2.3.4' })).toBe(204);
    for (let i = 0; i < PER_ADDRESS; i++) expect(await request(own, 'POST', ['{}'], { fwd: '1.2.3.4, 10.0.0.9' })).toBe(400);
    expect(await request(own, 'POST', [body], { fwd: '1.2.3.4' })).toBe(429);
    expect(await request(own, 'POST', [body], { fwd: '5.6.7.8' })).toBe(204);
    const t = Date.now();
    expect(own.allow('9.9.9.9', t)).toBe(true);
    for (let i = 1; i < PER_ADDRESS; i++) own.allow('9.9.9.9', t);
    expect(own.allow('9.9.9.9', t)).toBe(false);
    expect(own.allow('9.9.9.9', t + 11 * 60_000)).toBe(true);
  });
});

describe('onlineDoc', () => {
  const m = playOnline(4040);
  const final = m.engine.hash();
  const end = m.engine.tick;
  const room = (over: Partial<RoomRecord> = {}): RoomRecord => ({
    code: 'QX7P',
    seed: 4040,
    ev: ENGINE_VERSION,
    log: m.log,
    checks: m.checks,
    reports: [null, null, null],
    desync: null,
    ...over,
  });
  const report = { winner: m.engine.result?.winner ?? 0, h: final, tick: end };

  it('a match both seats finished alike plays back to their end', () => {
    const d = onlineDoc(room({ reports: [null, report, report] }), 1)!;
    expect(d).toMatchObject({ id: 'o-QX7P-4040', kind: 'online', end: 'over', at: 1 });
    expect(d.replay.endTick).toBe(end);
    expect(d.replay.hash).toBe(final);
    expect(d.replay.config).toEqual({ seed: 4040, aiBlue: false, aiRed: false });
    expect(checkReplay(d.replay)).toBe(true);
    expect(d.desync).toBeUndefined();
    // one seat's report is enough
    expect(checkReplay(onlineDoc(room({ reports: [null, null, report] }), 1)!.replay)).toBe(true);
  });

  it('a match left early stops at the last agreed checkpoint', () => {
    const checks = m.checks.filter((c) => c[0] <= 2000);
    const d = onlineDoc(room({ checks }), 1)!;
    expect(d.end).toBe('left');
    expect(d.replay.endTick).toBe(checks[checks.length - 1]![0]);
    expect(checkReplay(d.replay)).toBe(true);
    expect(onlineDoc(room({ checks: [] }), 1)).toBeNull();
  });

  it('a desync keeps the agreed part and the evidence, and the verdict names the right seat', () => {
    const at = 1500;
    const right = m.checks.find((c) => c[0] === at)![1];
    const d = onlineDoc(room({ checks: m.checks.filter((c) => c[0] < at), desync: { tick: at, h: [right, right ^ 0x1234] } }), 1)!;
    expect(d.end).toBe('desync');
    expect(d.replay.endTick).toBe(at - 30);
    expect(checkReplay(d.replay)).toBe(true);
    expect(d.desync!.tick).toBe(at);
    expect(d.desync!.log.every((c) => c[0]! >= at - 30 && c[0]! < at)).toBe(true);
    expect(desyncVerdict(d.replay, d.desync!)).toEqual({ tick: at, hash: right, agree: [1] });
  });

  it('end reports that differ are a desync too', () => {
    const d = onlineDoc(room({ reports: [null, report, { ...report, h: final ^ 1 }] }), 1)!;
    expect(d.end).toBe('desync');
    expect(d.desync!.tick).toBe(end);
    expect(desyncVerdict(d.replay, d.desync!).agree).toEqual([1]);
  });
});
