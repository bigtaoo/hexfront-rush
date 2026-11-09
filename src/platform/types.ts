// What the game needs from the page it runs in: plain web (web.ts) or Playgama's portal
// (playgama/PlaygamaPlatform.ts). After Potion Siege's platform/types.ts, cut to what a
// one-screen match game uses: storage, the language, the lifecycle messages, the gameplay
// brackets, one paced interstitial between matches, and the host's pause and sound switches.

/** A key/value store that behaves like localStorage. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Bridge's level messages (the game reports each match's start and end). */
export type LevelMessage = 'level_started' | 'level_completed' | 'level_failed';

export interface Platform {
  /** Short id for the console line, e.g. 'web' or 'playgama'. */
  readonly name: string;
  storage: KeyValueStore;
  /** Preferred languages, most preferred first. */
  languages(): string[];
  /** The game finished loading and can be played (Bridge's game_ready). */
  loaded(): void;
  level(msg: LevelMessage): void;
  /** Gameplay brackets; repeats are dropped, so only real changes reach the host. */
  gameplayStart(): void;
  gameplayStop(): void;
  /** `ms` of a match went by (interstitial pacing). */
  played(ms: number): void;
  /** One interstitial at a natural break, if one is due: `onStart` runs when it is on screen
   *  (pause and mute there); resolves when it is over or skipped. */
  midgame(onStart: () => void): Promise<void>;
  /** Called with the host's mute state now and whenever it changes. */
  onHostMute(listener: (muted: boolean) => void): void;
  /** Called whenever the host pauses (true) or resumes (false) the game. */
  onHostPause(listener: (paused: boolean) => void): void;
  /** Sends any batched save at once (the page may be on its way out). */
  flush(): void;
}

/** Storage that never throws: falls back to memory when the real one does. */
export class SafeStore implements KeyValueStore {
  private readonly memory = new Map<string, string>();

  constructor(private readonly inner: KeyValueStore | null) {}

  getItem(key: string): string | null {
    try {
      const v = this.inner?.getItem(key);
      if (typeof v === 'string') return v;
    } catch {
      /* fall through to memory */
    }
    return this.memory.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.memory.set(key, value);
    try {
      this.inner?.setItem(key, value);
    } catch {
      /* memory keeps it for this session */
    }
  }
}
