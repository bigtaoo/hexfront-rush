import type { Application, Renderer } from 'pixi.js';
import { FrameClock } from './frameClock';
import { FrameGate, FrameGovernor, frameResolution, LEVELS, refreshCap, targetFps, type LevelRange, type LevelSettings } from './quality';

// Drives the frame loop and applies quality levels (ported from standing's
// client/src/game/qualityRuntime.ts). Pixi's own ticker.maxFPS cannot be used: it still
// measures each frame's delta from the last skipped animation frame, so a 60 fps cap on a
// 120 Hz screen would run the game at half speed. Instead the ticker is stopped and stepped
// from our own requestAnimationFrame loop behind a FrameGate. Calm screens (no battle moving)
// get a lower cap, and their frames are left out of the governor's measure. The ticker runs on a
// FrameClock (as standing's), so the battle and the view step whole refreshes however late the
// frame's callback ran. Screens with no battle draw at the canvas's full density and battles at
// their level's resolution: the canvas is resized as the player goes in or out of a battle, never
// mid-battle (frameResolution). The full density follows the screen's: a window dragged to another
// monitor, a page zoom, or a page first laid out hidden at 1x (watchDensity). A frame that throws
// goes to onFault (Game.fault in app/game.ts, which asks app/faultGuard.ts what to do).

/** The WebGL renderer string, '' when the browser hides it. */
export function gpuName(renderer: Renderer): string {
  const gl = (renderer as Renderer & { gl?: WebGLRenderingContext }).gl;
  if (!gl) return '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  } catch {
    return '';
  }
}

/** Calls `onChange` with the new device pixel ratio each time it changes; returns a stop. */
export function watchDensity(onChange: (dpr: number) => void, win: Pick<Window, 'devicePixelRatio' | 'matchMedia'> | undefined = globalThis.window): () => void {
  let off = () => {};
  const arm = () => {
    off();
    if (typeof win?.matchMedia !== 'function') return;
    // a query on the ratio as it is now: it changes once, then a new one is armed on the new ratio
    const query = win.matchMedia(`(resolution: ${win.devicePixelRatio || 1}dppx)`);
    const changed = () => {
      onChange(win.devicePixelRatio || 1);
      arm();
    };
    query.addEventListener('change', changed);
    off = () => query.removeEventListener('change', changed);
  };
  arm();
  return () => off();
}

export class QualityRuntime {
  governor: FrameGovernor;
  private readonly gate: FrameGate;
  private readonly clock = new FrameClock();
  private maxResolution: number;
  private last = 0;
  private wasCalm = true;
  /** A frame threw; must not throw itself. */
  onFault: (err: unknown) => void = (err) => console.error(err);
  /** Stops the loop for good (a newer tab took the game over, game/tabLock.ts). */
  stopped = false;

  constructor(
    private readonly app: Application,
    range: LevelRange,
    /** True while nothing fast is on screen: the menus, or a battle that is not moving. */
    private readonly calm: () => boolean = () => false,
    /** True while no battle is on screen (home, title, results): drawn at full density. */
    private readonly sharp: () => boolean = () => false,
    /** The most the canvas's density may follow the screen's up to (quality.densityCap). */
    cap = app.renderer.resolution,
  ) {
    this.governor = new FrameGovernor(range);
    this.maxResolution = app.renderer.resolution;
    watchDensity((dpr) => (this.maxResolution = Math.min(dpr, cap)));
    this.gate = new FrameGate(LEVELS[range.start].fps);
    // a later ticker.add() would otherwise start the ticker's own loop again
    app.ticker.autoStart = false;
    app.ticker.stop();
    this.apply();
    const loop = (now: number) => {
      if (this.stopped) return;
      requestAnimationFrame(loop);
      const calm = this.calm();
      this.gate.fps = targetFps(this.settings, calm);
      if (!this.gate.pass(now)) return;
      // calm frames come slower on purpose and say nothing about the load, nor does the first
      // battle frame after them (its time runs from a calm frame)
      if (this.last > 0 && !calm && !this.wasCalm) this.governor.sample((now - this.last) / 1000, refreshCap(this.gate.vsync));
      this.last = now;
      this.wasCalm = calm;
      // a throw in any of the frame's listeners or the render goes to onFault, which recovers
      try {
        this.apply();
        app.ticker.update(this.clock.tick(now, this.gate.vsync));
      } catch (err) {
        this.onFault(err);
      }
    };
    requestAnimationFrame(loop);
  }

  get settings(): LevelSettings {
    return LEVELS[this.governor.level];
  }

  /** Sizes the canvas for this frame's screen; a no-op unless a battle came or went or the level moved. */
  private apply(): void {
    const res = frameResolution(this.sharp(), this.settings, this.maxResolution);
    const r = this.app.renderer;
    if (r.resolution !== res) r.resize(this.app.screen.width, this.app.screen.height, res);
  }
}
