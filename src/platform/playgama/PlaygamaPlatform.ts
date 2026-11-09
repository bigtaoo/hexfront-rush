// Playgama: the browser host plus the Bridge SDK for saves, ads, the platform's pause and sound
// switches and the lifecycle messages (after Potion Siege's PlaygamaPlatform.ts). Built with
// `create()`, which waits (bounded) for Bridge and reads the save through it first. Without Bridge
// (local preview, adblocker) everything falls back to WebPlatform.

import type { LevelMessage, Platform } from '../types';
import { SafeStore } from '../types';
import { WebPlatform } from '../web';
import { PlaygamaBridge } from './bridge';
import { BridgeStore } from './bridgeStore';

/** Bridge's stand-ins for a page that is no portal: a developer's own preview and the QA tool. */
const TEST_PLATFORMS = new Set(['mock', 'qa_tool']);

export class PlaygamaPlatform extends WebPlatform implements Platform {
  /** 'web' on a test platform, so a preview never counts as a Playgama player. */
  override readonly name: string;
  /** game_ready has gone out; until then a gameplayStart only waits for it. */
  private ready = false;
  private startWaiting = false;
  private playingNow = false;
  private hostPaused = false;
  private soundOff = false;
  private muteListener: ((muted: boolean) => void) | null = null;
  private pauseListener: ((paused: boolean) => void) | null = null;

  private constructor(
    private readonly bridge: PlaygamaBridge,
    private readonly saves: BridgeStore | null,
    doc: Document,
    win: Window,
  ) {
    super();
    const id = bridge.platformId();
    this.name = id && !TEST_PLATFORMS.has(id) ? 'playgama' : 'web';
    if (saves) this.storage = new SafeStore(saves);
    // the platform's pause (an overlay, the tab hidden) silences and pauses the game, and the save
    // goes to Bridge at once: a page on its way out may get no next tick
    bridge.onPause((paused) => {
      this.hostPaused = paused;
      this.mute();
      if (paused) saves?.flush();
      try {
        this.pauseListener?.(paused);
      } catch {
        /* the game's problem, never Bridge's */
      }
    });
    bridge.onMute((off) => {
      this.soundOff = off;
      this.mute();
    });
    const flush = () => saves?.flush();
    doc.addEventListener('visibilitychange', () => doc.visibilityState === 'hidden' && flush());
    win.addEventListener('pagehide', flush);
  }

  static async create(keys: string[], bridge = new PlaygamaBridge(), doc: Document = document, win: Window = window): Promise<PlaygamaPlatform> {
    const ok = await bridge.init();
    const saves = ok ? await BridgeStore.create(bridge, keys) : null;
    console.info(`[hexfront] Playgama Bridge: ${ok ? `${bridge.platformId()}/${bridge.version() ?? '?'}` : 'unavailable'}, save: ${saves ? 'bridge' : 'localStorage'}`);
    return new PlaygamaPlatform(bridge, saves, doc, win);
  }

  /** The platform's language first, then the browser's. */
  override languages(): string[] {
    const lang = this.bridge.language();
    return lang ? [lang, ...super.languages()] : super.languages();
  }

  override loaded(): void {
    if (this.ready) return;
    this.ready = true;
    this.bridge.send('game_ready');
    if (this.startWaiting) {
      this.startWaiting = false;
      this.gameplayStart();
    }
  }

  override level(msg: LevelMessage): void {
    this.bridge.send(msg);
  }

  // only real changes reach the platform, and a start never goes out before game_ready
  override gameplayStart(): void {
    if (!this.ready) return void (this.startWaiting = true);
    if (this.playingNow) return;
    this.playingNow = true;
    this.bridge.send('gameplay_started');
  }

  override gameplayStop(): void {
    this.startWaiting = false;
    if (!this.playingNow) return;
    this.playingNow = false;
    this.bridge.send('gameplay_stopped');
  }

  /** Paced on our side too (AdPacing): the clock starts over only once an ad was on screen. */
  override async midgame(onStart: () => void): Promise<void> {
    if (!this.pacing.due()) return;
    await this.bridge.interstitial(() => {
      this.pacing.shown();
      onStart();
    });
  }

  /** An adblocker stops the ads the platform would play. */
  adBlocked(): boolean {
    return this.bridge.isReady() && this.bridge.hasAdblock();
  }

  /** The platform's sound switch and its pause both silence the game. */
  override onHostMute(listener: (muted: boolean) => void): void {
    this.muteListener = listener;
    this.mute();
  }

  override onHostPause(listener: (paused: boolean) => void): void {
    this.pauseListener = listener;
  }

  override flush(): void {
    this.saves?.flush();
  }

  private mute(): void {
    try {
      this.muteListener?.(this.soundOff || this.hostPaused);
    } catch {
      /* the game's problem, never Bridge's */
    }
  }
}
