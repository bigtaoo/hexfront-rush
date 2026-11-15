// The grain under a tile's paint. The cast is painted wooden toys (art/STYLE.md) and the table is
// waxed oak (table.ts), but the tiles were flat vector fills: next to the sprites they read as
// plastic, the board as a flat sheet. Each tile top now carries a faint wood grain and paint
// speckle, light and dark strokes over its own colour (one texture works on every theme and team
// colour). Three variants turn the grain 0, 60 and 120 degrees, so neighbouring blocks differ the
// way cut blocks do. Drawn once per variant on a canvas, then shared by every tile.

import { Texture } from 'pixi.js';

/** Texture side, px: about a tile top's size in device pixels at play zoom (80-114), so the
 *  strokes are neither stretched nor thinned out. */
const N = 112;
export const GRAIN_VARIANTS = 3;

function rng(seed: number): () => number {
  return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
}

function grainTex(variant: number): Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d')!;
  const r = rng(71 + variant * 977);
  c.save();
  c.translate(N / 2, N / 2);
  c.rotate((variant * Math.PI) / 3);
  // long grain: wavy strokes across the block (drawn past the corners so the turned square is full)
  const L = N * 0.75;
  for (let i = 0; i < 30; i++) {
    const y = (r() * 2 - 1) * L, light = r() < 0.5;
    c.strokeStyle = light ? `rgba(255,247,228,${0.05 + r() * 0.09})` : `rgba(74,50,24,${0.045 + r() * 0.08})`;
    c.lineWidth = 0.7 + r() * 1.8;
    const amp = 0.6 + r() * 2.6, ph = r() * 7, k = 1.5 + r() * 2;
    c.beginPath();
    for (let x = -L; x <= L; x += 4) c.lineTo(x, y + Math.sin((x / N) * Math.PI * k + ph) * amp);
    c.stroke();
  }
  c.restore();
  // paint speckle: the brush's tooth, single pixels a shade lighter or darker
  for (let i = 0; i < 520; i++) {
    const light = r() < 0.5;
    c.fillStyle = light ? `rgba(255,250,236,${0.05 + r() * 0.08})` : `rgba(60,40,20,${0.05 + r() * 0.07})`;
    c.fillRect(Math.floor(r() * N), Math.floor(r() * N), 1, 1);
  }
  return Texture.from(cv);
}

const cache: Texture[] = [];
/** The grain texture for a tile, by variant (0 to GRAIN_VARIANTS - 1). */
export function grain(variant: number): Texture {
  return (cache[variant] ??= grainTex(variant));
}
