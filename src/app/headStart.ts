// The rewarded ad (Playgama 2.2.x): an offer on the brief before a stage or the daily challenge,
// asked for by the player alone, labelled as an ad, a bonus only (the stage is won without it) and
// good for one attempt: the next match of that stage starts with HEAD_START_GOLD more gold, and
// the offer comes back for the attempt after. Granted only once the ad was watched through
// (Platform.rewarded resolves true); a skipped or failed ad gives nothing. The gold goes into the
// match's config, so a replay of it plays the same.

import { sideSetup, type ConfigInput } from '../sim/setup';
import type { MatchKind } from './campaignUi';
import { $ } from './dom';
import { T } from './i18n';

export const HEAD_START_GOLD = 60;

const keyOf = (m: MatchKind): string => JSON.stringify(m);

export class HeadStart {
  /** The match the bonus is waiting for; null: none earned. */
  private earnedFor: string | null = null;
  busy = false;

  /** Shows the brief's offer for `m`: hidden where no rewarded ad can play, "ready" once earned. */
  show(m: MatchKind, ready: boolean): void {
    if (this.earnedFor !== null && this.earnedFor !== keyOf(m)) this.earnedFor = null;
    const btn = $('boostBtn') as HTMLButtonElement;
    const on = this.earnedFor !== null;
    btn.classList.toggle('hidden', !ready && !on);
    btn.disabled = on || this.busy;
    btn.classList.toggle('on', on);
    btn.querySelector('span')!.textContent = T(on ? 'headStartOn' : 'headStart', { n: HEAD_START_GOLD });
  }

  earned(m: MatchKind): void {
    this.earnedFor = keyOf(m);
  }

  /** Spends the bonus on this match's config if it was earned for it. */
  apply(m: MatchKind, config: ConfigInput): void {
    if (this.earnedFor !== keyOf(m)) return;
    this.earnedFor = null;
    config.blue = { ...config.blue, gold: sideSetup(config.blue).gold + HEAD_START_GOLD };
  }
}
