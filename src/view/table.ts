// The table the board lies on. Everything outside the map used to be one flat brown fill: on a
// 16:9 screen the map is a tall narrow column, so half the opening frame was an empty void and the
// first screen read as cheap (lookB.ts). The toys are hand-carved pieces on a table (light.ts),
// so what surrounds them is that table: a waxed wooden top in world space, with the board's own
// cast shadow on it. One tiling sprite and one static Graphics: two draw calls, no per-frame work.

import { Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import { hexPts } from './pen';
import { MAP_X0, MAP_X1, MAP_Y0, MAP_Y1, type Pt } from './viewConst';

/** One wood tile, view units (a hex is 1.73 wide): two planks to a tile. */
const PLANK = 9;
/** How far the table reaches around the map, view units: past the widest screen at full zoom-out. */
const SPAN = 240;
/** The board's cast shadow, down and to the right of the light (lookB CAST): a tight contact edge
 *  and passes that spread and fade, which is what a blur would do at a fraction of its cost. */
const SHADOW = [
  { dx: 0.05, dy: 0.06, r: 1.02, a: 0.17 },
  { dx: 0.17, dy: 0.19, r: 1.04, a: 0.12 },
  { dx: 0.33, dy: 0.37, r: 1.06, a: 0.1 },
  { dx: 0.53, dy: 0.59, r: 1.09, a: 0.08 },
  { dx: 0.77, dy: 0.85, r: 1.12, a: 0.06 },
];

function rng(seed: number): () => number {
  return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
}

/** A waxed oak top: long grain along the planks, a groove between them. Seamless both ways — the
 *  grain waves over exactly one tile width, and a line near an edge is drawn at both wraps. */
function woodTex(): Texture {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#6b482c';
  c.fillRect(0, 0, N, N);
  const r = rng(23);
  for (let i = 0; i < 120; i++) {
    const y = r() * N, light = r() < 0.45;
    c.strokeStyle = light ? `rgba(199,155,106,${0.04 + r() * 0.07})` : `rgba(52,33,18,${0.04 + r() * 0.08})`;
    c.lineWidth = 0.6 + r() * 2.4;
    const amp = 0.8 + r() * 3.2, ph = r() * 7;
    for (const oy of [-N, 0, N]) {
      c.beginPath();
      for (let x = 0; x <= N; x += 8) c.lineTo(x, y + oy + Math.sin((x / N) * Math.PI * 2 + ph) * amp);
      c.stroke();
    }
  }
  // the groove between two planks, with the light catching its far lip
  for (const y of [0, N / 2]) {
    c.strokeStyle = 'rgba(40,25,13,0.5)';
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(N, y);
    c.stroke();
    c.strokeStyle = 'rgba(206,166,120,0.14)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(0, y + 2);
    c.lineTo(N, y + 2);
    c.stroke();
  }
  return Texture.from(cv);
}

let woodCache: Texture | null = null;

export class TableLayer {
  /** Under the ground, in world space: the table slides and zooms with the board. */
  readonly root = new Container();
  private shade = new Graphics();

  constructor() {
    woodCache ??= woodTex();
    const cx = (MAP_X0 + MAP_X1) / 2, cy = (MAP_Y0 + MAP_Y1) / 2;
    const wood = new TilingSprite({ texture: woodCache, width: (SPAN * 2 * 256) / PLANK, height: (SPAN * 2 * 256) / PLANK });
    wood.scale.set(PLANK / 256);
    wood.position.set(cx - SPAN, cy - SPAN);
    this.root.addChild(wood, this.shade);
  }

  /** The board's shadow for this map: every tile's hex in one union per pass, so the overlaps do
   *  not stack up, drawn once per match. `tv` is the camera's per tile view position. */
  build(tv: readonly Pt[]): void {
    const ctx = this.shade.context;
    ctx.clear();
    for (const s of SHADOW) {
      ctx.beginPath();
      for (const v of tv) ctx.poly(hexPts(v.x + s.dx, v.y + s.dy, s.r), true);
      ctx.fill({ color: 0x26180c, alpha: s.a });
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
