// ads.ts: what happens to a tap that lands while an ad is still on its way, and the head start
// a rewarded ad pays for arriving in time for a Play tapped during it.

import { beforeEach, describe, expect, it } from 'vitest';
import { Ads } from './ads';
import type { Game } from './game';
import type { MatchKind } from './campaignUi';
import { installDom } from '../test/domFakes';

/** A promise the test resolves by hand, standing in for an ad that is still loading. */
function deferred<T>(): { p: Promise<T>; settle: (v: T) => void } {
  let settle!: (v: T) => void;
  const p = new Promise<T>((res) => {
    settle = res;
  });
  return { p, settle };
}

/** Let every `.then` chained in the code under test run. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

function rig(match: MatchKind = { kind: 'stage', id: 4 }) {
  const log: string[] = [];
  let mid = deferred<void>();
  let rew = deferred<boolean>();
  const g = {
    match,
    state: 'result' as string,
    pauses: 0,
    sound: { play: (c: string) => log.push(`sound:${c}`) },
    refreshPause: () => void g.pauses++,
    platform: {
      midgame: (onStart: () => void) => {
        log.push('midgame');
        onStart();
        return mid.p;
      },
      rewarded: (onStart: () => void) => {
        log.push('rewarded');
        onStart();
        return rew.p;
      },
      rewardedReady: () => true,
    },
  };
  const ads = new Ads(g as unknown as Game);
  return {
    g,
    ads,
    log,
    /** The ad on screen comes to an end. */
    async endMid() {
      mid.settle();
      mid = deferred<void>();
      await settle();
    },
    async endRewarded(ok: boolean) {
      rew.settle(ok);
      rew = deferred<boolean>();
      await settle();
    },
  };
}

beforeEach(() => {
  installDom('boostBtn');
});

describe('a tap during an ad', () => {
  it('is the one that acts: the last ask wins', async () => {
    const r = rig();
    r.ads.afterAd(() => r.log.push('again'));
    expect(r.log).toEqual(['midgame']);
    // the panel under the ad is live: the player changes their mind
    r.ads.afterAd(() => r.log.push('menu'));
    expect(r.log).toEqual(['midgame']); // no second ad
    await r.endMid();
    expect(r.log).toEqual(['midgame', 'menu']);
  });

  it('still gets through when the ad fails outright', async () => {
    const r = rig();
    r.g.platform.midgame = () => Promise.reject(new Error('no fill'));
    r.ads.afterAd(() => r.log.push('next'));
    await settle();
    expect(r.log).toEqual(['next']);
    expect(r.ads.busy).toBe(false);
  });

  it('leaves the game paused only while the ad is on screen', async () => {
    const r = rig();
    r.ads.afterAd(() => {});
    expect(r.ads.paused).toBe(true);
    expect(r.g.pauses).toBe(1);
    await r.endMid();
    expect(r.ads.paused).toBe(false);
    expect(r.g.pauses).toBe(2);
  });
});

describe('the brief Play tapped while the rewarded ad is in flight', () => {
  it('waits for the ad and starts the match with what it earned', async () => {
    const r = rig();
    r.g.state = 'brief';
    r.ads.watchForHeadStart();
    expect(r.log).toEqual(['sound:tap', 'rewarded']);
    let goldAtStart = false;
    // tapped under the ad: it used to do nothing at all
    r.ads.whenFree(() => {
      goldAtStart = r.ads.headStart.readyFor(r.g.match);
      r.log.push('begin');
    });
    expect(r.log).toEqual(['sound:tap', 'rewarded']);
    await r.endRewarded(true);
    expect(r.log).toEqual(['sound:tap', 'rewarded', 'begin']);
    expect(goldAtStart).toBe(true); // the bonus was recorded before the match began
  });

  it('starts the match anyway when the ad was skipped', async () => {
    const r = rig();
    r.g.state = 'brief';
    r.ads.watchForHeadStart();
    r.ads.whenFree(() => r.log.push('begin'));
    await r.endRewarded(false);
    expect(r.log).toContain('begin');
    expect(r.ads.headStart.readyFor(r.g.match)).toBe(false);
  });

  it('acts at once when nothing is in flight', () => {
    const r = rig();
    r.ads.whenFree(() => r.log.push('begin'));
    expect(r.log).toEqual(['begin']);
  });
});

describe('the rewarded ad itself', () => {
  it('is asked for once, however often the button is tapped', async () => {
    const r = rig();
    r.g.state = 'brief';
    r.ads.watchForHeadStart();
    r.ads.watchForHeadStart();
    expect(r.log.filter((l) => l === 'rewarded').length).toBe(1);
    await r.endRewarded(true);
  });

  it('is not offered on a quick match, which has no brief', () => {
    const r = rig({ kind: 'quick' });
    r.ads.watchForHeadStart();
    expect(r.log).toEqual([]);
  });

  it('does not start while an interstitial is still running', () => {
    const r = rig();
    r.ads.afterAd(() => {});
    r.ads.watchForHeadStart();
    expect(r.log).toEqual(['midgame']);
  });
});
