// What replaces a minimap on a map that is only a little bigger than the screen: the overview
// button (top right of the play area: zoom out to the whole map and back), and markers on the
// edge of the play area pointing at what is off screen. Map events still waiting keep a quiet
// marker; things that just happened off screen (an event claimed, the castle under attack, a
// building lost or destroyed, an epic or legendary barracks raised by the rival, from a card or a
// mystery) ping a bright one for a few seconds. A tap on a marker glides the camera there
// (Renderer.edgeTap). All of it hides in the overview, where the whole map is on screen anyway.

import { Container, Sprite, type Texture } from 'pixi.js';
import type { Engine } from '../sim/engine';
import { EVENT_LIST, RARITY_COLOR, type BuildingType } from '../sim/rules';
import type { SimEvent } from '../sim/types';
import { buildingTex, eventTex } from './art';
import type { Camera } from './camera';
import type { Frame } from './frame';
import { liveGraphics } from './pen';
import type { Pt } from './viewConst';

/** Marker radius and the margin it keeps from the play area's edge, screen pixels. */
const MR = 17;
const MARGIN = MR + 9;
/** The icon's longer side inside a marker, screen pixels. */
const ICON = MR * 1.65;
/** Overview button radius. */
const BR = 22;
/** How long a ping shows, seconds. */
const PING_LIFE = 3.2;
/** A castle under attack pings at most this often, seconds. */
const CASTLE_EVERY = 5;

interface Ping {
  /** View point it points at. */
  x: number;
  y: number;
  color: string;
  tex: Texture;
  t: number;
  /** Merges repeats (the same building hit again, the same tile). */
  key: string;
}

interface Marker {
  sx: number;
  sy: number;
  /** View point it points at. */
  to: Pt;
}

export class EdgeLayer {
  readonly root = new Container();
  private back = liveGraphics();
  private icons = new Container();
  private pool: Sprite[] = [];
  private used = 0;
  private pings: Ping[] = [];
  private markers: Marker[] = [];
  private btn: { x: number; y: number } | null = null;
  private castleT = -99;
  private time = 0;

  constructor() {
    this.root.addChild(this.back.g, this.icons);
  }

  reset(): void {
    this.pings = [];
    this.markers = [];
    this.castleT = -99;
  }

  /** Pings for sim events off screen, seen from `local`'s side. */
  onEvent(e: SimEvent, eng: Engine, cam: Camera, local: number): void {
    if (e.x === undefined || e.y === undefined) return;
    const v = cam.view(e.x, e.y);
    const mine = e.team === local;
    switch (e.type) {
      case 'mapEvent': {
        const ev = EVENT_LIST.findIndex((d) => d.key === e.kind);
        if (ev > 0) this.ping(v, mine ? '#fde047' : '#ef4444', eventTex(e.kind!), `ev${e.x},${e.y}`);
        break;
      }
      case 'dmg': {
        if (!mine || this.time - this.castleT < CASTLE_EVERY) break;
        const b = eng.blds.find((x) => x.id === e.id);
        if (!b || b.type !== 'base') break;
        this.castleT = this.time;
        this.ping(v, '#ef4444', buildingTex('base', local, 0), 'castle');
        break;
      }
      case 'bldDown':
        if (e.kind === 'base') break;
        this.ping(v, mine ? '#ef4444' : '#fde047', buildingTex(e.kind as BuildingType, e.team ?? local, 0), `down${e.x},${e.y}`);
        break;
      case 'mysteryWin':
      case 'barracks':
        // a barracks card, or a barracks a mystery gave
        if (mine || (e.rarity ?? 0) < 2 || (e.type === 'mysteryWin' && e.kind !== 'barracks')) break;
        this.ping(v, RARITY_COLOR[e.rarity!]!, buildingTex('barracks', e.team!, e.rarity!), `bar${e.x},${e.y}`);
        break;
    }
  }
  private ping(v: Pt, color: string, tex: Texture, key: string): void {
    this.pings = this.pings.filter((p) => p.key !== key);
    this.pings.push({ x: v.x, y: v.y, color, tex, t: 0, key });
    if (this.pings.length > 6) this.pings.shift();
  }

  draw(f: Frame, look: boolean): void {
    const cam = f.cam, eng = f.eng, p = this.back.p.clear();
    this.time += f.dt;
    this.used = 0;
    this.markers = [];
    this.btn = null;
    for (const q of this.pings) q.t += f.dt;
    this.pings = this.pings.filter((q) => q.t < PING_LIFE);
    const show = look && !f.ui.demo;
    // the overview button: a magnifier, minus to zoom out, plus to come back
    if (show && cam.canZoom) {
      const x = cam.W - BR - 10, y = cam.hudTop + BR + 10;
      this.btn = { x, y };
      p.circle(x, y, BR, 'rgba(15,23,42,0.75)', 'rgba(255,255,255,0.75)', 2);
      p.circle(x - 3, y - 3, 9, null, '#ffffff', 2.6);
      p.line([x + 3.5, y + 3.5, x + 11, y + 11], '#ffffff', 3.4, 'round');
      p.line([x - 7.5, y - 3, x + 1.5, y - 3], '#ffffff', 2.4, 'round');
      if (cam.overview) p.line([x - 3, y - 7.5, x - 3, y + 1.5], '#ffffff', 2.4, 'round');
    }
    if (show && !cam.fitAll && cam.zoomK < 0.02) {
      // map events still waiting, then the pings over them
      for (const t of eng.tiles) {
        if (!t.event) continue;
        const v = cam.tv[t.i]!, d = EVENT_LIST[t.event]!;
        if (this.pings.some((q) => Math.abs(q.x - v.x) < 0.01 && Math.abs(q.y - v.y) < 0.01)) continue;
        this.marker(cam, v, d.troops ? RARITY_COLOR[d.rarity]! : '#fde047', eventTex(d.key), 0.8, 1);
      }
      for (const q of this.pings) {
        const pulse = 1 + Math.max(0, 1 - q.t / 0.6) * 0.35 + Math.sin(q.t * 9) * 0.05;
        const fade = Math.min(1, (PING_LIFE - q.t) / 0.5);
        this.marker(cam, q, q.color, q.tex, fade, pulse);
      }
    }
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }

  /** A marker on the play area's edge pointing at view point `v`, if `v` is off screen. */
  private marker(cam: Camera, v: Pt, color: string, tex: Texture, alpha: number, scale: number): void {
    const s = cam.worldToScreen(v.x, v.y);
    const x0 = MARGIN, x1 = cam.W - MARGIN, y0 = cam.hudTop + MARGIN, y1 = cam.H - cam.hudBot - MARGIN;
    if (s.x >= x0 - MR && s.x <= x1 + MR && s.y >= y0 - MR && s.y <= y1 + MR) return;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dx = s.x - cx, dy2 = s.y - cy;
    const t = Math.min(dx ? (dx > 0 ? x1 - cx : x0 - cx) / dx : Infinity, dy2 ? (dy2 > 0 ? y1 - cy : y0 - cy) / dy2 : Infinity);
    const mx = cx + dx * t, my = cy + dy2 * t, a = Math.atan2(dy2, dx);
    const r = MR * scale, p = this.back.p;
    p.a = alpha;
    // the arrow, then the disc
    const ax = Math.cos(a), ay = Math.sin(a), tip = r + 8;
    p.poly([mx + ax * tip, my + ay * tip, mx + ax * (r - 2) - ay * 7, my + ay * (r - 2) + ax * 7, mx + ax * (r - 2) + ay * 7, my + ay * (r - 2) - ax * 7], color);
    p.circle(mx, my, r, 'rgba(15,23,42,0.82)', color, 2.5);
    p.a = 1;
    let g = this.pool[this.used];
    if (!g) {
      g = new Sprite({ texture: tex, anchor: 0.5 });
      this.pool.push(g);
      this.icons.addChild(g);
    }
    this.used++;
    if (g.texture !== tex) g.texture = tex;
    g.visible = true;
    g.alpha = alpha;
    // the picture fits the disc by its longer side
    g.scale.set((ICON * scale) / Math.max(1, tex.width, tex.height));
    g.position.set(mx, my);
    this.markers.push({ sx: mx, sy: my, to: { x: v.x, y: v.y } });
  }

  /** What a tap at a screen point hits: the overview button, a marker's view point, or null. */
  hit(sx: number, sy: number): 'overview' | Pt | null {
    const b = this.btn;
    if (b && Math.hypot(sx - b.x, sy - b.y) <= BR + 6) return 'overview';
    let best: Marker | null = null, bd = (MR + 8) ** 2;
    for (const m of this.markers) {
      const d = (sx - m.sx) ** 2 + (sy - m.sy) ** 2;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best ? best.to : null;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
