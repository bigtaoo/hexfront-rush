// The relay's replay shelf (replayShelf.ts): what an upload must look like, keeping, replacing,
// pruning and capping the files, and reading them back for `npm run replays`.

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeReplay, type Replay } from '../src/sim/replay.ts';
import { playMatch } from '../src/test/scriptedPlayer.ts';
import { cleanUpload, KEEP_DAYS, readShelf, ReplayShelf, type ShelfDoc } from './replayShelf.ts';

const m = playMatch(2024);
const rep = makeReplay(m.config, m.log, m.engine);
const DAY = 24 * 3600_000;
const NOW = Date.UTC(2026, 10, 9);

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'hf-shelf-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const upload = (over: Record<string, unknown> = {}) => ({ id: 'a1b2c3d4e5f60718', end: 'won', build: '0.4.0', platform: 'web', replay: rep, ...over });
const doc = (id: string, at: number, replay: Replay = rep): ShelfDoc => ({ id, kind: 'solo', end: 'won', at, replay });
const quiet = () => {};

describe('cleanUpload', () => {
  it('keeps a solo match under its own id', () => {
    expect(cleanUpload(upload(), NOW)).toEqual({ id: 's-a1b2c3d4e5f60718', kind: 'solo', end: 'won', at: NOW, build: '0.4.0', platform: 'web', replay: rep });
    // a build or platform that is not a short plain string is left out, not refused
    const d = cleanUpload(upload({ build: 'x'.repeat(41), platform: 'a\nb' }), NOW)!;
    expect(d.build).toBeUndefined();
    expect(d.platform).toBeUndefined();
  });

  it('refuses whatever is not a solo match', () => {
    const online = { ...rep, config: { ...rep.config, aiRed: false } };
    const ai = { ...rep, config: { ...rep.config, aiBlue: true } };
    for (const bad of [
      null,
      'x',
      upload({ id: 'short' }),
      upload({ id: '../../etc/passwd' }),
      upload({ end: 'over' }),
      upload({ replay: { ...rep, log: 'x' } }),
      upload({ replay: online }),
      upload({ replay: ai }),
      upload({ replay: { ...rep, endTick: 0, log: [], checks: [] } }),
    ])
      expect(cleanUpload(bad, NOW)).toBeNull();
  });
});

describe('ReplayShelf', () => {
  it('keeps a replay per id, a later one replacing the earlier, and reads them back', () => {
    const dir = tmp();
    const shelf = new ReplayShelf(dir, undefined, quiet);
    expect(shelf.put(doc('s-one', NOW - 2000))).toBe(true);
    expect(shelf.put(doc('s-two', NOW - 1000))).toBe(true);
    expect(shelf.put({ ...doc('s-one', NOW), end: 'quit' })).toBe(true);
    expect(shelf.count).toBe(2);
    expect(readdirSync(dir).sort()).toEqual(['s-one.json.gz', 's-two.json.gz']);
    const back = readShelf(dir, quiet);
    expect(back.map((d) => [d.id, d.end])).toEqual([
      ['s-two', 'won'],
      ['s-one', 'quit'],
    ]);
    expect(back[0]!.replay).toEqual(rep);
    // a restarted relay finds them, dated as they came
    const again = new ReplayShelf(dir, undefined, quiet);
    expect(again.count).toBe(2);
    expect(again.bytes).toBe(shelf.bytes);
    expect(again.prune(NOW + KEEP_DAYS * DAY - 500)).toBe(1);
    expect(readdirSync(dir)).toEqual(['s-one.json.gz']);
  });

  it('drops the replays older than KEEP_DAYS', () => {
    const shelf = new ReplayShelf(tmp(), undefined, quiet);
    shelf.put(doc('s-old', NOW - (KEEP_DAYS + 1) * DAY));
    shelf.put(doc('s-new', NOW - DAY));
    expect(shelf.prune(NOW)).toBe(1);
    expect(shelf.count).toBe(1);
    expect(shelf.prune(NOW)).toBe(0);
  });

  it('makes room by dropping the oldest, and refuses one that alone is too big', () => {
    const dir = tmp();
    const probe = new ReplayShelf(tmp(), undefined, quiet);
    probe.put(doc('s-x', NOW));
    const one = probe.bytes;
    const logged: unknown[][] = [];
    const shelf = new ReplayShelf(dir, one * 2 + one / 2, (...a) => logged.push(a));
    shelf.put(doc('s-a', NOW - 3000));
    shelf.put(doc('s-b', NOW - 2000));
    shelf.put(doc('s-c', NOW - 1000));
    expect(readdirSync(dir).sort()).toEqual(['s-b.json.gz', 's-c.json.gz']);
    expect(logged.flat().join(' ')).toMatch(/dropped the 1 oldest/);
    // replacing one in place needs no room
    shelf.put({ ...doc('s-b', NOW), end: 'quit' });
    expect(shelf.count).toBe(2);
    const tiny = new ReplayShelf(tmp(), 100, quiet);
    expect(tiny.put(doc('s-big', NOW))).toBe(false);
    expect(tiny.count).toBe(0);
  });

  it('reads plain .json files too, and skips what does not read', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'console.json'), JSON.stringify(rep));
    writeFileSync(join(dir, 'doc.json'), JSON.stringify(doc('s-doc', NOW)));
    writeFileSync(join(dir, 'junk.json'), '{"no":1}');
    writeFileSync(join(dir, 'broken.json.gz'), 'not gzip');
    writeFileSync(join(dir, 'notes.txt'), 'hello');
    const skipped: string[] = [];
    const docs = readShelf(dir, (s) => skipped.push(s));
    expect(docs.map((d) => [d.id, d.kind]).sort()).toEqual([
      ['console', 'solo'],
      ['s-doc', 'solo'],
    ]);
    expect(skipped.join('\n')).toMatch(/skipped junk\.json/);
    expect(skipped.join('\n')).toMatch(/skipped broken\.json\.gz/);
    expect(skipped).toHaveLength(2);
  });
});
