// The ground: every tile's side and top (theme shade, team tint, a shadow on obstacles), the light
// rings around buildings and each castle guard's dashed home circle. One Graphics per tile over a
// shared context per look, in its own render group: a frame with no change costs nothing, and a
// tile that changes hands only swaps its context. Tiles go in view-y order (a lower row's top
// covers the side of the row above).

import { Container, Graphics } from 'pixi.js';
import type { Engine } from '../sim/engine';
import { FP } from '../sim/fixed';
import { baseTile, type Tile } from '../sim/map';
import { GUARD, TEAM_BLUE, TEAM_RED, TEAMS } from '../sim/rules';
import type { Camera } from './camera';
import { Pen, sharedCtx } from './pen';
import { COL } from './viewConst';

function tileCtx(side: string, top: string, tint: string, obst: boolean) {
  return sharedCtx(`tile|${side}|${top}|${tint}|${obst ? 1 : 0}`, (p) => {
    p.hex(0, 0.16, 0.97, side);
    p.hex(0, 0, 0.95, top);
    if (tint) p.hex(0, 0, 0.95, tint);
    if (obst) p.hex(0, 0, 0.95, 'rgba(0,0,0,0.12)');
  });
}

export class GroundLayer {
  readonly root = new Container({ isRenderGroup: true });
  private tiles: Graphics[] = [];
  private rings = new Graphics();
  private ringPen = new Pen(this.rings.context);
  private sig = new Int32Array(0);
  private owner = new Int8Array(0);
  private ringsDirty = true;

  /** New match or new side: one Graphics per tile, in view-y order. */
  build(eng: Engine, cam: Camera): void {
    for (const g of this.tiles) g.destroy();
    this.root.removeChildren();
    const order = eng.tiles.map((t) => t.i).sort((a, b) => cam.tv[a]!.y - cam.tv[b]!.y || a - b);
    this.tiles = new Array<Graphics>(eng.tiles.length);
    this.sig = new Int32Array(eng.tiles.length).fill(-1);
    this.owner = new Int8Array(eng.tiles.length).fill(-1);
    for (const i of order) {
      const v = cam.tv[i]!;
      const g = new Graphics();
      g.position.set(v.x, v.y);
      this.tiles[i] = g;
      this.root.addChild(g);
    }
    this.root.addChild(this.rings);
    this.ringsDirty = true;
    this.update(eng, cam);
  }

  /** Swaps the look of every tile that changed; redraws the rings when buildings changed. */
  update(eng: Engine, cam: Camera): void {
    const th = eng.theme;
    for (const t of eng.tiles) {
      const s = t.owner + 3 * (t.bld || 0);
      if (s === this.sig[t.i]) continue;
      this.sig[t.i] = s;
      this.ringsDirty = true;
      if (this.owner[t.i] === t.owner) continue;
      this.owner[t.i] = t.owner;
      this.tiles[t.i]!.context = this.lookOf(t, th.side, th.ground[t.shade] ?? th.ground[0]);
    }
    if (this.ringsDirty) {
      this.ringsDirty = false;
      this.drawRings(eng, cam);
    }
  }

  private lookOf(t: Tile, themeSide: string, top: string) {
    const side = t.owner === TEAM_BLUE ? COL.blueSide : t.owner === TEAM_RED ? COL.redSide : themeSide;
    const tint = t.owner === TEAM_BLUE ? COL.blueTile : t.owner === TEAM_RED ? COL.redTile : '';
    return tileCtx(side, top, tint, !!t.obst);
  }

  private drawRings(eng: Engine, cam: Camera): void {
    const p = this.ringPen.clear();
    for (const b of eng.blds) {
      if (!b.alive) continue;
      const v = cam.tv[b.tile]!;
      p.hex(v.x, v.y, 0.86, null, b.team === TEAM_BLUE ? 'rgba(219,234,254,0.85)' : 'rgba(254,226,226,0.85)', 0.07);
    }
    for (const tm of TEAMS) {
      const v = cam.tv[baseTile(tm)]!;
      p.dashedCircle(v.x, v.y, GUARD.leash / FP, 0.3, 0.25, tm === TEAM_BLUE ? 'rgba(219,234,254,0.45)' : 'rgba(254,226,226,0.45)', 0.06);
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
