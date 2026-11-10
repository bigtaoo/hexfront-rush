// Pointer, wheel and keyboard on the canvas. A tap flips one of the player's cards; on the overview
// button it zooms out to the whole map (or back), on an edge marker it glides the camera there, and
// in the overview it zooms back in where it landed. A drag, the wheel and WASD / the arrows pan; a
// pinch, Ctrl + the wheel (a trackpad pinch) and Space zoom out and in.

import { idx, inMap, worldToHex } from '../sim/hex';
import type { Tile } from '../sim/map';
import { cardCost, standingOf } from '../sim/economy';
import { $ } from './dom';
import type { Game } from './game';

/** A press that moves further than this is a drag, not a tap (CSS px). */
const DRAG_PX = 10;
/** Keyboard pan speed, CSS px per second. */
const KEY_PAN = 700;
/** A pinch that closes (or opens) the fingers' distance by this factor zooms out (or in). */
const PINCH = 1.25;

const KEYMAP: Record<string, readonly [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const isInput = (t: EventTarget | null): boolean => t instanceof HTMLElement && t.tagName === 'INPUT';

export class Controls {
  private down = false;
  private id = 0;
  private sx = 0;
  private sy = 0;
  private lx = 0;
  private ly = 0;
  private drag = false;
  private readonly keys = new Set<string>();
  /** Every pointer down on the canvas (for pinches), and the pinch in progress. */
  private readonly pts = new Map<number, { x: number; y: number }>();
  private pinch: { d: number } | null = null;

  constructor(private readonly g: Game) {}

  /** Forget held keys and any press in progress (pause, blur, a new match). */
  clear(): void {
    this.keys.clear();
    this.down = false;
    this.pts.clear();
    this.pinch = null;
  }

  install(cv: HTMLCanvasElement): void {
    cv.addEventListener('pointerdown', (e) => this.onDown(cv, e));
    cv.addEventListener('pointermove', (e) => this.onMove(cv, e));
    cv.addEventListener('pointerup', (e) => this.onUp(e));
    cv.addEventListener('pointercancel', (e) => this.onUp(e));
    cv.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      if (KEYMAP[e.code]) this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.clear());
  }

  private xy(cv: HTMLCanvasElement, ev: PointerEvent): { x: number; y: number } {
    const rect = cv.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  private tileAt(sx: number, sy: number): Tile | null {
    const w = this.g.renderer.screenToWorld(sx, sy);
    const h = worldToHex(w.x, w.y);
    if (!inMap(h.c, h.r)) return null;
    return this.g.eng.tiles[idx(h.c, h.r)] ?? null;
  }

  private onDown(cv: HTMLCanvasElement, ev: PointerEvent): void {
    ev.preventDefault();
    this.g.sound.unlock();
    if (!this.g.canLook()) return;
    const p = this.xy(cv, ev);
    this.pts.set(ev.pointerId, p);
    if (this.pts.size === 2) {
      // a second finger: a pinch, not a tap or a drag
      this.down = false;
      this.pinch = { d: this.spread() };
      return;
    }
    if (this.down || this.pinch) return;
    Object.assign(this, { down: true, id: ev.pointerId, sx: p.x, sy: p.y, lx: p.x, ly: p.y, drag: false });
    try {
      cv.setPointerCapture(ev.pointerId);
    } catch {
      /* the pointer is already gone */
    }
  }

  /** The distance between the first two pointers down. */
  private spread(): number {
    const [a, b] = [...this.pts.values()];
    return a && b ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 1;
  }

  private onMove(cv: HTMLCanvasElement, ev: PointerEvent): void {
    if (this.pts.has(ev.pointerId)) this.pts.set(ev.pointerId, this.xy(cv, ev));
    if (this.pinch && this.pts.size >= 2) {
      ev.preventDefault();
      const d = this.spread(), R = this.g.renderer;
      if (d < this.pinch.d / PINCH && !R.overview) {
        R.setOverview(true);
        this.pinch.d = d;
      } else if (d > this.pinch.d * PINCH && R.overview) {
        const [a, b] = [...this.pts.values()];
        R.setOverview(false, { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 });
        this.pinch.d = d;
      }
      return;
    }
    if (!this.down || ev.pointerId !== this.id) return;
    ev.preventDefault();
    const p = this.xy(cv, ev);
    const R = this.g.renderer;
    if (!this.drag && Math.hypot(p.x - this.sx, p.y - this.sy) > DRAG_PX) this.drag = true;
    if (this.drag) R.panBy(p.x - this.lx, p.y - this.ly);
    this.lx = p.x;
    this.ly = p.y;
  }

  private onUp(ev: PointerEvent): void {
    this.pts.delete(ev.pointerId);
    if (this.pinch) {
      if (!this.pts.size) this.pinch = null;
      return;
    }
    if (!this.down || ev.pointerId !== this.id) return;
    this.down = false;
    if (this.drag || ev.type === 'pointercancel' || !this.g.canLook()) return;
    this.tapAt(this.sx, this.sy);
  }

  /** A tap: the overview button or an edge marker moves the camera; in the overview the camera
   *  zooms back in there; otherwise one of my cards gets flipped. */
  private tapAt(sx: number, sy: number): void {
    const g = this.g;
    const R = g.renderer;
    if (R.edgeTap(sx, sy)) {
      g.sound.play('tap', 0.4);
      return;
    }
    if (R.overview) {
      R.setOverview(false, { x: sx, y: sy });
      g.sound.play('tap', 0.4);
      return;
    }
    if (!g.canSteer()) return;
    const t = this.tileAt(sx, sy);
    if (!t) return;
    if (g.eng.team[g.localTeam]!.offers[t.i]! < 0) {
      if (!t.obst) R.markTile(t.i);
      return;
    }
    this.flipCard(t.i);
  }

  /** Ask the sim to build the card on tile ti. The card flips at once; the build (or "not
   *  enough gold") comes back from the sim, the same tick offline, a frame or two later online. */
  private flipCard(ti: number): void {
    const g = this.g;
    const tm = g.eng.team[g.localTeam]!;
    const cost = cardCost(tm.offers[ti]!, standingOf(g.eng, g.localTeam));
    g.collector.flipTile(ti);
    if (tm.gold >= cost) g.renderer.flipCard(ti);
    g.renderer.markTile(ti);
    g.sound.play('tap', 0.6);
  }

  private onWheel(ev: WheelEvent): void {
    if (!this.g.canLook()) return;
    ev.preventDefault();
    const R = this.g.renderer;
    if (ev.ctrlKey) {
      // Ctrl + the wheel, or a trackpad pinch (which browsers send as one)
      if (ev.deltaY > 0 && !R.overview) R.setOverview(true);
      else if (ev.deltaY < 0 && R.overview) {
        const rect = (ev.target as HTMLElement).getBoundingClientRect();
        R.setOverview(false, { x: ev.clientX - rect.left, y: ev.clientY - rect.top });
      }
      return;
    }
    R.panBy(-ev.deltaX, -ev.deltaY);
  }

  /** Held arrow / WASD keys glide the camera (screen directions; the red side's view is flipped). */
  keyPan(dt: number): void {
    if (!this.keys.size || !this.g.canLook()) return;
    let x = 0;
    let y = 0;
    for (const k of this.keys) {
      const v = KEYMAP[k];
      if (v) {
        x += v[0];
        y += v[1];
      }
    }
    if (x || y) this.g.renderer.panBy(-x * KEY_PAN * dt, -y * KEY_PAN * dt);
  }

  private onKeyDown(ev: KeyboardEvent): void {
    const g = this.g;
    if (isInput(ev.target)) {
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter') {
        ev.preventDefault();
        $('joinBtn').click();
      }
      return;
    }
    // the pause menu (a solo match): Esc / P toggle it, Enter / Space close it too
    const pauseKey = ev.code === 'Escape' || ev.code === 'KeyP';
    if (g.userPause && (pauseKey || ev.code === 'Enter' || ev.code === 'Space')) {
      ev.preventDefault();
      if (!ev.repeat) $('pResume').click();
      return;
    }
    if (pauseKey && g.canPause()) {
      ev.preventDefault();
      if (!ev.repeat) $('pauseBtn').click();
      return;
    }
    if (KEYMAP[ev.code]) {
      ev.preventDefault();
      g.sound.unlock();
      if (g.canLook()) this.keys.add(ev.code);
    } else if (ev.code === 'Space' && g.state === 'match') {
      ev.preventDefault();
      if (g.canLook() && !ev.repeat) g.renderer.setOverview(!g.renderer.overview);
    } else if ((ev.code === 'Enter' || ev.code === 'Space') && g.state !== 'match') {
      ev.preventDefault();
      if (g.state === 'menu') g.startMatch();
      else if (g.state === 'howto') $('howtoOk').click();
      else if (g.state === 'result') $('againBtn').click();
    }
  }
}
