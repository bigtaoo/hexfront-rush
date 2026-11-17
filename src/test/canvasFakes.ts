// A stand-in for the 2D canvas, for the node test environment: there is no jsdom here. Enough of
// it that the view layer can be built and drawn headless -- the textures baked at startup (the
// table's oak, the grain, the light) draw into it and nothing reads the pixels back, and Pixi's
// text measurer needs a context and a `measureText` that answers in numbers.
//
// Nothing here draws: a test that asserts on pixels would be asserting on this file.

/** Every 2D call does nothing; every property keeps what was set on it. */
const ctx2d = new Proxy({} as Record<string, unknown>, {
  get: (t, k) => {
    if (k in t) return t[k as string];
    if (k === 'measureText') {
      return (s: string) => ({
        width: s.length * 8,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: s.length * 8,
      });
    }
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'getImageData') {
      return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    }
    return () => {};
  },
  set: (t, k, v) => {
    t[k as string] = v;
    return true;
  },
});

class FakeCanvas {
  width = 0;
  height = 0;
  getContext(): unknown {
    return ctx2d;
  }
}

/** Puts `document.createElement('canvas')` and the two globals Pixi looks for on globalThis. */
export function installCanvas(): void {
  const G = globalThis as unknown as Record<string, unknown>;
  G['HTMLCanvasElement'] ??= FakeCanvas;
  G['CanvasRenderingContext2D'] ??= class {};
  G['document'] ??= { createElement: () => new FakeCanvas() };
}
