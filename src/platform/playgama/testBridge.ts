import type { BridgeGlobal, BridgeShape } from './bridge';

// A stand-in for Playgama's Bridge script in the tests: it records what the game sends and lets a
// test fire the platform's events and answer ads by hand.

export interface FakeBridge {
  global: BridgeGlobal;
  messages: string[];
  saved: [string[], string[]][];
  /** How many interstitials were asked for. */
  shown: number;
  emit(event: string, value: unknown): void;
}

export function fakeBridge(opts: { id?: string; stored?: Record<string, unknown>; adblock?: boolean; audio?: boolean; interstitial?: boolean; language?: string } = {}): FakeBridge {
  const listeners = new Map<string, ((v: unknown) => void)[]>();
  const on = (event: string, cb: (v: unknown) => void) => void listeners.set(event, [...(listeners.get(event) ?? []), cb]);
  const fake: FakeBridge = {
    global: {},
    messages: [],
    saved: [],
    shown: 0,
    emit: (event, value) => listeners.get(event)?.forEach((cb) => cb(value)),
  };
  const bridge: BridgeShape = {
    initialize: async () => {},
    version: '2.9.0',
    platform: { id: opts.id ?? 'playgama', language: opts.language, isAudioEnabled: opts.audio ?? true, on, sendMessage: (m) => void fake.messages.push(m) },
    storage: {
      get: async (keys) => keys.map((k) => opts.stored?.[k] ?? null),
      set: async (keys, values) => void fake.saved.push([keys, values]),
    },
    advertisement: {
      isInterstitialSupported: opts.interstitial ?? true,
      checkAdBlock: async () => opts.adblock === true,
      showInterstitial: () => void fake.shown++,
      on,
    },
  };
  fake.global.bridge = bridge;
  return fake;
}
