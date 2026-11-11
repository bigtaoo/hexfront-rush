// The ads the game shows and the head start one of them pays for.
//
// Two kinds, both through the platform (platform/types.ts): the paced interstitial after a match
// (adPacing.ts decides whether this one is shown at all) and the rewarded ad the brief offers for
// starting gold. Either way the ad is on screen over the canvas, so the game pauses and mutes
// while it is there and picks up when it goes (Game.refreshPause). Only one ad is in flight at a
// time.
//
// A tap that lands while one is in flight is not dropped. There is a real gap between asking for
// an ad and the ad opening -- the host still has to fetch it -- and the panel underneath is live
// the whole time. What the player taps in that gap becomes what happens when the ad is gone: the
// last ask wins, so tapping Again and then Menu ends on the menu rather than in a match, and no
// button is ever quietly dead.

import type { Game } from './game';
import { HeadStart } from './headStart';

export class Ads {
  /** An ad is on screen: one of the pauses that silence the game. */
  private onScreen = false;
  /** An ad was asked for and has not come back yet. */
  private pending = false;
  /** What to do once it is: the last thing the player asked for. */
  private queued: (() => void) | null = null;
  /** The brief's head start, earned by a rewarded ad and spent on the next match. */
  readonly headStart = new HeadStart();

  constructor(private readonly g: Game) {}

  /** An ad is on screen (Game's pause reads this). */
  get paused(): boolean {
    return this.onScreen;
  }
  /** An ad is on its way or on screen. */
  get busy(): boolean {
    return this.pending;
  }

  /** From the results: the paced interstitial first, then `then`. An ad that fails is simply not
   *  shown -- `then` runs either way -- and a second tap while one is in flight replaces what
   *  happens after it rather than starting a second ad. */
  afterAd(then: () => void): void {
    this.queued = then;
    if (this.pending) return;
    this.pending = true;
    this.g.platform
      .midgame(() => this.screen(true))
      .catch(() => {})
      .then(() => {
        this.pending = false;
        this.screen(false);
        this.run();
      });
  }

  /** Act as soon as no ad is in flight, showing none. The brief's Play: tapping it while the
   *  rewarded ad is still coming used to do nothing at all; now the match starts when the ad is
   *  over, with the gold it earned. */
  whenFree(then: () => void): void {
    if (this.pending) this.queued = then;
    else then();
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
        // the bonus is recorded before whatever was tapped meanwhile runs, so a Play tapped
        // during the ad starts the match with it
        if (this.g.state === 'brief') hs.show(m, this.g.platform.rewardedReady());
        this.run();
      });
  }

  private run(): void {
    const then = this.queued;
    this.queued = null;
    then?.();
  }

  private screen(on: boolean): void {
    this.onScreen = on;
    this.g.refreshPause();
  }
}
