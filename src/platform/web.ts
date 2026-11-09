import { AdPacing } from './adPacing';
import { SafeStore, type KeyValueStore, type LevelMessage, type Platform } from './types';

export function browserStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Plain web: local storage and no portal. With `?ads=fake` on a local host a pretend ad that
 *  lasts a second plays between matches (paced like a real one), to try the pause and mute. */
export class WebPlatform implements Platform {
  readonly name: string = 'web';
  storage: KeyValueStore = new SafeStore(browserStorage());
  protected readonly pacing = new AdPacing();
  private readonly fakeAds: boolean;
  private playing = false;

  constructor(search = typeof location === 'undefined' ? '' : location.search, host = typeof location === 'undefined' ? '' : location.hostname) {
    this.fakeAds = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) && new URLSearchParams(search).get('ads') === 'fake';
  }

  languages(): string[] {
    if (typeof navigator === 'undefined') return [];
    return [...(navigator.languages ?? []), navigator.language];
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

  onHostMute(_listener: (muted: boolean) => void): void {}
  onHostPause(_listener: (paused: boolean) => void): void {}
  flush(): void {}
}
