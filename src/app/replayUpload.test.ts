// The solo replay upload (replayUpload.ts) and reading a dropped replay (replayFile.ts).

import { describe, expect, it } from 'vitest';
import { Engine } from '../sim/engine';
import type { PackedCmd } from '../sim/input';
import { checkReplay, type Replay } from '../sim/replay';
import { TEAM_BLUE, TEAM_NONE, TEAM_RED } from '../sim/rules';
import { playMatch } from '../test/scriptedPlayer';
import { readReplayFile, replayFromJson } from './replayFile';
import { HIDDEN_TICKS, privacyUrl, randomId, ReplayUpload, replayUrl, type ReplayPost } from './replayUpload';

function rig(share = true) {
  const sent: ReplayPost[] = [];
  const urls: string[] = [];
  let sharing = share;
  let n = 0;
  const up = new ReplayUpload(
    'http://relay/r',
    () => sharing,
    '0.4.0',
    'web',
    (url, body) => {
      urls.push(url);
      sent.push(JSON.parse(body) as ReplayPost);
    },
    () => `id${++n}`,
  );
  return { up, sent, urls, setSharing: (s: boolean) => (sharing = s) };
}

function run(e: Engine, ticks: number) {
  for (let i = 0; i < ticks; i++) e.step(null);
}

/** An engine standing at a result: `winner` won (TEAM_NONE: a draw). */
function ended(winner: number): Engine {
  const e = new Engine({ seed: 5, aiBlue: false, aiRed: true });
  run(e, 40);
  e.result = { winner, reason: 'time', blue: 3, red: 3, tick: e.tick };
  return e;
}

describe('replay upload', () => {
  it('sends a finished match as won, lost or drawn for the player', () => {
    for (const [winner, end] of [[TEAM_BLUE, 'won'], [TEAM_RED, 'lost'], [TEAM_NONE, 'drawn']] as const) {
      const { up, sent, urls } = rig();
      up.start(ended(winner), [], TEAM_BLUE);
      up.end();
      expect(sent.map((s) => s.end)).toEqual([end]);
      expect(urls).toEqual(['http://relay/r']);
      expect(sent[0]).toMatchObject({ id: 'id1', build: '0.4.0', platform: 'web' });
    }
    // seen from red, blue's win is a loss
    const { up, sent } = rig();
    up.start(ended(TEAM_BLUE), [], TEAM_RED);
    up.end();
    expect(sent[0]!.end).toBe('lost');
  });

  it('sends a real match that plays back to its own hashes', () => {
    const m = playMatch(31);
    const { up, sent } = rig();
    up.start(m.engine, m.log, TEAM_BLUE);
    up.end();
    expect(sent).toHaveLength(1);
    const back = replayFromJson(sent[0]);
    expect(back).not.toBeNull();
    expect(back!.log).toEqual(m.log);
    expect(checkReplay(back!)).toBe(true);
  });

  it('a match left early goes as quit, and only once', () => {
    const { up, sent } = rig();
    const e = new Engine({ seed: 9, aiBlue: false, aiRed: true });
    const log: PackedCmd[] = [[0, TEAM_BLUE, 4, 0, 0, 0]];
    up.start(e, log, TEAM_BLUE);
    run(e, 120);
    up.end();
    up.end();
    up.hidden();
    expect(sent.map((s) => [s.end, s.replay.endTick, s.replay.log.length])).toEqual([['quit', 120, 1]]);
  });

  it('sends nothing when the player opted out, or nothing was played', () => {
    const { up, sent, setSharing } = rig(false);
    const e = new Engine({ seed: 9, aiBlue: false, aiRed: true });
    up.start(e, [], TEAM_BLUE);
    run(e, 100);
    up.hidden();
    up.end();
    expect(sent).toHaveLength(0);
    setSharing(true);
    up.start(new Engine({ seed: 9, aiBlue: false, aiRed: true }), [], TEAM_BLUE);
    up.hidden();
    up.end();
    expect(sent).toHaveLength(0);
  });

  it('a hidden page sends the match so far, at most once per HIDDEN_TICKS, then the end as well', () => {
    const { up, sent } = rig();
    const e = new Engine({ seed: 9, aiBlue: false, aiRed: true });
    up.start(e, [], TEAM_BLUE);
    run(e, 60);
    up.hidden();
    up.hidden();
    run(e, HIDDEN_TICKS - 1);
    up.hidden();
    run(e, 1);
    up.hidden();
    up.end();
    expect(sent.map((s) => [s.end, s.replay.endTick])).toEqual([
      ['hidden', 60],
      ['hidden', 60 + HIDDEN_TICKS],
      ['quit', 60 + HIDDEN_TICKS],
    ]);
    // one match, one id: the later uploads replace the earlier ones on the shelf
    expect(new Set(sent.map((s) => s.id))).toEqual(new Set(['id1']));
  });

  it('a hidden page after the result sends nothing more; a new match gets a new id', () => {
    const { up, sent } = rig();
    const e = ended(TEAM_BLUE);
    up.start(e, [], TEAM_BLUE);
    up.hidden();
    expect(sent).toHaveLength(0);
    up.end();
    up.start(ended(TEAM_RED), [], TEAM_BLUE);
    up.end();
    expect(sent.map((s) => [s.id, s.end])).toEqual([
      ['id1', 'won'],
      ['id2', 'lost'],
    ]);
  });

  it('listens for the page being hidden and left', () => {
    const { up, sent } = rig();
    const on: Record<string, () => void> = {};
    const doc = { visibilityState: 'visible' as DocumentVisibilityState, addEventListener: (t: string, f: () => void) => (on[t] = f) };
    const win = { addEventListener: (t: string, f: () => void) => (on[t] = f) };
    up.listen(doc as unknown as Document, win as unknown as Window);
    const e = new Engine({ seed: 9, aiBlue: false, aiRed: true });
    up.start(e, [], TEAM_BLUE);
    run(e, 30);
    on.visibilitychange!();
    expect(sent).toHaveLength(0);
    doc.visibilityState = 'hidden';
    on.visibilitychange!();
    run(e, HIDDEN_TICKS);
    on.pagehide!();
    expect(sent.map((s) => s.end)).toEqual(['hidden', 'hidden']);
  });

  it('makes random 16-digit ids', () => {
    const a = randomId();
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(randomId()).not.toBe(a);
  });

  it('finds the URL: the override, else /r beside the relay', () => {
    expect(replayUrl('wss://relay.example.com/ws', undefined)).toBe('https://relay.example.com/r');
    expect(replayUrl('ws://localhost:8787', undefined)).toBe('http://localhost:8787/r');
    expect(replayUrl('ws://localhost:8787', 'https://x.test/up')).toBe('https://x.test/up');
    expect(replayUrl(null, 'https://x.test/up')).toBe('https://x.test/up');
    expect(replayUrl(null, undefined)).toBeNull();
    expect(replayUrl('not a url', undefined)).toBeNull();
  });
});

describe('replay files', () => {
  const m = playMatch(12);
  const { up, sent } = rig();
  up.start(m.engine, m.log, TEAM_BLUE);
  up.end();
  const doc = sent[0]!;
  const rep: Replay = doc.replay;

  it('reads a bare replay or a shelf document, and nothing else', () => {
    expect(replayFromJson(rep)).toEqual(rep);
    expect(replayFromJson({ id: 'x', end: 'won', replay: rep })).toEqual(rep);
    expect(replayFromJson({ replay: { v: 3 } })).toBeNull();
    expect(replayFromJson(null)).toBeNull();
    expect(replayFromJson('x')).toBeNull();
  });

  it('reads a dropped .json and a gzipped .json.gz', async () => {
    const text = JSON.stringify(doc);
    const plain = Object.assign(new Blob([text]), { name: 'r.json' });
    expect(await readReplayFile(plain)).toEqual(rep);
    const gz = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    expect(await readReplayFile(Object.assign(gz, { name: 'abc.json.gz' }))).toEqual(rep);
    expect(await readReplayFile(Object.assign(new Blob(['{nope']), { name: 'r.json' }))).toBeNull();
    expect(await readReplayFile(Object.assign(new Blob([text]), { name: 'r.json.gz' }))).toBeNull();
  });
});

describe('privacyUrl', () => {
  it('is the collector privacy page beside its /r', () => {
    expect(privacyUrl('https://hf.gamestao.com/r')).toBe('https://hf.gamestao.com/privacy');
    expect(privacyUrl('http://localhost:8787/r')).toBe('http://localhost:8787/privacy');
    expect(privacyUrl('https://example.com/hf/r?x=1')).toBe('https://example.com/hf/privacy');
    expect(privacyUrl('https://example.com/upload')).toBeNull();
    expect(privacyUrl('not a url')).toBeNull();
    expect(privacyUrl(undefined)).toBeNull();
  });
});
