'use strict';
// Audio (ported from Holy Kicker's audio/): a closed cue table with per-cue gain, gap and priority;
// a per-frame gate that merges repeats of one cue into one louder voice; a voice cap where higher
// priority steals from lower; a compressor on the effects bus; and two-deck music that changes
// track and loops by equal-power crossfades (MP3 streams are padded, so a native loop clicks).
// Needs App (main.js) only for the mute state.

const CUES = {
  // ui
  tap:     { pri: 3, gain: 0.55, gap: 0.05 },
  error:   { pri: 4, gain: 0.5,  gap: 0.4 },
  beep:    { pri: 5, gain: 0.7,  gap: 0.15 },
  go:      { pri: 5, gain: 0.6,  gap: 0.5 },
  // economy
  coin:    { pri: 2, gain: 0.45, gap: 0.12, vary: true },
  income:  { pri: 1, gain: 0.18, gap: 0.5, file: 'coin', vary: true },
  build:   { pri: 3, gain: 0.7,  gap: 0.08, vary: true },
  quest:   { pri: 4, gain: 0.6,  gap: 0.3 },
  nothing: { pri: 4, gain: 0.5,  gap: 0.3 },
  legend:  { pri: 6, gain: 0.7,  gap: 1 },
  // battle
  spawn:   { pri: 1, gain: 0.3,  gap: 0.2, vary: true },
  shoot:   { pri: 0, gain: 0.3,  gap: 0.09, vary: true },
  hit:     { pri: 0, gain: 0.3,  gap: 0.07, vary: true },
  melee:   { pri: 0, gain: 0.22, gap: 0.1, file: 'hit', vary: true },
  pop:     { pri: 1, gain: 0.4,  gap: 0.08, vary: true },
  destroy: { pri: 5, gain: 0.6,  gap: 0.2, vary: true },
  // results
  win:     { pri: 7, gain: 0.8,  gap: 1 },
  lose:    { pri: 7, gain: 0.8,  gap: 1 },
};
const MUSIC = { battle: 'music/battle.mp3', lobby: 'music/lobby.mp3' };
const MAX_VOICES = 14;
const XFADE = 2;
const MUSIC_LEVEL = 0.32;

const Sound = {
  ctx: null, master: null, sfxBus: null, musicBus: null,
  buffers: {}, last: {}, queue: new Map(), voices: [],
  decks: null, live: -1, track: null, fade: null, want: null,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 12;
    comp.attack.value = 0.003; comp.release.value = 0.15;
    comp.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(comp);
    this.musicBus = c.createGain(); this.musicBus.gain.value = MUSIC_LEVEL; this.musicBus.connect(this.master);
    this.applyMute();
    const files = new Set(Object.keys(CUES).map(k => CUES[k].file || k));
    for (const f of files) {
      fetch('sfx/' + f + '.mp3').then(r => r.arrayBuffer()).then(ab => new Promise(res => {
        c.decodeAudioData(ab, b => { this.buffers[f] = b; res(); }, () => res());
      })).catch(() => {});
    }
    // music streams through two <audio> decks: a decoded minute of stereo is ~25 MB
    this.decks = [0, 1].map(() => {
      const el = new Audio();
      el.preload = 'auto';
      const g = c.createGain(); g.gain.value = 0;
      try { c.createMediaElementSource(el).connect(g); } catch (e) { /* ignore */ }
      g.connect(this.musicBus);
      return { el, g, level: 0 };
    });
  },

  /** The browser keeps audio locked until a gesture: every kind of gesture tries to open it. */
  installUnlock() {
    const go = () => this.unlock();
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(ev, go, true);
  },
  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended' && !App.paused) this.ctx.resume().catch(() => {});
    if (this.track !== null && this.live >= 0) {
      const d = this.decks[this.live];
      if (d.el.paused && !App.paused) d.el.play().catch(() => {});
    }
  },
  shouldMute() { return App.save.muted || !App.platformAudio || App.paused; },
  applyMute() {
    if (!this.ctx) return;
    const m = this.shouldMute();
    this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    for (const d of this.decks || []) {
      if (App.paused) d.el.pause();
      else if (d.level > 0 && d.el.paused && d.el.src) d.el.play().catch(() => {});
    }
    if (App.paused) { if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
    else if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },

  /** Asks for a cue this frame; repeats in one frame merge (see flush). */
  play(name, vol) {
    if (!CUES[name]) return;
    const q = this.queue.get(name);
    if (q) { q.n++; q.vol = Math.max(q.vol, vol === undefined ? 1 : vol); }
    else this.queue.set(name, { n: 1, vol: vol === undefined ? 1 : vol });
  },

  /** Once a frame: the gate. Each cue sounds at most once, louder (capped) when asked for many times. */
  flush() {
    if (this.queue.size === 0) return;
    const q = this.queue;
    this.queue = new Map();
    if (!this.ctx || this.shouldMute()) return;
    const now = this.ctx.currentTime;
    for (const [name, { n, vol }] of q) {
      const cue = CUES[name];
      if (this.last[name] !== undefined && now - this.last[name] < cue.gap) continue;
      const b = this.buffers[cue.file || name];
      if (!b) continue;
      if (!this.voice(cue.pri)) continue;
      this.last[name] = now;
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      if (cue.vary) src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const g = this.ctx.createGain();
      g.gain.value = cue.gain * vol * Math.min(1 + 0.15 * Math.log2(n), 1.5);
      src.connect(g); g.connect(this.sfxBus);
      const v = { src, pri: cue.pri, end: now + b.duration / src.playbackRate.value };
      this.voices.push(v);
      src.onended = () => { const i = this.voices.indexOf(v); if (i >= 0) this.voices.splice(i, 1); };
      src.start();
    }
  },

  /** A free voice for priority `pri`: when all are taken, the lowest (oldest first) is stolen if lower. */
  voice(pri) {
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter(v => v.end > now);
    if (this.voices.length < MAX_VOICES) return true;
    let low = null;
    for (const v of this.voices) if (!low || v.pri < low.pri) low = v;
    if (!low || low.pri >= pri) return false;
    try { low.src.stop(); } catch (e) { /* already ended */ }
    this.voices.splice(this.voices.indexOf(low), 1);
    return true;
  },

  // ---- music: two decks, equal-power crossfades for track changes and for the loop ----
  music(track) { this.want = track; },

  /** Once a frame, with real seconds. */
  update(dt) {
    this.flush();
    if (!this.decks || App.paused) return;
    if (this.fade) this.advance(dt);
    if (this.want !== this.track) this.change(this.want);
    else if (!this.fade && this.track !== null && this.live >= 0) {
      const el = this.decks[this.live].el;
      if (el.ended) { el.play().catch(() => {}); return; } // missed the wrap (throttled frames): restart
      if (el.duration > XFADE * 2 && el.currentTime >= el.duration - XFADE) {
        const out = this.live;
        this.live = 1 - out;
        this.begin(this.live, out, MUSIC[this.track]);
      }
    }
  },
  change(next) {
    const out = this.live;
    this.track = next;
    if (next === null) { this.live = -1; this.begin(-1, out); return; }
    this.live = out === 0 ? 1 : 0;
    this.begin(this.live, out, MUSIC[next]);
  },
  begin(inD, outD, path) {
    if (this.fade) for (const d of [this.fade.inD, this.fade.outD]) if (d >= 0 && d !== outD && d !== inD) this.silence(d);
    this.fade = { inD, outD, t: 0 };
    if (inD >= 0 && path) {
      const el = this.decks[inD].el;
      try { if (!el.src.endsWith(path)) el.src = path; el.currentTime = 0; } catch (e) { /* not loaded yet */ }
      el.play().catch(() => {});
    }
    this.applyFade();
  },
  advance(dt) {
    const f = this.fade;
    f.t += dt / XFADE;
    if (f.t < 1) { this.applyFade(); return; }
    this.fade = null;
    if (f.inD >= 0) this.set(f.inD, 1);
    if (f.outD >= 0 && f.outD !== f.inD) this.silence(f.outD);
  },
  applyFade() {
    const f = this.fade;
    const a = Math.min(1, Math.max(0, f.t)) * Math.PI / 2;
    if (f.inD >= 0) this.set(f.inD, Math.sin(a));
    if (f.outD >= 0 && f.outD !== f.inD) this.set(f.outD, Math.cos(a));
  },
  silence(d) { this.set(d, 0); this.decks[d].el.pause(); },
  set(d, level) { const k = this.decks[d]; k.level = level; k.g.gain.value = level; },
};
