// The ads the game shows and the head start one of them pays for.
//
// Two kinds, both through the platform (platform/types.ts): the paced interstitial after a match
// (adPacing.ts decides whether this one is shown at all) and the rewarded ad the brief offers for
// starting gold. Either way the ad is on screen over the canvas, so the game pauses and mutes
// while it is there and picks up when it goes (Game.refreshPause). Only one ad is in flight at a
// time: `busy` drops the taps that come while one is pending, and the buttons that start a match
// read it so a match never begins under an ad.

import type { Game } from './game';
import { HeadStart } from './headStart';

export class Ads {
  /** An ad is on screen: one of the pauses that silence the game. */
  private onScreen = false;
  /** An ad was asked for and has not come back yet. */
  private pending = false;
  /** The brief's head start, earned by a rewarded ad and spent on the next match. */
  readonly headStart = new HeadStart();

  constructor(private readonly g: Game) {}

  /** An ad is on screen (Game's pause reads this). */
  get paused(): boolean {
    return this.onScreen;
  }
  /** An ad is on its way or on screen: the buttons that start a match wait. */
  get busy(): boolean {
    return this.pending;
  }

  /** From the results: the paced interstitial first, then `then`. Taps while one is pending are
   *  dropped, and an ad that fails is simply not shown — `then` runs either way. */
  afterAd(then: () => void): void {
    if (this.pending) return;
    this.pending = true;
    this.g.platform
      .midgame(() => this.screen(true))
      .catch(() => {})
      .then(() => {
        this.pending = false;
        this.screen(false);
        then();
      });
  }

  /** The brief's offer: a rewarded ad the player asked for; watched through, the next match of
   *  this stage starts with the head start. */
  watchForHeadStart(): void {
    const hs = this.headStart, m = this.g.match;
    if (hs.busy || this.pending || m.kind === 'quick') return;
    this.g.sound.play('tap');
    hs.busy = this.pending = true;
    hs.show(m, true);
    this.g.platform
      .rewarded(() => this.screen(true))
      .catch(() => false)
      .then((ok) => {
        hs.busy = this.pending = false;
        this.screen(false);
        if (ok) hs.earned(m);
        if (this.g.state === 'brief') hs.show(m, this.g.platform.rewardedReady());
      });
  }

  private screen(on: boolean): void {
    this.onScreen = on;
    this.g.refreshPause();
  }
}
