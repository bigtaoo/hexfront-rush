// The Playgama Bridge SDK (v2, https://wiki.playgama.com/playgama/bridge-sdk), wrapped so nothing
// in the game can be broken by it (after Potion Siege's playgama/bridge.ts): the script is missing
// in local dev, under an adblocker and in tests, so every call is a no-op without it, every throw
// or rejection is swallowed, initialize() is bounded (BRIDGE_WAIT_MS), and an ad whose states stop
// coming is given up (AD_START_MS, AD_PLAY_MS). A given-up ad may still be on screen: no other
// opens over it until its own end arrives or AD_PLAY_MS went by.

import type { ScoreRow } from '../types';

type Listener = (...args: unknown[]) => void;

interface Emitter {
  on?: (event: string, cb: Listener) => unknown;
}

/** The SDK as used here; every member optional because it is a remote script. */
export interface BridgeShape {
  initialize?: () => unknown;
  version?: string;
  platform?: Emitter & {
    id?: string;
    language?: string;
    isAudioEnabled?: boolean;
    sendMessage?: (message: string) => unknown;
  };
  storage?: {
    get?: (keys: string[], tryParseJson?: boolean) => unknown;
    set?: (keys: string[], values: string[]) => unknown;
  };
  advertisement?: Emitter & {
    isInterstitialSupported?: boolean;
    showInterstitial?: (placement?: string) => unknown;
    isRewardedSupported?: boolean;
    showRewarded?: (placement?: string) => unknown;
    checkAdBlock?: () => unknown;
  };
  leaderboards?: {
    type?: string;
    setScore?: (id: string, score: number) => unknown;
    getEntries?: (id: string) => unknown;
  };
}

export interface BridgeGlobal {
  bridge?: BridgeShape;
}

/** How long boot waits for initialize(); a blocked platform script never answers. */
export const BRIDGE_WAIT_MS = 5000;
/** An ad not on screen by then is given up as unfilled. */
export const AD_START_MS = 15_000;
/** An ad on screen that never reports its end is given up after this. */
export const AD_PLAY_MS = 300_000;
/** How long boot waits for the adblock probe; no answer counts as no adblocker. */
export const ADBLOCK_WAIT_MS = 1500;

type AdKind = 'interstitial' | 'rewarded';
/** The placements, as playgama-bridge-config.json names them (vite.playgama.config.js). */
export const PLACEMENT = { interstitial: 'match_end', rewarded: 'head_start' } as const;
/** The campaign's leaderboard (its tag in the console and in the config): total stars won. */
export const LEADERBOARD = 'campaign_stars';


export type Wait = (ms: number) => Promise<void>;
export interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (t: unknown) => void;
  now: () => number;
}

async function settle(fn: () => unknown): Promise<unknown> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

function guard(fn: () => void): void {
  try {
    fn();
  } catch {
    /* the game's problem, never the SDK's */
  }
}

export class PlaygamaBridge {
  private sdk: BridgeShape | null = null;
  private adblock = false;
  /** The ad waiting for its end, if any (one at a time, of either kind). */
  private inFlight: { kind: AdKind; listen: (state: unknown) => void; giveUp: () => void } | null = null;
  /** A given-up ad may still be playing until then: none opens over it. */
  private strayUntil = 0;
  private readonly subscribed = new Set<AdKind>();

  constructor(
    private readonly global: BridgeGlobal = globalThis as BridgeGlobal,
    private readonly wait: Wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly timers: Timers = {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      now: () => performance.now(),
    },
  ) {}

  /** Runs initialize() and probes for an adblocker; false without the script, on a rejection
   *  or after BRIDGE_WAIT_MS. */
  async init(): Promise<boolean> {
    const sdk = this.global.bridge;
    if (!sdk || typeof sdk.initialize !== 'function') return false;
    const done = settle(async () => {
      await sdk.initialize?.();
      return true;
    });
    if ((await Promise.race([done, this.wait(BRIDGE_WAIT_MS).then(() => false)])) !== true) return false;
    this.sdk = sdk;
    const probe = settle(() => sdk.advertisement?.checkAdBlock?.());
    this.adblock = (await Promise.race([probe, this.wait(ADBLOCK_WAIT_MS).then(() => false)])) === true;
    return true;
  }

  isReady(): boolean {
    return this.sdk !== null;
  }

  hasAdblock(): boolean {
    return this.adblock;
  }

  /** The platform Bridge runs on ('playgama', 'playgama_sandbox', 'mock', ...); null without it. */
  platformId(): string | null {
    const id = this.sdk?.platform?.id;
    return typeof id === 'string' && id !== '' ? id : null;
  }

  version(): string | null {
    const v = this.sdk?.version;
    return typeof v === 'string' ? v : null;
  }

  /** The player's language as the platform reports it (ISO 639-1), null without it. */
  language(): string | null {
    const v = this.sdk?.platform?.language;
    return typeof v === 'string' && v !== '' ? v : null;
  }

  /** game_ready, gameplay_started, gameplay_stopped, level_started, ... */
  send(message: string): void {
    void settle(() => this.sdk?.platform?.sendMessage?.(message));
  }

  /** The platform's pause: true when it asks the game to stop (an overlay, the tab hidden). */
  onPause(cb: (paused: boolean) => void): void {
    void settle(() => this.sdk?.platform?.on?.('pause_state_changed', (p) => guard(() => cb(p === true))));
  }

  /** The platform's sound switch: called now with whether to mute, then on every change. */
  onMute(cb: (muted: boolean) => void): void {
    if (!this.sdk) return;
    guard(() => cb(this.sdk?.platform?.isAudioEnabled === false));
    void settle(() => this.sdk?.platform?.on?.('audio_state_changed', (on) => guard(() => cb(on === false))));
  }

  /** Reads `keys` in one call; values come back as strings (objects are stringified again). */
  async load(keys: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const got = await settle(() => this.sdk?.storage?.get?.(keys, false));
    if (!Array.isArray(got)) return out;
    keys.forEach((key, i) => {
      const v: unknown = got[i];
      if (typeof v === 'string') out.set(key, v);
      else if (v !== null && v !== undefined) out.set(key, JSON.stringify(v));
    });
    return out;
  }

  save(entries: Map<string, string>): void {
    void settle(() => this.sdk?.storage?.set?.([...entries.keys()], [...entries.values()]));
  }

  /** One interstitial; `started` runs when it is on screen. Resolves true once it was shown and
   *  is over, false when it failed, was refused (a cooldown fails at once) or was given up. */
  interstitial(started?: () => void): Promise<boolean> {
    return this.ad('interstitial', started);
  }

  /** Whether this platform plays rewarded ads (the game shows its offer only then). */
  rewardedSupported(): boolean {
    return this.sdk?.advertisement?.isRewardedSupported === true;
  }

  /** One rewarded ad, asked for by the player; `started` runs when it is on screen. Resolves true
   *  only when the platform said `rewarded` (watched through), never on a bare close. */
  rewarded(started?: () => void): Promise<boolean> {
    return this.ad('rewarded', started);
  }

  /** Whether the game shows its own leaderboard: Bridge says `in_game` (on Playgama that is its
   *  SaaS leaderboard, enabled in the config); anything else hides it. */
  leaderboardShown(): boolean {
    return this.sdk?.leaderboards?.type === 'in_game';
  }

  setScore(id: string, score: number): void {
    if (!this.leaderboardShown()) return;
    void settle(() => this.sdk?.leaderboards?.setScore?.(id, score));
  }

  /** The leaderboard's rows, best first; empty when it cannot be read. */
  async entries(id: string): Promise<ScoreRow[]> {
    if (!this.leaderboardShown()) return [];
    const got = await settle(() => this.sdk?.leaderboards?.getEntries?.(id));
    if (!Array.isArray(got)) return [];
    const rows: ScoreRow[] = [];
    for (const e of got as Record<string, unknown>[]) {
      const score = Number(e?.score);
      if (!Number.isFinite(score)) continue;
      const rank = Number(e?.rank);
      rows.push({ rank: Number.isFinite(rank) && rank > 0 ? rank : rows.length + 1, name: typeof e?.name === 'string' ? e.name : '', score });
    }
    return rows.sort((a, b) => a.rank - b.rank);
  }

  private ad(kind: AdKind, started?: () => void): Promise<boolean> {
    const ad = this.sdk?.advertisement;
    const supported = kind === 'interstitial' ? ad?.isInterstitialSupported : ad?.isRewardedSupported;
    if (!ad || supported !== true || typeof ad.on !== 'function') return Promise.resolve(false);
    this.inFlight?.giveUp();
    if (this.timers.now() < this.strayUntil) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let over = false;
      let shown = false;
      let earned = false;
      let timer: unknown;
      const finish = () => {
        if (over) return;
        over = true;
        this.timers.clear(timer);
        if (this.inFlight?.listen === listen) this.inFlight = null;
        resolve(kind === 'rewarded' ? earned : shown);
      };
      const giveUp = () => {
        this.strayUntil = this.timers.now() + AD_PLAY_MS;
        finish();
      };
      const listen = (state: unknown) => {
        if (state === 'opened') {
          shown = true;
          this.timers.clear(timer);
          timer = this.timers.set(giveUp, AD_PLAY_MS);
          guard(() => started?.());
        } else if (state === 'rewarded') earned = true;
        else if (state === 'closed' || state === 'failed') finish();
      };
      timer = this.timers.set(giveUp, AD_START_MS);
      this.inFlight = { kind, listen, giveUp };
      if (!this.subscribed.has(kind)) {
        this.subscribed.add(kind);
        void settle(() =>
          ad.on?.(`${kind}_state_changed`, (s) => {
            // late states of a given-up ad go nowhere; its end lets the next one open
            if (this.timers.now() < this.strayUntil) {
              if (s === 'closed' || s === 'failed') this.strayUntil = 0;
              return;
            }
            if (this.inFlight?.kind === kind) this.inFlight.listen(s);
          }),
        );
      }
      try {
        if (kind === 'interstitial') ad.showInterstitial?.(PLACEMENT.interstitial);
        else ad.showRewarded?.(PLACEMENT.rewarded);
      } catch {
        listen('failed');
      }
    });
  }
}
