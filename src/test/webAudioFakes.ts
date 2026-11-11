// The fakes the audio tests run on: Web Audio and <audio> stood in for by small classes that
// only record what the module asked them to do (vitest runs in node, so there is no DOM here).
// A sample is fetched as a buffer of its own length, which is how a decoded one says which file
// it is, and the fetches hang until the test calls deliver(): the point of several tests is what
// happens while the samples are still in the air.

import { Sound, type MuteState } from '../app/audio';

export class Param {
  /** Where the gain stands. */
  value: number;
  /** Where it was last told to head for. */
  aim: number;
  constructor(v = 1) {
    this.value = v;
    this.aim = v;
  }
  cancelScheduledValues(_t: number): void {}
  setValueAtTime(v: number, _t: number): void {
    this.value = v;
    this.aim = v;
  }
  setTargetAtTime(v: number, _t: number, _k: number): void {
    this.aim = v;
  }
}

export class Gain {
  gain = new Param(1);
  connect(): void {}
}

export class Src {
  buffer: { duration: number; file: string } | null = null;
  playbackRate = new Param(1);
  onended: (() => void) | null = null;
  out: Gain | null = null;
  started = false;
  stopped = false;
  connect(g: Gain): void {
    this.out = g;
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
  /** The cue file this voice is playing. */
  get file(): string {
    return this.buffer?.file ?? '?';
  }
}

export class El {
  src = '';
  preload = '';
  currentTime = 0;
  duration = 60;
  ended = false;
  paused = true;
  plays = 0;
  pauses = 0;
  play(): Promise<void> {
    this.paused = false;
    this.plays++;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
    this.pauses++;
  }
}

export class Ctx {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  destination = {};
  sources: Src[] = [];
  createGain(): Gain {
    return new Gain();
  }
  createBufferSource(): Src {
    const s = new Src();
    this.sources.push(s);
    return s;
  }
  createDynamicsCompressor(): Record<string, Param | (() => void)> {
    return { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param(), connect: () => {} };
  }
  createMediaElementSource(_el: El): { connect: () => void } {
    return { connect: () => {} };
  }
  decodeAudioData(ab: ArrayBuffer): Promise<{ duration: number; file: string }> {
    return Promise.resolve({ duration: 0.5, file: FILE_BY_SIZE.get(ab.byteLength) ?? '?' });
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
}

/** Each sample is fetched as a buffer of its own length, so a decoded one says which file it is. */
const FILE_BY_SIZE = new Map<number, string>();

export interface Deck {
  el: El;
  g: Gain;
  level: number;
  holds: string | null;
  playing: boolean;
}
/** The private state the tests look at. */
export interface Inside {
  ctx: Ctx | null;
  master: Gain;
  sfxBus: Gain;
  musicBus: Gain;
  decks: Deck[];
  live: number;
  fade: { t: number } | null;
}
export const inside = (s: Sound): Inside => s as unknown as Inside;

/** Let every promise already made settle, without letting any timer run. */
export const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

export function rig() {
  const st = { sfx: false, music: false, sfxV: 1, musicV: 1, paused: false };
  const mute: MuteState = {
    sfxOff: () => st.sfx,
    musicOff: () => st.music,
    sfxVol: () => st.sfxV,
    musicVol: () => st.musicV,
    paused: () => st.paused,
  };
  const asked: string[] = [];
  /** The sample fetches still in the air; the test says when they land. */
  let waiting: (() => void)[] = [];
  FILE_BY_SIZE.clear();
  const body = (url: string): ArrayBuffer => {
    const file = url.slice(url.lastIndexOf('/') + 1).replace('.mp3', '');
    const size = FILE_BY_SIZE.size + 1;
    FILE_BY_SIZE.set(size, file);
    return new ArrayBuffer(size);
  };
  globalThis.fetch = ((url: string) => {
    asked.push(url);
    return new Promise((res) => {
      waiting.push(() => res({ arrayBuffer: () => Promise.resolve(body(url)) } as unknown as Response));
    });
  }) as unknown as typeof fetch;
  const sound = new Sound(mute, '/');
  return {
    st,
    sound,
    asked,
    /** The samples arrive. */
    async deliver(): Promise<void> {
      const w = waiting;
      waiting = [];
      for (const f of w) f();
      await settle();
    },
    ctx: () => inside(sound).ctx!,
    decks: () => inside(sound).decks,
    master: () => inside(sound).master.gain,
    /** The cue files whose voices were started, in order. */
    started: () => inside(sound).ctx!.sources.filter((s) => s.started).map((s) => s.file),
    stopped: () => inside(sound).ctx!.sources.filter((s) => s.stopped).map((s) => s.file),
    voice: (file: string) => inside(sound).ctx!.sources.find((s) => s.started && s.file === file)!,
  };
}

/** Put the fakes where the module looks for them. Call from beforeEach. */
export function installWebAudio(): void {
  (globalThis as unknown as { window: unknown }).window = { AudioContext: Ctx, addEventListener: () => {} };
  (globalThis as unknown as { Audio: unknown }).Audio = El;
}
