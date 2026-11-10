import { describe, expect, it } from 'vitest';
import { AD_PLAY_MS, AD_START_MS, PlaygamaBridge, type Timers } from './bridge';
import { BridgeStore } from './bridgeStore';
import { fakeBridge } from './testBridge';

/** Timers a test moves by hand. */
function handTimers(): Timers & { advance(ms: number): void } {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    set: (fn, ms) => {
      const id = next++;
      due.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (t) => void due.delete(t as number),
    now: () => now,
    advance(ms) {
      now += ms;
      for (const [id, d] of [...due]) {
        if (d.at > now) continue;
        due.delete(id);
        d.fn();
      }
    },
  };
}

const noWait = () => new Promise<void>(() => {});

describe('PlaygamaBridge', () => {
  it('is a no-op without the script', async () => {
    const b = new PlaygamaBridge({}, noWait);
    expect(await b.init()).toBe(false);
    b.send('game_ready');
    expect(await b.load(['k'])).toEqual(new Map());
    expect(await b.interstitial()).toBe(false);
    expect(b.platformId()).toBeNull();
  });

  it('gives up an initialize() that never answers', async () => {
    const b = new PlaygamaBridge({ bridge: { initialize: () => new Promise(() => {}) } }, () => Promise.resolve());
    expect(await b.init()).toBe(false);
  });

  it('reads the platform, language, sound and pause, and saves through storage', async () => {
    const f = fakeBridge({ id: 'playgama', language: 'de', audio: false, stored: { a: 'x', b: { n: 1 } } });
    const b = new PlaygamaBridge(f.global, noWait);
    expect(await b.init()).toBe(true);
    expect(b.platformId()).toBe('playgama');
    expect(b.language()).toBe('de');
    const muted: boolean[] = [];
    b.onMute((m) => muted.push(m));
    f.emit('audio_state_changed', true);
    expect(muted).toEqual([true, false]);
    const paused: boolean[] = [];
    b.onPause((p) => paused.push(p));
    f.emit('pause_state_changed', true);
    expect(paused).toEqual([true]);
    const got = await b.load(['a', 'b', 'c']);
    expect(got.get('a')).toBe('x');
    expect(got.get('b')).toBe('{"n":1}');
    expect(got.has('c')).toBe(false);
    b.send('game_ready');
    expect(f.messages).toEqual(['game_ready']);
  });

  it('shows an interstitial and resolves on its end', async () => {
    const f = fakeBridge();
    const t = handTimers();
    const b = new PlaygamaBridge(f.global, noWait, t);
    await b.init();
    let started = 0;
    const done = b.interstitial(() => started++);
    expect(f.shown).toBe(1);
    f.emit('interstitial_state_changed', 'opened');
    expect(started).toBe(1);
    f.emit('interstitial_state_changed', 'closed');
    expect(await done).toBe(true);
  });

  it('grants a rewarded ad only once the platform says rewarded, never on a bare close', async () => {
    const f = fakeBridge();
    const b = new PlaygamaBridge(f.global, noWait, handTimers());
    await b.init();
    expect(b.rewardedSupported()).toBe(true);
    const skipped = b.rewarded();
    f.emit('rewarded_state_changed', 'opened');
    f.emit('rewarded_state_changed', 'closed');
    expect(await skipped).toBe(false);
    const watched = b.rewarded();
    f.emit('rewarded_state_changed', 'opened');
    f.emit('rewarded_state_changed', 'rewarded');
    f.emit('rewarded_state_changed', 'closed');
    expect(await watched).toBe(true);
    expect(f.rewards).toBe(2);
    // an interstitial's states never answer a rewarded ad
    const inter = b.interstitial();
    f.emit('interstitial_state_changed', 'closed');
    await inter;
    const third = b.rewarded();
    f.emit('rewarded_state_changed', 'opened');
    f.emit('interstitial_state_changed', 'closed');
    f.emit('rewarded_state_changed', 'rewarded');
    f.emit('rewarded_state_changed', 'closed');
    expect(await third).toBe(true);
  });

  it('uses the leaderboard only where Bridge runs it in the game, and reads its rows defensively', async () => {
    const off = fakeBridge();
    const b0 = new PlaygamaBridge(off.global, noWait);
    await b0.init();
    expect(b0.leaderboardShown()).toBe(false);
    b0.setScore('campaign_stars', 5);
    expect(off.scores).toEqual([]);
    expect(await b0.entries('campaign_stars')).toEqual([]);
    const f = fakeBridge({
      board: 'in_game',
      entries: [{ rank: 2, name: 'B', score: 7 }, { rank: 1, name: 'A', score: 9 }, { name: 'bad', score: 'x' }, { score: 3 }],
    });
    const b = new PlaygamaBridge(f.global, noWait);
    await b.init();
    expect(b.leaderboardShown()).toBe(true);
    b.setScore('campaign_stars', 12);
    await Promise.resolve();
    expect(f.scores).toEqual([['campaign_stars', 12]]);
    expect(await b.entries('campaign_stars')).toEqual([
      { rank: 1, name: 'A', score: 9 },
      { rank: 2, name: 'B', score: 7 },
      { rank: 3, name: '', score: 3 },
    ]);
  });

  it('gives up an ad that never opens, and opens none over a given-up one until it ends', async () => {
    const f = fakeBridge();
    const t = handTimers();
    const b = new PlaygamaBridge(f.global, noWait, t);
    await b.init();
    const first = b.interstitial();
    t.advance(AD_START_MS);
    expect(await first).toBe(false);
    expect(await b.interstitial()).toBe(false);
    expect(f.shown).toBe(1);
    // its late end frees the slot
    f.emit('interstitial_state_changed', 'closed');
    const third = b.interstitial();
    expect(f.shown).toBe(2);
    f.emit('interstitial_state_changed', 'failed');
    expect(await third).toBe(false);
  });

  it('gives up an ad that opened but never closes', async () => {
    const f = fakeBridge();
    const t = handTimers();
    const b = new PlaygamaBridge(f.global, noWait, t);
    await b.init();
    const p = b.interstitial();
    f.emit('interstitial_state_changed', 'opened');
    t.advance(AD_PLAY_MS);
    expect(await p).toBe(true);
    // it may still be on screen: none opens over it until AD_PLAY_MS more went by
    expect(await b.interstitial()).toBe(false);
    expect(f.shown).toBe(1);
    t.advance(AD_PLAY_MS);
    void b.interstitial();
    expect(f.shown).toBe(2);
  });
});

describe('BridgeStore', () => {
  it('batches writes into one save, and writes at once while hidden', async () => {
    const f = fakeBridge({ stored: { s: 'old' } });
    const b = new PlaygamaBridge(f.global, noWait);
    await b.init();
    const later: (() => void)[] = [];
    let hidden = false;
    const s = await BridgeStore.create(b, ['s'], (fn) => later.push(fn), () => hidden);
    expect(s.getItem('s')).toBe('old');
    s.setItem('s', '1');
    s.setItem('t', '2');
    expect(s.getItem('s')).toBe('1');
    expect(later.length).toBe(1);
    later[0]!();
    await Promise.resolve();
    expect(f.saved).toEqual([[['s', 't'], ['1', '2']]]);
    hidden = true;
    s.setItem('s', '3');
    await Promise.resolve();
    expect(f.saved.length).toBe(2);
  });
});
