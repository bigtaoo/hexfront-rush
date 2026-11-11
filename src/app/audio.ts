// Audio (ported from Holy Kicker's audio/): a closed cue table with per-cue gain, gap and priority;
// a per-frame gate that merges repeats of one cue into one louder voice; a voice cap where higher
// priority steals from lower; a compressor on the effects bus; and two-deck music that changes
// track and loops by equal-power crossfades (MP3 streams are padded, so a native loop clicks).
// The game tells it what to silence (the player's effects and music switches, the host's, a pause)
// through MuteState; while paused the context is suspended and the decks stop.
//
// The samples are fetched at boot, before any gesture (preload). The context cannot be opened
// until the player touches the page, but the bytes can already be here, so the tap that opens it
// is not the one that goes missing.
//
// The mix: the results' stings sit with the game's own cues rather than over them (they were
// ~11 dB above), the legendary sting about level with a build, melee as loud as a shot (it was
// ~7 dB under the arrows).

interface CueDef {
  pri: number;
  gain: number;
  gap: number;
  /** The sample, when it is not the cue's own name. */
  file?: string;
  /** A small random pitch, so repeats do not sound mechanical. */
  vary?: boolean;
}

export const CUES = {
  // ui
  tap: { pri: 3, gain: 0.55, gap: 0.05 },
  error: { pri: 4, gain: 0.5, gap: 0.4 },
  beep: { pri: 5, gain: 0.7, gap: 0.15 },
  go: { pri: 5, gain: 0.6, gap: 0.5 },
  // economy
  coin: { pri: 2, gain: 0.45, gap: 0.12, vary: true },
  income: { pri: 1, gain: 0.18, gap: 0.5, file: 'coin', vary: true },
  build: { pri: 3, gain: 0.7, gap: 0.08, vary: true },
  quest: { pri: 4, gain: 0.6, gap: 0.3 },
  nothing: { pri: 4, gain: 0.5, gap: 0.3 },
  legend: { pri: 6, gain: 0.35, gap: 1 },
  // battle
  spawn: { pri: 1, gain: 0.3, gap: 0.2, vary: true },
  shoot: { pri: 0, gain: 0.3, gap: 0.09, vary: true },
  hit: { pri: 0, gain: 0.3, gap: 0.07, vary: true },
  melee: { pri: 0, gain: 0.5, gap: 0.1, vary: true },
  pop: { pri: 1, gain: 0.4, gap: 0.08, vary: true },
  destroy: { pri: 5, gain: 0.6, gap: 0.2, vary: true },
  // results
  win: { pri: 7, gain: 0.22, gap: 1 },
  lose: { pri: 7, gain: 0.22, gap: 1 },
} satisfies Record<string, CueDef>;
export type Cue = keyof typeof CUES;
const cueDef = (c: Cue): CueDef => CUES[c];

export const MUSIC = { battle: 'music/battle.mp3', lobby: 'music/lobby.mp3', boss: 'music/boss.mp3' } as const;
export type Track = keyof typeof MUSIC;
const MAX_VOICES = 14;
const XFADE = 2;
const MUSIC_LEVEL = 0.32;
const SFX_LEVEL = 0.9;
/** How long everything takes to duck away when the game is paused, and to come back. The context
 *  is only suspended once that has run: suspending stops the clock, so a ramp started in the same
 *  breath never gets to run and the pause cuts rather than ducks. */
const PAUSE_FADE = 0.12;

/** The files behind the cues, each once. */
const cueFiles = (): string[] => [...new Set((Object.keys(CUES) as Cue[]).map((k) => cueDef(k).file ?? k))];

/** Move a gain to `to` over about PAUSE_FADE, from wherever it stands right now. */
function ramp(p: AudioParam, now: number, to: number): void {
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  p.setTargetAtTime(to, now, PAUSE_FADE / 3);
}

/** How loud a cue asked for `n` times in one frame plays: one voice, louder, capped. */
export const mergedGain = (n: number): number => Math.min(1 + 0.15 * Math.log2(n), 1.5);

export interface MuteState {
  /** The effects are off (the player's switch or the host's). */
  sfxOff(): boolean;
  /** The music is off (the player's switch or the host's). */
  musicOff(): boolean;
  /** The effects' and the music's volume, 0..1 (the settings' sliders). */
  sfxVol(): number;
  musicVol(): number;
  /** The game is paused (hidden tab, an ad, the host's pause): everything stops. */
  paused(): boolean;
}

interface Deck {
  el: HTMLAudioElement;
  g: GainNode;
  level: number;
  /** The track key this deck holds, so a crossfade into the same track only rewinds. */
  holds: Track | null;
  /** It is meant to be sounding. A pause stops the element whatever its level, and this is what
   *  tells the unpause to start it again: the level is 0 at the top of a fade-in, so it cannot. */
  playing: boolean;
}
interface Voice {
  src: AudioBufferSourceNode;
  pri: number;
  end: number;
}
interface Fade {
  inD: number;
  outD: number;
  t: number;
  /** Where each deck stood when the fade began, so a change that interrupts another neither
   *  jumps the outgoing deck back up to full nor drops the incoming one to silence. */
  in0: number;
  out0: number;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private last = new Map<Cue, number>();
  private queue = new Map<Cue, { n: number; vol: number }>();
  private voices: Voice[] = [];
  private decks: Deck[] = [];
  private live = -1;
  private track: Track | null = null;
  private fade: Fade | null = null;
  private want: Track | null = null;
  /** Cue samples fetched before there was a context to decode them with. */
  private raw = new Map<string, Promise<ArrayBuffer>>();
  private freezeT: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly st: MuteState,
    /** Where public/ is served from (Vite's BASE_URL: '/' in dev, './' on the portal). */
    private readonly base: string = import.meta.env.BASE_URL,
  ) {}

  private init(): void {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let c: AudioContext;
    try {
      c = new AC();
    } catch {
      return;
    }
    this.ctx = c;
    this.master = c.createGain();
    this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    comp.connect(this.master);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = SFX_LEVEL;
    this.sfxBus.connect(comp);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = MUSIC_LEVEL;
    this.musicBus.connect(this.master);
    this.applyMute();
    for (const f of cueFiles()) {
      // decodeAudioData detaches the bytes, so each promise is spent once; init runs once
      (this.raw.get(f) ?? this.fetchCue(f))
        .then((ab) => c.decodeAudioData(ab))
        .then((b) => void this.buffers.set(f, b))
        .catch(() => {});
    }
    this.raw.clear();
    // music streams through two <audio> decks: a decoded minute of stereo is ~25 MB
    this.decks = [0, 1].map(() => {
      const el = new Audio();
      el.preload = 'auto';
      const g = c.createGain();
      g.gain.value = 0;
      try {
        c.createMediaElementSource(el).connect(g);
      } catch {
        /* the element plays on its own, unmixed */
      }
      g.connect(this.musicBus);
      return { el, g, level: 0, holds: null, playing: false };
    });
  }

  private fetchCue(f: string): Promise<ArrayBuffer> {
    return fetch(`${this.base}sfx/${f}.mp3`).then((r) => r.arrayBuffer());
  }

  /** Call at boot. The samples (~94 KB for all seventeen) come down while the page is still
   *  loading, so the first tap has something to play: fetching them only once a gesture had
   *  opened the context left the opening cues of a session silent. */
  preload(): void {
    if (this.ctx || this.raw.size) return;
    for (const f of cueFiles()) this.raw.set(f, this.fetchCue(f));
  }

  /** The browser keeps audio locked until a gesture: every kind of gesture tries to open it. */
  installUnlock(): void {
    const go = () => this.unlock();
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(ev, go, true);
  }

  unlock(): void {
    this.init();
    // applyMute is the one place that knows how to come back: it resumes the context and starts
    // every deck that is meant to be sounding
    this.applyMute();
  }


  /** Call after any change of the mute, volume or pause state. */
  applyMute(): void {
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    ramp(this.sfxBus.gain, now, this.st.sfxOff() ? 0 : SFX_LEVEL * this.st.sfxVol());
    ramp(this.musicBus.gain, now, this.st.musicOff() ? 0 : MUSIC_LEVEL * this.st.musicVol());
    clearTimeout(this.freezeT);
    if (this.st.paused()) {
      ramp(this.master.gain, now, 0);
      this.freezeT = setTimeout(() => this.freeze(), PAUSE_FADE * 1000);
      return;
    }
    for (const d of this.decks) if (d.playing && d.el.paused) d.el.play().catch(() => {});
    if (c.state === 'suspended') {
      // it comes back from silence, not from wherever the pause left the gain frozen
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(0, now);
      this.master.gain.setTargetAtTime(1, now, PAUSE_FADE / 3);
      c.resume().catch(() => {});
      return;
    }
    ramp(this.master.gain, now, 1);
  }

  /** The end of the pause fade: only now can the decks and the clock stop without a click. */
  private freeze(): void {
    const c = this.ctx;
    if (!c || !this.st.paused()) return;
    for (const d of this.decks) d.el.pause();
    if (c.state === 'running') c.suspend().catch(() => {});
  }

  /** Asks for a cue this frame; repeats in one frame merge (see flush). */
  play(name: Cue, vol = 1): void {
    const q = this.queue.get(name);
    if (q) {
      q.n++;
      q.vol = Math.max(q.vol, vol);
    } else this.queue.set(name, { n: 1, vol });
  }

  /** Once a frame: the gate. Each cue sounds at most once, louder (capped) when asked for many times. */
  private flush(): void {
    if (this.queue.size === 0) return;
    const q = this.queue;
    this.queue = new Map();
    const c = this.ctx;
    if (!c || this.st.paused() || this.st.sfxOff()) return;
    const now = c.currentTime;
    for (const [name, { n, vol }] of q) {
      const cue = cueDef(name);
      const last = this.last.get(name);
      if (last !== undefined && now - last < cue.gap) continue;
      const b = this.buffers.get(cue.file ?? name);
      if (!b || !this.voice(cue.pri)) continue;
      this.last.set(name, now);
      const src = c.createBufferSource();
      src.buffer = b;
      if (cue.vary) src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const g = c.createGain();
      g.gain.value = cue.gain * vol * mergedGain(n);
      src.connect(g);
      g.connect(this.sfxBus);
      const v: Voice = { src, pri: cue.pri, end: now + b.duration / src.playbackRate.value };
      this.voices.push(v);
      src.onended = () => {
        const i = this.voices.indexOf(v);
        if (i >= 0) this.voices.splice(i, 1);
      };
      src.start();
    }
  }

  /** A free voice for priority `pri`: when all are taken, the lowest (oldest first) is stolen if lower. */
  private voice(pri: number): boolean {
    const now = this.ctx!.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length < MAX_VOICES) return true;
    let low: Voice | null = null;
    for (const v of this.voices) if (!low || v.pri < low.pri) low = v;
    if (!low || low.pri >= pri) return false;
    try {
      low.src.stop();
    } catch {
      /* already ended */
    }
    this.voices.splice(this.voices.indexOf(low), 1);
    return true;
  }

  // ---- music: two decks, equal-power crossfades for track changes and for the loop ----
  music(track: Track | null): void {
    this.want = track;
  }

  /** Once a frame, with real seconds. */
  update(dt: number): void {
    this.flush();
    if (!this.decks.length || this.st.paused()) return;
    if (this.fade) this.advance(dt);
    if (this.want !== this.track) this.change(this.want);
    else if (!this.fade && this.track !== null && this.live >= 0) {
      const el = this.decks[this.live]!.el;
      if (el.ended) {
        // missed the wrap (throttled frames): restart
        el.play().catch(() => {});
        return;
      }
      if (el.duration > XFADE * 2 && el.currentTime >= el.duration - XFADE) {
        const out = this.live;
        this.live = 1 - out;
        this.begin(this.live, out, this.track);
      }
    }
  }

  private change(next: Track | null): void {
    const out = this.live;
    this.track = next;
    if (next === null) {
      this.live = -1;
      this.begin(-1, out, null);
      return;
    }
    this.live = out === 0 ? 1 : 0;
    this.begin(this.live, out, next);
  }

  private begin(inD: number, outD: number, track: Track | null): void {
    if (this.fade) for (const d of [this.fade.inD, this.fade.outD]) if (d >= 0 && d !== outD && d !== inD) this.silence(d);
    this.fade = { inD, outD, t: 0, in0: inD >= 0 ? this.decks[inD]!.level : 0, out0: outD >= 0 ? this.decks[outD]!.level : 0 };
    if (inD >= 0 && track) {
      const deck = this.decks[inD]!;
      try {
        if (deck.holds !== track) {
          deck.el.src = this.base + MUSIC[track];
          deck.holds = track;
        }
        deck.el.currentTime = 0;
      } catch {
        /* not loaded yet */
      }
      deck.playing = true;
      if (!this.st.paused()) deck.el.play().catch(() => {});
    }
    this.applyFade();
  }

  private advance(dt: number): void {
    const f = this.fade!;
    f.t += dt / XFADE;
    if (f.t < 1) return this.applyFade();
    this.fade = null;
    if (f.inD >= 0) this.set(f.inD, 1);
    if (f.outD >= 0 && f.outD !== f.inD) this.silence(f.outD);
  }

  private applyFade(): void {
    const f = this.fade!;
    const a = (Math.min(1, Math.max(0, f.t)) * Math.PI) / 2;
    if (f.inD >= 0) this.set(f.inD, f.in0 + (1 - f.in0) * Math.sin(a));
    if (f.outD >= 0 && f.outD !== f.inD) this.set(f.outD, f.out0 * Math.cos(a));
  }

  private silence(d: number): void {
    this.set(d, 0);
    this.decks[d]!.playing = false;
    this.decks[d]!.el.pause();
  }

  private set(d: number, level: number): void {
    const k = this.decks[d]!;
    k.level = level;
    k.g.gain.value = level;
  }
}
