// Adaptive render quality (ported from standing's client/src/game/quality.ts). A device starts
// on a level picked from what the browser reports (desktop or phone, cores, memory, GPU name),
// then a governor moves it with the measured frame rate: down quickly when frames run slow for
// a few seconds, up slowly after a long stable stretch. The browser does not expose the
// phone's temperature, but a hot phone throttles its CPU and GPU and its frames slow down, so
// frame rate stands in for heat. Auto never climbs above the start level.
//
// Levels only change looks, never the battle: it runs at its own fixed rate (StepLoop, app/stepLoop.ts).
// Screens with no battle on them (home, results) draw at the display's full density instead
// (frameResolution); a battle at its level's. A screen under 2x (a desktop monitor) is drawn at 2
// and shrunk by the browser (canvasDensity): drawn at 1, the board's sprites and small numbers
// came from their textures' smaller mip levels and looked soft. A 30 Hz display (an iPhone in Low
// Power Mode) is held on its level, not stepped down for frames it could never show (refreshCap).

export type QualityMode = 'auto' | 'high' | 'saver';
export const QUALITY_MODES: readonly QualityMode[] = ['auto', 'high', 'saver'];

export interface LevelSettings {
  name: string;
  /** Render resolution cap; the device pixel ratio caps it too. */
  resolution: number;
  fps: number;
}

// Each step down gives up resolution first and the frame rate last.
export const LEVELS: readonly LevelSettings[] = [
  { name: 'saver', resolution: 1.5, fps: 30 },
  { name: 'low', resolution: 2, fps: 60 },
  // the battle's top: a 3x phone's full density. The board's art is drawn for about 3 device
  // pixels a texture pixel's worth (art.ts PPU), and at 2 a 3x screen showed it upscaled and soft.
  // No MSAA (boot.ts: antialias only under 2x), which is what kept standing's 3x bundle from booting
  // on an iPhone 15; the iOS app stays at 2 (IOS_RESOLUTION), and the governor steps a slow phone down.
  { name: 'high', resolution: 3, fps: 60 },
];
const HIGH = LEVELS.length - 1;

/** The most pixels per logical pixel the canvas gets: a 3x phone's full density (web hosts). */
export const MAX_RESOLUTION = 3;
/** The iOS app's canvas cap: 2x, as standing's after its 3x bundle never booted on an iPhone 15. */
export const IOS_RESOLUTION = 2;

/** The least pixels per logical pixel the canvas gets: a 1x screen is supersampled to 2. */
export const MIN_DENSITY = 2;

/** The canvas's full density on a screen of device pixel ratio `dpr`: its own, at least
 *  MIN_DENSITY, at most the host's cap. */
export function canvasDensity(dpr: number, cap: number): number {
  return Math.min(cap, Math.max(dpr || 1, MIN_DENSITY));
}

/** The most pixels per logical pixel the canvas gets on host `host`. */
export function densityCap(host: string): number {
  return host === 'ios' ? IOS_RESOLUTION : MAX_RESOLUTION;
}

/** The render resolution for a frame. Calm screens with no battle (home, results) barely move,
 *  so they get the canvas's full density (`device`, the most the host allows); a battle, its
 *  skill picks and its tutorial draw at the level's resolution. */
export function frameResolution(sharp: boolean, level: LevelSettings, device: number): number {
  return sharp ? device : Math.min(device, level.resolution);
}

/** Frame rate cap off the battlefield (home, title, results, skill picks): those screens
 *  barely move, and a phone that never gets hot never steps its level down for the battery. */
export const CALM_FPS = 30;

export function targetFps(s: LevelSettings, calm: boolean): number {
  return calm ? Math.min(CALM_FPS, s.fps) : s.fps;
}

export interface DeviceInfo {
  mobile: boolean;
  /** Logical CPU cores and memory in GB, 0 when the browser does not say. */
  cores: number;
  memoryGB: number;
  /** WebGL renderer string, '' when hidden. */
  gpu: string;
}

export interface LevelRange {
  start: number;
  min: number;
  max: number;
}

/** GPU names that mean a software renderer, and known weak phone GPUs. Not the Mali-G57: a
 *  Galaxy A16 (G57 MC2) held 60 fps at 2x through a whole battle (2026-11-02). */
export const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render/i;
export const WEAK_GPU = /mali-[t4]|mali-g(31|51|52)\b|adreno\D*[2-5]\d\d\b|powervr|sgx/i;

/** WebKit (Safari, the iOS app's web view) reports this for every Apple GPU. It also hides the
 *  memory and gives no more than a few cores, so on an iPhone those say nothing. */
export const APPLE_GPU = /apple/i;

/** Level a device starts on in auto mode: the top one unless it looks weak. */
export function startLevel(d: DeviceInfo): number {
  if (!d.mobile) return SOFTWARE_GPU.test(d.gpu) ? HIGH - 1 : HIGH;
  const apple = APPLE_GPU.test(d.gpu);
  const hints = [d.memoryGB > 0 && d.memoryGB <= 3, !apple && d.cores > 0 && d.cores <= 4, WEAK_GPU.test(d.gpu) || SOFTWARE_GPU.test(d.gpu)].filter(Boolean).length;
  return Math.max(0, HIGH - hints);
}

export function levelRange(mode: QualityMode, d: DeviceInfo): LevelRange {
  if (mode === 'high') return { start: HIGH, min: HIGH, max: HIGH };
  if (mode === 'saver') return { start: 0, min: 0, max: 0 };
  const start = startLevel(d);
  return { start, min: 0, max: start };
}

// The gate as standing has it (its 5d8db2f): locked to the display, read through iOS callback jitter.
/** A frame passes the gate once this many refreshes short of the cap's interval have gone by. */
const GATE_SLACK = 0.6;
/** Animation-frame gaps the refresh estimate is the median of (odd, so the median is one of them). */
const VSYNC_WINDOW = 31;
/** The estimate is worked out again every this many gaps. */
const VSYNC_EVERY = 4;

/**
 * Frame limiter for a requestAnimationFrame loop, locked to the display: it runs every n-th
 * refresh, n the most whole refreshes that fit in the cap's interval (one on a 60 or 90 Hz
 * screen at 60 fps, two on 120 or 144 Hz), so every frame lasts the same. A fixed schedule
 * would alternate one and two refreshes on 90 or 144 Hz, drift off a 60.1 Hz screen into a
 * skipped refresh every few seconds, and squeeze a short frame in after a late one.
 *
 * The refresh is read from the animation frames themselves: the last VSYNC_WINDOW gaps' time
 * over the refreshes they span, each gap a whole number of their median. iOS stamps a frame
 * when its callback runs, so a late callback is followed by an early one (24 ms then 9 on a
 * 60 Hz screen); the shortest gap would read that as a 110 Hz screen, call every ordinary frame
 * a missed refresh and tighten the gate. This estimate stays on the refresh through that
 * jitter and the odd missed refresh, and follows a screen that really slows down (a phone's
 * battery saver) within about a second. A frame passes
 * once the time since the last one passed is within GATE_SLACK refreshes of the cap's
 * interval, which leaves over half a refresh of room for timestamp jitter either way; after a
 * late frame the count starts again from it.
 */
export class FrameGate {
  /** The display's refresh interval estimate, ms. */
  vsync = 1000 / 60;
  private lastCall = -Infinity;
  private lastPass = -Infinity;
  private readonly recent = new Float64Array(VSYNC_WINDOW);
  private readonly sorted = new Float64Array(VSYNC_WINDOW);
  private seen = 0;

  constructor(public fps: number) {}

  pass(nowMs: number): boolean {
    const gap = nowMs - this.lastCall;
    this.lastCall = nowMs;
    // a gap over 100 ms is a pause or a stall, not a refresh rate
    if (gap > 1 && gap < 100) this.note(gap);
    if (nowMs - this.lastPass < 1000 / this.fps - this.vsync * GATE_SLACK) return false;
    this.lastPass = nowMs;
    return true;
  }

  /** What one frame should last at this cap and refresh: a whole number of refreshes. */
  get frameMs(): number {
    return Math.max(1, Math.ceil(1000 / this.fps / this.vsync - GATE_SLACK)) * this.vsync;
  }

  private note(gap: number): void {
    this.recent[this.seen % VSYNC_WINDOW] = gap;
    this.seen++;
    if (this.seen >= VSYNC_WINDOW && this.seen % VSYNC_EVERY) return;
    // filling up, the gaps so far, so a 120 Hz screen is locked to from its first frames
    const n = Math.min(this.seen, VSYNC_WINDOW);
    const sorted = n === VSYNC_WINDOW ? this.sorted : this.sorted.subarray(0, n);
    sorted.set(n === VSYNC_WINDOW ? this.recent : this.recent.subarray(0, n));
    const median = sorted.sort()[n >> 1];
    // the window's time over the refreshes it spans: a late and an early gap make two
    let ms = 0, refreshes = 0;
    for (let i = 0; i < n; i++) {
      ms += sorted[i];
      refreshes += Math.max(1, Math.round(sorted[i] / median));
    }
    this.vsync = ms / refreshes;
  }
}

export interface GovernorOptions {
  /** Seconds per measuring window. */
  window: number;
  /** Slow windows in a row before stepping down. */
  slowWindows: number;
  /** Stable seconds before trying a level up; doubles when a try fails, up to maxUpAfter. */
  upAfter: number;
  maxUpAfter: number;
  /** A drop this soon (s) after stepping up counts as a failed try. */
  probe: number;
}

/** A display refreshing at about this rate (an iPhone in Low Power Mode, which caps animation
 *  frames at 30) cannot show more frames, whatever the level: the governor holds such a
 *  display to it rather than stepping down for frames it could never have had. */
const LOW_REFRESH = 30;

/** The most frames a second the display can show, for the governor; Infinity unless the refresh
 *  reads as LOW_REFRESH. A device too slow for its level reads as a refresh between rates
 *  (frames of one and two refreshes) and is not held; one that ran every other refresh
 *  throughout already draws the even 30 that stepping down would get it. */
export function refreshCap(vsync: number): number {
  return Math.abs(1000 / vsync - LOW_REFRESH) <= 3 ? LOW_REFRESH : Infinity;
}

export const GOVERNOR: GovernorOptions = { window: 2, slowWindows: 2, upAfter: 30, maxUpAfter: 240, probe: 10 };
/** Under this share of the level's frame rate a window is slow; over the second, stable. */
const SLOW = 0.8;
const STABLE = 0.9;

export class FrameGovernor {
  level: number;
  private frames = 0;
  private time = 0;
  private slow = 0;
  private stable = 0;
  private upAfter: number;
  private sinceUp = Infinity;

  constructor(
    private readonly range: LevelRange,
    private readonly opts: GovernorOptions = GOVERNOR,
  ) {
    this.level = range.start;
    this.upAfter = opts.upAfter;
  }

  /** Feeds one frame's length in seconds and the display's frame cap (refreshCap); true when the level changed. */
  sample(dt: number, cap = Infinity): boolean {
    // pauses (hidden tab, app in background) and single hitches say nothing about load
    if (!(dt > 0 && dt < 0.25)) return false;
    this.frames++;
    this.time += dt;
    this.sinceUp += dt;
    if (this.time < this.opts.window) return false;
    const fps = this.frames / this.time;
    const span = this.time;
    this.frames = this.time = 0;
    const target = Math.min(LEVELS[this.level].fps, cap);
    if (fps < target * SLOW) {
      this.stable = 0;
      if (++this.slow < this.opts.slowWindows || this.level <= this.range.min) return false;
      if (this.sinceUp < this.opts.probe) this.upAfter = Math.min(this.upAfter * 2, this.opts.maxUpAfter);
      this.slow = 0;
      this.level--;
      return true;
    }
    this.slow = 0;
    this.stable = fps >= target * STABLE ? this.stable + span : 0;
    if (this.stable < this.upAfter || this.level >= this.range.max) return false;
    this.stable = 0;
    this.sinceUp = 0;
    this.level++;
    return true;
  }
}
