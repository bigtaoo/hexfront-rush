// The head start a rewarded ad pays for: which match it belongs to, and that nothing but that
// match can take it away.

import { beforeEach, describe, expect, it } from 'vitest';
import { HeadStart, HEAD_START_GOLD, keyOf } from './headStart';
import type { MatchKind } from './campaignUi';
import { sideSetup, type ConfigInput } from '../sim/setup';
import { installDom, type FakeEl } from '../test/domFakes';

const stage = (id: number, hard?: boolean): MatchKind => (hard ? { kind: 'stage', id, hard } : { kind: 'stage', id });
const daily = (day: number): MatchKind => ({ kind: 'daily', day });

let boost: FakeEl;
beforeEach(() => {
  boost = installDom('boostBtn').get('boostBtn')!;
});

describe('which match a bonus belongs to', () => {
  it('tells the hard stage from the normal one, and one day from the next', () => {
    expect(keyOf(stage(4))).not.toBe(keyOf(stage(4, true)));
    expect(keyOf(daily(20331))).not.toBe(keyOf(daily(20332)));
    expect(keyOf({ kind: 'quick' })).toBe('q');
  });

  it('reads the same match asked for twice as one, whatever order it was written in', () => {
    const a: MatchKind = { kind: 'stage', id: 4, hard: true };
    const b = { hard: true, id: 4, kind: 'stage' } as MatchKind;
    expect(keyOf(a)).toBe(keyOf(b));
  });
});

describe('an earned head start', () => {
  it('survives a look at another stage and is still there on its own', () => {
    const hs = new HeadStart();
    hs.earned(stage(4));
    // the player backs out to the map and opens the next stage's brief: it used to be dropped here
    hs.show(stage(5), true);
    expect(hs.readyFor(stage(5))).toBe(false);
    hs.show(stage(4), true);
    expect(hs.readyFor(stage(4))).toBe(true);
  });

  it('is spent on its own match and on nothing else', () => {
    const hs = new HeadStart();
    hs.earned(stage(4));
    const other: ConfigInput = { seed: 1, blue: { gold: 300 } };
    hs.apply(stage(5), other);
    expect(other.blue!.gold).toBe(300);
    const mine: ConfigInput = { seed: 1, blue: { gold: 300 } };
    hs.apply(stage(4), mine);
    expect(mine.blue!.gold).toBe(300 + HEAD_START_GOLD);
  });

  it('is good for one attempt', () => {
    const hs = new HeadStart();
    hs.earned(stage(4));
    const first: ConfigInput = { seed: 1 };
    hs.apply(stage(4), first);
    expect(first.blue!.gold).toBe(sideSetup().gold + HEAD_START_GOLD);
    const again: ConfigInput = { seed: 1 };
    hs.apply(stage(4), again);
    expect(again.blue).toBeUndefined();
    expect(hs.readyFor(stage(4))).toBe(false);
  });

  it('leaves the rest of the side alone', () => {
    const hs = new HeadStart();
    hs.earned(daily(20331));
    const c: ConfigInput = { seed: 7, blue: { gold: 150, towers: 2 }, red: { gold: 400 } };
    hs.apply(daily(20331), c);
    expect(c.blue).toEqual({ gold: 150 + HEAD_START_GOLD, towers: 2 });
    expect(c.red).toEqual({ gold: 400 });
  });
});

describe('the brief offer', () => {
  it('reads as ready on the stage that earned it and as an ad on any other', () => {
    const hs = new HeadStart();
    hs.earned(stage(4));
    hs.show(stage(4), true);
    expect(boost.hidden).toBe(false);
    expect(boost.classList.contains('on')).toBe(true);
    expect(boost.disabled).toBe(true); // nothing more to watch for this one
    hs.show(stage(5), true);
    expect(boost.classList.contains('on')).toBe(false);
    expect(boost.disabled).toBe(false);
  });

  it('is hidden where no rewarded ad can play, unless one was already earned', () => {
    const hs = new HeadStart();
    hs.show(stage(4), false);
    expect(boost.hidden).toBe(true);
    hs.earned(stage(4));
    hs.show(stage(4), false);
    expect(boost.hidden).toBe(false);
  });

  it('is dead while the ad is in flight', () => {
    const hs = new HeadStart();
    hs.busy = true;
    hs.show(stage(4), true);
    expect(boost.disabled).toBe(true);
  });
});
