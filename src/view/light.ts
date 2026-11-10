// lookB (lookB.ts): one light over the whole scene, the part of the reference's "physical table"
// look that a flat 2D field can borrow. Every picture throws its cast shadow (art.ts castSprite)
// up and to the right; this layer adds what lies over everything:
// - grain: faint large blotches in the sand, in world space (it moves with the map), so the ground
//   reads as a material and not as a flat fill; multiplied, so it never lightens anything;
// - falloff: the screen multiplied by a warm grey that is white (no change) in the lit upper left
//   and darkest in the lower right corner;
// - haze: the far (top) edge washed toward a pale warm sky tone, the air between eye and far ground.
// The textures are small canvases stretched to size: gradients survive any stretch.

import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { MAP_X0, MAP_X1, MAP_Y0, MAP_Y1 } from './viewConst';

/** Size of one grain tile, view units (a hex is 1.73 wide). */
const GRAIN_TILE = 7;

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): Texture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  return Texture.from(cv);
}

/** Seeded so the sand looks the same every match. */
function rng(seed: number): () => number {
  return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
}

function grainTex(): Texture {
  const N = 256;
  return canvasTex(N, N, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, N, N);
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      const x = r() * N, y = r() * N, rad = 14 + r() * 46;
      const dark = r() < 0.6;
      const col = dark ? `rgba(150,118,80,${0.05 + r() * 0.07})` : `rgba(255,255,255,0)`;
      // drawn at the wrapped offsets too, so the tile repeats without a seam
      for (const ox of [-N, 0, N])
        for (const oy of [-N, 0, N]) {
          const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
          g.addColorStop(0, col);
          g.addColorStop(1, 'rgba(150,118,80,0)');
          c.fillStyle = g;
          c.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
        }
    }
  });
}

function falloffTex(): Texture {
  const N = 256;
  return canvasTex(N, N, (c) => {
    const g = c.createRadialGradient(N * 0.3, N * 0.25, N * 0.08, N * 0.3, N * 0.25, N * 1.15);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, '#f3ece2');
    g.addColorStop(1, '#a8957f');
    c.fillStyle = g;
    c.fillRect(0, 0, N, N);
  });
}

function hazeTex(): Texture {
  return canvasTex(4, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(250,240,222,0.55)');
    g.addColorStop(0.22, 'rgba(250,240,222,0.12)');
    g.addColorStop(0.4, 'rgba(250,240,222,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 256);
  });
}

export class LightLayer {
  /** Over the ground, under the cards and sprites (world space). */
  readonly grain: TilingSprite;
  /** Over the world, under the HUD (screen space). */
  readonly screen = new Container();
  private falloff = new Sprite(falloffTex());
  private haze = new Sprite(hazeTex());

  constructor() {
    const t = grainTex();
    this.grain = new TilingSprite({ texture: t, width: (MAP_X1 - MAP_X0 + 4) * 256 / GRAIN_TILE, height: (MAP_Y1 - MAP_Y0 + 4) * 256 / GRAIN_TILE });
    this.grain.scale.set(GRAIN_TILE / 256);
    this.grain.position.set(MAP_X0 - 2, MAP_Y0 - 2);
    this.grain.blendMode = 'multiply';
    this.falloff.blendMode = 'multiply';
    this.screen.addChild(this.falloff, this.haze);
  }

  resize(W: number, top: number, H: number): void {
    this.falloff.position.set(0, top);
    this.falloff.width = W;
    this.falloff.height = H - top;
    this.haze.position.set(0, top);
    this.haze.width = W;
    this.haze.height = H - top;
  }
}
