// One pacing rule for interstitials (after Potion Siege's platform/adPacing.ts): at most one
// every INTERSTITIAL_MINUTES of play, where play is the time a match is running on screen, so a
// player on the menu or sitting on the results earns none. The clock lives for the session and
// starts over when an ad went on screen. The host's own limits stay on top (Bridge's
// minimumDelayBetweenInterstitial). Pure: no clock, no DOM.

/** The least play between two interstitials, in minutes. */
export const INTERSTITIAL_MINUTES = 2.5;

export class AdPacing {
  private since = 0;

  constructor(readonly gapMs = INTERSTITIAL_MINUTES * 60_000) {}

  /** `ms` of play went by. */
  played(ms: number): void {
    if (ms > 0) this.since += ms;
  }

  /** Whether the next interstitial would be shown. */
  due(): boolean {
    return this.since >= this.gapMs;
  }

  /** An ad went on screen: the clock starts over. */
  shown(): void {
    this.since = 0;
  }
}
