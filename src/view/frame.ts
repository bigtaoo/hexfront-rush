// What every layer reads while drawing one frame, and the screen juice the HUD and the overlays share.

import type { Engine } from '../sim/engine';
import type { Camera } from './camera';
import type { Pt } from './viewConst';

export interface DrawUi {
  /** Seconds left of the red flash on the gold pill (a refused buy). */
  goldFlash?: number;
  /** The title screen's attract mode: fit the whole map, no minimap. */
  demo?: boolean;
}

/** The part of the view on screen, in view units, with margins for tall sprites. */
export interface Vis {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Frame {
  eng: Engine;
  /** How far the view is between the last two ticks. */
  alpha: number;
  dt: number;
  /** Seconds since the renderer started (animation phase). */
  time: number;
  ui: DrawUi;
  cam: Camera;
  vis: Vis;
  local: number;
}

export const inView = (v: Vis, x: number, y: number): boolean => x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1;

/** Screen juice shared by the HUD and the overlays. */
export class Juice {
  /** Counter pop when coins land (>0) or gold is spent (<0). */
  goldPop = 0;
  /** Refuse shake when the player cannot afford something. */
  goldShake = 0;
  lastGold: number | null = null;
  /** Where flying coins land (the coin on the gold pill), screen pixels. */
  goldAt: Pt | null = null;
  /** Screen trauma 0..1; the offset grows with its square. */
  shake = 0;

  reset(): void {
    this.goldPop = 0;
    this.goldShake = 0;
    this.lastGold = null;
    this.goldAt = null;
    this.shake = 0;
  }
}
