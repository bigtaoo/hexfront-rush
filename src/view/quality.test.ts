// The render-quality policy. None of this touches the battle — that runs at its own fixed rate —
// but all of it decides whether a phone holds a steady picture or cooks itself, and a mistake in
// it reaches the player as "the game is blurry on my phone" or "it feels slow", which is exactly
// the kind of report nothing else in the project can turn back into a line of code. The three
// pieces answer three questions: what level a device starts on (startLevel), how many pixels and
// frames that level is worth (canvasDensity, frameResolution, targetFps), and how the level moves
// while the player plays (FrameGate feeding FrameGovernor).

import { describe, expect, it } from 'vitest';
import {
  CALM_FPS, canvasDensity, densityCap, FrameGate, FrameGovernor, frameResolution, GOVERNOR,
  IOS_RESOLUTION, LEVELS, levelRange, MAX_RESOLUTION, MIN_DENSITY, refreshCap, startLevel,
  targetFps, type DeviceInfo, type GovernorOptions,
} from './quality';

const HIGH = LEVELS.length - 1;
const device = (o: Partial<DeviceInfo> = {}): DeviceInfo => ({ mobile: true, cores: 8, memoryGB: 8, gpu: 'Adreno 740', ...o });

/** Runs a gate over `secs` of a display refreshing at `hz` and reports the frames it let through.
 *  `jitter` is iOS's: a callback that runs late is followed by one that runs early. */
function gateRun(hz: number, fps: number, secs: number, jitter = 0): { fps: number; vsync: number; minGap: number } {
  const g = new FrameGate(fps);
  const step = 1000 / hz;
  let t = 0, passed = 0, lastPass = -Infinity, minGap = Infinity;
  for (let i = 0, n = Math.round(secs * hz); i < n; i++) {
    t += step + (jitter && i % 7 === 0 ? jitter : jitter && i % 7 === 1 ? -jitter : 0);
    if (!g.pass(t)) continue;
    passed++;
    if (lastPass > -Infinity) minGap = Math.min(minGap, t - lastPass);
    lastPass = t;
  }
  return { fps: passed / secs, vsync: g.vsync, minGap };
}

/** Feeds a governor `secs` of frames at `fps` and reports the level after each change. */
const feed = (g: FrameGovernor, fps: number, secs: number, cap = Infinity): number[] => {
  const seen: number[] = [];
  for (let i = 0, n = Math.round(fps * secs); i < n; i++) if (g.sample(1 / fps, cap)) seen.push(g.level);
  return seen;
};

describe('the levels', () => {
  it('give up resolution before frames, and the top one is a 3x phone', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i]!.resolution).toBeGreaterThan(LEVELS[i - 1]!.resolution);
      expect(LEVELS[i]!.fps).toBeGreaterThanOrEqual(LEVELS[i - 1]!.fps);
    }
    expect(LEVELS[HIGH]!.resolution).toBe(MAX_RESOLUTION);
    expect(LEVELS[0]!.name).toBe('saver');
    expect(IOS_RESOLUTION).toBeLessThan(MAX_RESOLUTION);
  });
});

describe('how many pixels a screen gets', () => {
  it('supersamples a 1x monitor and follows a phone up to the host cap', () => {
    // a 1x desktop screen drawn at 1 took the board's sprites and small numbers from their
    // textures' smaller mip levels and looked soft, so it is drawn at 2 and shrunk by the browser
    expect(canvasDensity(1, MAX_RESOLUTION)).toBe(MIN_DENSITY);
    expect(canvasDensity(2, MAX_RESOLUTION)).toBe(2);
    expect(canvasDensity(3, MAX_RESOLUTION)).toBe(3);
    expect(canvasDensity(4, MAX_RESOLUTION)).toBe(MAX_RESOLUTION); // a 4x phone is still drawn at 3
    expect(canvasDensity(3, IOS_RESOLUTION)).toBe(IOS_RESOLUTION);
    // a browser that reports nothing (0, NaN) is read as 1x, not as no pixels at all
    expect(canvasDensity(0, MAX_RESOLUTION)).toBe(MIN_DENSITY);
    expect(canvasDensity(NaN, MAX_RESOLUTION)).toBe(MIN_DENSITY);
  });

  it('caps the iOS app lower than the web, because its 3x bundle never booted', () => {
    expect(densityCap('ios')).toBe(IOS_RESOLUTION);
    for (const host of ['web', 'playgama', '']) expect(densityCap(host)).toBe(MAX_RESOLUTION);
  });

  it('draws a calm screen at the device density and a battle at its level', () => {
    for (const level of LEVELS) {
      expect(frameResolution(true, level, 3)).toBe(3); // home, results: nothing moves, draw it sharp
      expect(frameResolution(false, level, 3)).toBe(Math.min(3, level.resolution));
      // the device is the ceiling either way: a 2x phone is never asked for 3
      expect(frameResolution(true, level, 2)).toBe(2);
      expect(frameResolution(false, level, 2)).toBeLessThanOrEqual(2);
    }
  });

  it('holds a calm screen to a low frame rate, and never raises one', () => {
    for (const level of LEVELS) {
      expect(targetFps(level, false)).toBe(level.fps);
      expect(targetFps(level, true)).toBe(Math.min(CALM_FPS, level.fps));
      expect(targetFps(level, true)).toBeLessThanOrEqual(level.fps);
    }
  });
});

describe('the level a device starts on', () => {
  it('trusts a desktop, and steps one down only for a software renderer', () => {
    expect(startLevel(device({ mobile: false, gpu: 'NVIDIA GeForce RTX 4070' }))).toBe(HIGH);
    expect(startLevel(device({ mobile: false, gpu: '', cores: 0, memoryGB: 0 }))).toBe(HIGH);
    expect(startLevel(device({ mobile: false, gpu: 'Google SwiftShader' }))).toBe(HIGH - 1);
  });

  it('counts a phone"s hints against it, one level each', () => {
    expect(startLevel(device())).toBe(HIGH); // a flagship: no hints
    expect(startLevel(device({ memoryGB: 3 }))).toBe(HIGH - 1);
    expect(startLevel(device({ cores: 4 }))).toBe(HIGH - 1);
    expect(startLevel(device({ gpu: 'Mali-G52 MC2' }))).toBe(HIGH - 1);
    expect(startLevel(device({ memoryGB: 2, cores: 4, gpu: 'PowerVR GE8320' }))).toBe(0);
    // a Mali-G57 held 60 fps at 2x through a whole battle on a Galaxy A16, so it is not weak
    expect(startLevel(device({ gpu: 'Mali-G57 MC2' }))).toBe(HIGH);
  });

  it('does not read an iPhone"s hidden cores as a slow phone', () => {
    // WebKit reports "Apple GPU" for every Apple chip and gives at most a few cores, so the core
    // count says nothing there; an iPhone would otherwise start a level down for being an iPhone
    expect(startLevel(device({ cores: 4, memoryGB: 0, gpu: 'Apple GPU' }))).toBe(HIGH);
    expect(startLevel(device({ cores: 4, memoryGB: 0, gpu: 'Mali-G52' }))).toBe(HIGH - 2);
  });

  it('lets the player pin a level, and lets auto fall but never climb past the start', () => {
    const weak = device({ memoryGB: 2, cores: 4 });
    expect(levelRange('high', weak)).toEqual({ start: HIGH, min: HIGH, max: HIGH });
    expect(levelRange('saver', device())).toEqual({ start: 0, min: 0, max: 0 });
    const auto = levelRange('auto', weak);
    expect(auto.start).toBe(startLevel(weak));
    expect(auto.max).toBe(auto.start);
    expect(auto.min).toBe(0);
  });
});

describe('the frame gate', () => {
  it('locks to the display: every frame lasts the same whole number of refreshes', () => {
    // one refresh on 60 or 90 Hz at 60 fps, two on 120 or 144 — never a fixed schedule, which
    // would alternate one and two refreshes on 90 Hz and drift off a 60.1 Hz screen
    const table: [number, number, number][] = [
      [30, 60, 30], [60, 60, 60], [60.1, 60, 60.1], [75, 60, 75], [90, 60, 90], [120, 60, 60], [144, 60, 72],
      [30, 30, 30], [60, 30, 30], [90, 30, 30], [120, 30, 30],
    ];
    for (const [hz, cap, want] of table) {
      const r = gateRun(hz, cap, 10);
      expect([hz, cap, Math.round(r.fps * 10) / 10]).toEqual([hz, cap, want]);
    }
  });

  it('reads the refresh rate off the frames themselves, within a percent', () => {
    for (const hz of [30, 50, 60, 75, 90, 120, 144, 165]) {
      const r = gateRun(hz, 60, 10);
      expect(Math.abs(1000 / r.vsync - hz)).toBeLessThan(hz * 0.01);
    }
  });

  it('is not fooled by iOS stamping a late callback and then an early one', () => {
    // the shortest gap would read 9 ms after 24 as a 110 Hz screen, call every ordinary frame a
    // missed refresh and tighten the gate until the game ran at half rate
    const r = gateRun(60, 60, 10, 8);
    expect(Math.abs(1000 / r.vsync - 60)).toBeLessThan(1);
    expect(r.fps).toBeGreaterThan(55);
  });

  it('never lets two frames through inside one refresh', () => {
    for (const hz of [60, 90, 120, 144]) {
      for (const cap of [30, 60]) {
        const r = gateRun(hz, cap, 5);
        expect([hz, cap, r.minGap > (1000 / hz) * 0.9]).toEqual([hz, cap, true]);
      }
    }
  });

  it('says how long a frame should last, in whole refreshes', () => {
    const g = new FrameGate(60);
    g.vsync = 1000 / 60;
    expect(g.frameMs).toBeCloseTo(1000 / 60, 6);
    g.vsync = 1000 / 120;
    expect(g.frameMs).toBeCloseTo(1000 / 60, 6); // two refreshes of a 120 Hz screen
    g.fps = 30;
    expect(g.frameMs).toBeCloseTo(1000 / 30, 6);
    g.vsync = 1000 / 60;
    expect(g.frameMs).toBeCloseTo(1000 / 30, 6);
  });
});

describe('the governor', () => {
  const OPTS: GovernorOptions = { window: 1, slowWindows: 2, upAfter: 4, maxUpAfter: 16, probe: 3 };
  const auto = { start: HIGH, min: 0, max: HIGH };
  // 16 and 64 divide a second exactly, so a window closes on the sample it should. 16 is slow for
  // every level (the saver's own target is 30) and 64 is comfortable for all of them.
  const SLOW_FPS = 16, FAST_FPS = 64;

  it('waits for a run of slow windows before giving anything up', () => {
    const g = new FrameGovernor(auto, OPTS);
    expect(feed(g, SLOW_FPS, OPTS.window * OPTS.slowWindows - 0.1)).toEqual([]);
    expect(feed(g, SLOW_FPS, 0.1)).toEqual([HIGH - 1]);
  });

  it('ignores a pause and a single hitch, which say nothing about the load', () => {
    const g = new FrameGovernor(auto, OPTS);
    for (let i = 0; i < 100; i++) expect(g.sample(2)).toBe(false); // a hidden tab coming back
    expect(g.sample(-1)).toBe(false);
    expect(g.level).toBe(HIGH);
  });

  it('steps down one level at a time and stops at the floor', () => {
    const g = new FrameGovernor(auto, OPTS);
    expect(feed(g, SLOW_FPS, 30)).toEqual([HIGH - 1, HIGH - 2]);
    expect(g.level).toBe(0);
    expect(feed(g, SLOW_FPS, 30)).toEqual([]); // nothing left to give up
  });

  it('climbs back after a long stable stretch, and never past where it started', () => {
    const g = new FrameGovernor({ start: 1, min: 0, max: 1 }, OPTS);
    feed(g, SLOW_FPS, 2);
    expect(g.level).toBe(0);
    expect(feed(g, FAST_FPS, OPTS.upAfter - 0.5)).toEqual([]); // not on the strength of a moment
    expect(feed(g, FAST_FPS, 1)).toEqual([1]); // one step back, not straight to the top
    expect(feed(g, FAST_FPS, 60)).toEqual([]); // auto never climbs above the start level
  });

  it('waits longer each time a level up fails, up to a ceiling', () => {
    // a phone that is hot enough to drop again the moment it is given back its pixels should not
    // be asked every half minute; the wait doubles, so the player gets a steady picture instead
    const g = new FrameGovernor({ start: 2, min: 0, max: 2 }, OPTS);
    feed(g, SLOW_FPS, 2); // down to 1
    expect(g.level).toBe(1);
    feed(g, FAST_FPS, OPTS.upAfter); // stable: back up to 2
    expect(g.level).toBe(2);
    feed(g, SLOW_FPS, 2); // and straight back down, inside `probe`: the try failed
    expect(g.level).toBe(1);
    expect(feed(g, FAST_FPS, OPTS.upAfter + 0.5)).toEqual([]); // the old wait is no longer enough
    expect(feed(g, FAST_FPS, OPTS.upAfter)).toEqual([2]);
  });

  it('holds a 30 Hz display rather than stepping it down for frames it could never show', () => {
    // an iPhone in Low Power Mode caps animation frames at 30; without the cap the governor reads
    // 30 fps against a target of 60, calls the phone slow and takes its pixels away for nothing
    const cap = refreshCap(1000 / 30);
    expect(cap).toBe(30);
    const held = new FrameGovernor(auto, OPTS);
    expect(feed(held, 30, 60, cap)).toEqual([]);
    expect(held.level).toBe(HIGH);
    const free = new FrameGovernor(auto, OPTS);
    expect(feed(free, 30, 60).length).toBeGreaterThan(0);
    expect(free.level).toBeLessThan(HIGH);
  });

  it('only treats a display as capped when it really refreshes at 30', () => {
    expect(refreshCap(1000 / 60)).toBe(Infinity);
    expect(refreshCap(1000 / 120)).toBe(Infinity);
    // a device too slow for its level reads as a rate between two (frames of one and two
    // refreshes) and must not be mistaken for a 30 Hz screen
    expect(refreshCap(1000 / 40)).toBe(Infinity);
    expect(refreshCap(1000 / 32)).toBe(30);
    expect(refreshCap(1000 / 28)).toBe(30);
  });

  it('ships with a window long enough to be a measurement', () => {
    expect(GOVERNOR.window * GOVERNOR.slowWindows).toBeGreaterThanOrEqual(2);
    expect(GOVERNOR.upAfter).toBeGreaterThan(GOVERNOR.probe);
    expect(GOVERNOR.maxUpAfter).toBeGreaterThanOrEqual(GOVERNOR.upAfter);
  });
});
