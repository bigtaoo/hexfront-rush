// The rewarded ad (Playgama 2.2.x): an offer on the brief before a stage or the daily challenge,
// asked for by the player alone, labelled as an ad, a bonus only (the stage is won without it) and
// good for one attempt: the next match of that stage starts with HEAD_START_GOLD more gold, and
// the offer comes back for the attempt after. Granted only once the ad was watched through
// (Platform.rewarded resolves true); a skipped or failed ad gives nothing. The gold goes into the
// match's config, so a replay of it plays the same.
//
// What was earned is kept for the one match it was earned on and nothing else. Looking at another
// stage's brief, going back to the map, even playing something else first: none of them touch it.
// It used to be dropped the moment the brief was shown for any other match, so a player who
// watched the ad and then glanced at the next stage had paid attention for nothing.

import { sideSetup, type ConfigInput } from '../sim/setup';
import type { MatchKind } from './campaignUi';
import { $ } from './dom';
import { T } from './i18n';

export const HEAD_START_GOLD = 60;

/** A match's identity, free of property order: stage 4, hard stage 4 and day 20331 are three
 *  different matches, and the same stage asked for twice is one. */
export const keyOf = (m: MatchKind): string =>
  m.kind === 'stage' ? `s${m.id}${m.hard ? 'h' : ''}` : m.kind === 'daily' ? `d${m.day}` : 'q';

export class HeadStart {
  /** The match the bonus is waiting for; null: none earned. */
  private earnedFor: string | null = null;
  busy = false;

  /** A bonus is waiting for this match. */
  readyFor(m: MatchKind): boolean {
    return this.earnedFor === keyOf(m);
  }

  /** Shows the brief's offer for `m`: hidden where no rewarded ad can play, "ready" once earned. */
  show(m: MatchKind, ready: boolean): void {
    const on = this.readyFor(m);
    const btn = $<HTMLButtonElement>('boostBtn');
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
    if (!this.readyFor(m)) return;
    this.earnedFor = null;
    config.blue = { ...config.blue, gold: sideSetup(config.blue).gold + HEAD_START_GOLD };
  }
}
