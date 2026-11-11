// The two pieces of the frame loop that can be tested without a GPU: how the canvas follows the
// screen's pixel density, and how the renderer's name is read. Both guard against the browser
// rather than against our own arithmetic, so both are written to take a stand-in.

import { describe, expect, it, vi } from 'vitest';
import type { Renderer } from 'pixi.js';
import { gpuName, watchDensity } from './qualityRuntime';

/** A window whose devicePixelRatio we can move, with matchMedia's one listener per query. */
function fakeWin(dpr = 1) {
  const queries: { q: string; fire: () => void; listeners: number }[] = [];
  const win = {
    devicePixelRatio: dpr,
    matchMedia(q: string) {
      const entry = { q, fire: () => {}, listeners: 0 };
      queries.push(entry);
      return {
        addEventListener(_: string, cb: () => void) {
          entry.fire = cb;
          entry.listeners++;
        },
        removeEventListener() {
          entry.listeners--;
        },
      } as unknown as MediaQueryList;
    },
  };
  return { win, queries, move: (to: number) => { win.devicePixelRatio = to; queries[queries.length - 1]!.fire(); } };
}

describe('watching the screen density', () => {
  it('re-arms on the new ratio each time, because a query only ever changes once', () => {
    // `(resolution: 2dppx)` stops matching the moment the window moves to a 1x monitor and never
    // matches again: without a fresh query on the new ratio the canvas would follow one move and
    // then stay soft (or oversized) for the rest of the session
    const { win, queries, move } = fakeWin(2);
    const seen: number[] = [];
    const stop = watchDensity((d) => seen.push(d), win);
    expect(queries.map((q) => q.q)).toEqual(['(resolution: 2dppx)']);
    move(1);
    move(3);
    expect(seen).toEqual([1, 3]);
    expect(queries.map((q) => q.q)).toEqual(['(resolution: 2dppx)', '(resolution: 1dppx)', '(resolution: 3dppx)']);
    expect(queries.slice(0, -1).every((q) => q.listeners === 0)).toBe(true); // each old query let go
    stop();
    expect(queries.every((q) => q.listeners === 0)).toBe(true);
  });

  it('reads a hidden or missing ratio as 1x rather than as no pixels', () => {
    const { win, move } = fakeWin(0);
    const seen: number[] = [];
    watchDensity((d) => seen.push(d), win);
    move(0);
    expect(seen).toEqual([1]);
  });

  it('does nothing at all where matchMedia is not there to ask', () => {
    const onChange = vi.fn();
    expect(() => watchDensity(onChange, undefined)()).not.toThrow();
    expect(() => watchDensity(onChange, { devicePixelRatio: 2 } as unknown as Window)()).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('reading the renderer"s name', () => {
  const rendererWith = (gl: unknown): Renderer => ({ gl }) as unknown as Renderer;

  it('prefers the unmasked name, which is the one that says which chip it is', () => {
    const gl = {
      RENDERER: 1,
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 2 }),
      getParameter: (p: number) => (p === 2 ? 'Apple GPU' : 'WebKit WebGL'),
    };
    expect(gpuName(rendererWith(gl))).toBe('Apple GPU');
  });

  it('falls back, and never throws: the level it feeds must not depend on the browser being open', () => {
    // a privacy setting, a locked-down WebGL, or no context at all: quality.startLevel reads '' as
    // "nothing known", which is a flagship's answer too, so the game starts at the top either way
    const plain = { RENDERER: 1, getExtension: () => null, getParameter: () => 'WebKit WebGL' };
    expect(gpuName(rendererWith(plain))).toBe('WebKit WebGL');
    expect(gpuName(rendererWith(undefined))).toBe('');
    expect(gpuName(rendererWith({ getExtension: () => { throw new Error('blocked'); } }))).toBe('');
    const nothing = { RENDERER: 1, getExtension: () => null, getParameter: () => null };
    expect(gpuName(rendererWith(nothing))).toBe('');
  });
});
