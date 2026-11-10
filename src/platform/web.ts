import { AdPacing } from './adPacing';
import { SafeStore, type Board, type KeyValueStore, type LevelMessage, type Platform, type ScoreRow } from './types';

export function browserStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Plain web: local storage and no portal. With `?ads=fake` on a local host a pretend ad that
 *  lasts a second plays between matches (paced like a real one), to try the pause and mute, and
 *  the rewarded offer shows, its pretend ad always watched through; with `?lb=fake` a pretend
 *  leaderboard shows, the player's own best among made-up rows. */
export class WebPlatform implements Platform {
  readonly name: string = 'web';
  storage: KeyValueStore = new SafeStore(browserStorage());
  protected readonly pacing = new AdPacing();
  private readonly fakeAds: boolean;
  private readonly fakeBoard: boolean;
  private readonly mine: Record<Board, number> = { stars: 0, daily: 0 };
  private playing = false;

  constructor(search = typeof location === 'undefined' ? '' : location.search, host = typeof location === 'undefined' ? '' : location.hostname) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);
    const q = new URLSearchParams(search);
    this.fakeAds = local && q.get('ads') === 'fake';
    this.fakeBoard = local && q.get('lb') === 'fake';
    this.lang = q.get('lang');
  }

  /** `?lang=zh` picks the language over the browser's (to check a translation). */
  protected readonly lang: string | null;

  languages(): string[] {
    const own = this.lang ? [this.lang] : [];
    if (typeof navigator === 'undefined') return own;
    return [...own, ...(navigator.languages ?? []), navigator.language];
  }

  loaded(): void {}
  level(_msg: LevelMessage): void {}

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.gameplay(true);
  }
  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.gameplay(false);
  }
  /** A real change of the gameplay bracket (the portal tells its host). */
  protected gameplay(_on: boolean): void {}

  played(ms: number): void {
    this.pacing.played(ms);
  }

  async midgame(onStart: () => void): Promise<void> {
    if (!this.fakeAds || !this.pacing.due()) return;
    this.pacing.shown();
    onStart();
    await new Promise((r) => setTimeout(r, 1000));
  }

  rewardedReady(): boolean {
    return this.fakeAds;
  }

  async rewarded(onStart: () => void): Promise<boolean> {
    if (!this.fakeAds) return false;
    onStart();
    await new Promise((r) => setTimeout(r, 1000));
    return true;
  }

  leaderboardReady(): boolean {
    return this.fakeBoard;
  }

  submitScore(board: Board, score: number): void {
    this.mine[board] = Math.max(this.mine[board], score);
  }

  async topScores(board: Board): Promise<ScoreRow[]> {
    if (!this.fakeBoard) return [];
    const made = (board === 'stars' ? [117, 96, 80, 61, 44, 30, 18, 9, 4] : [41, 33, 20, 12, 7, 5, 3, 2, 1]).map((score, i) => ({ name: `Player ${i + 1}`, score }));
    const all = [...made, { name: 'You', score: this.mine[board] }].sort((a, b) => b.score - a.score);
    return all.map((r, i) => ({ rank: i + 1, ...r }));
  }

  onHostMute(_listener: (muted: boolean) => void): void {}
  onHostPause(_listener: (paused: boolean) => void): void {}
  flush(): void {}
}
