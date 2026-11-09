// The renderer: one Pixi stage over the sim, read-only. The sim is integer fixed point stepped at
// 30 Hz; the view runs at display rate and draws every mobile entity at lerp(last tick, this
// tick, alpha). Effects, floaters, damage numbers and coins live here (fed by sim events) and use
// Math.random freely: none of it can reach the sim. The map is drawn from the local team's side
// (the red side sees it flipped top to bottom, sprites upright).
//
// The world container carries the camera (zoom and offset, plus the screen shake); under it the
// layers go ground, offer cards, tap marker, y-sorted sprites, projectiles and effects. Over it,
// in screen pixels: the edge markers and the overview button, the HUD and the overlays.

import { Container, type Application } from 'pixi.js';
import { T } from '../app/i18n';
import type { Engine } from '../sim/engine';
import { FP } from '../sim/fixed';
import type { Tile } from '../sim/map';
import { TEAM_BLUE } from '../sim/rules';
import type { SimEvent } from '../sim/types';
import { Camera } from './camera';
import { EffectLayer } from './effects';
import { Juice, type DrawUi, type Frame, type Vis } from './frame';
import { GROUND, GroundLayer } from './ground';
import { EdgeLayer } from './edges';
import { Hud, type Status } from './hud';
import { OfferLayer } from './offers';
import { Overlays, type BannerOpts, type CardPop } from './overlays';
import { SpriteLayer } from './sprites';
import type { Pt } from './viewConst';

export class Renderer {
  readonly cam = new Camera();
  readonly juice = new Juice();
  private world = new Container();
  private ground = new GroundLayer();
  private offers = new OfferLayer();
  private effects = new EffectLayer();
  private sprites = new SpriteLayer();
  private edges = new EdgeLayer();
  private hud = new Hud(this.juice);
  private overlays = new Overlays(this.juice);
  private eng: Engine | null = null;
  private local = TEAM_BLUE;
  private time = 0;

  constructor(private readonly app: Application) {
    this.world.addChild(this.ground.root, this.offers.root, this.effects.under, this.sprites.root, this.effects.root);
    app.stage.addChild(this.world, this.edges.root, this.hud.root, this.overlays.root);
    this.resize();
  }

  // ---------- what main and the input code read and set ----------
  get fitAll(): boolean {
    return this.cam.fitAll;
  }
  get status(): Status | null {
    return this.hud.status;
  }
  set status(s: Status | null) {
    this.hud.status = s;
  }
  get card(): CardPop | null {
    return this.overlays.card;
  }
  set card(c: CardPop | null) {
    this.overlays.card = c;
  }
  get hint(): string | null {
    return this.overlays.hint;
  }
  set hint(h: string | null) {
    this.overlays.hint = h;
  }
  get guide(): Tile | null {
    return this.overlays.guide;
  }
  set guide(t: Tile | null) {
    this.overlays.guide = t;
  }

  /** Point the view at an engine, seen from `local`'s side. */
  setView(eng: Engine, local: number): void {
    this.eng = eng;
    this.local = local || TEAM_BLUE;
    this.cam.setView(eng, this.local);
    this.app.renderer.background.color = GROUND[eng.themeKey].bg;
    this.ground.build(eng, this.cam);
    this.sprites.build(eng, this.cam);
    this.offers.reset();
    this.effects.reset();
    this.edges.reset();
  }
  /** Clears per-match juice. */
  reset(): void {
    this.overlays.reset();
    this.effects.reset();
    this.offers.reset();
    this.juice.reset();
    this.hud.status = null;
    this.edges.reset();
    this.cam.cam = null;
    this.cam.camGoal = null;
    this.cam.overview = false;
    this.cam.zoomK = 0;
  }
  resize(): void {
    this.cam.resize(this.app.screen.width, this.app.screen.height);
  }

  // ---------- camera ----------
  view(x: number, y: number): Pt {
    return this.cam.view(x, y);
  }
  panBy(dx: number, dy: number): void {
    this.cam.panBy(dx, dy);
  }
  lookAt(vx: number, vy: number): void {
    this.cam.lookAt(vx, vy);
  }
  screenToWorld(sx: number, sy: number): Pt {
    return this.cam.screenToWorld(sx, sy);
  }
  get overview(): boolean {
    return this.cam.overview;
  }
  /** Zoom out to the whole map, or back in (centred on `at`, a screen point, when given). */
  setOverview(on: boolean, at?: Pt): void {
    const v = at ? { x: (at.x - this.cam.ox) / this.cam.scale, y: (at.y - this.cam.oy) / this.cam.scale } : undefined;
    this.cam.setOverview(on, v);
  }
  /** A tap on the overview button or an edge marker: handled (true) or not on one (false). */
  edgeTap(sx: number, sy: number): boolean {
    const h = this.edges.hit(sx, sy);
    if (!h) return false;
    if (h === 'overview') this.cam.setOverview(!this.cam.overview);
    else this.cam.lookAt(h.x, h.y);
    return true;
  }

  // ---------- juice ----------
  banner(text: string, opts?: BannerOpts): void {
    this.overlays.banner(text, opts);
  }
  /** The local player tapped this card: flip it now, before the sim confirms. */
  flipCard(ti: number): void {
    this.offers.flips.set(ti, 0);
  }
  markTile(ti: number): void {
    const v = this.cam.tv[ti];
    if (v) this.effects.markAt(v.x, v.y);
  }
  /** `n` coins fly from a view point to the gold pill. */
  coinFly(x: number, y: number, n: number): void {
    const p = this.cam.worldToScreen(x, y);
    this.overlays.coinFly(p.x, p.y, n);
  }
  needGold(x: number, y: number): void {
    const p = this.cam.view(x, y);
    this.effects.floater(p.x, p.y - 0.6, T('needGold'), '#fca5a5');
    this.juice.goldShake = 0.4;
  }

  /** Visual reaction to one sim event (sound and UI flow stay in the app). */
  onEvent(e: SimEvent): void {
    if (this.eng) this.edges.onEvent(e, this.eng, this.cam, this.local);
    const mine = e.team === this.local;
    const p = e.x !== undefined && e.y !== undefined ? this.cam.view(e.x, e.y) : null;
    const fx = this.effects;
    switch (e.type) {
      case 'burst':
        if (p) fx.burst(p.x, p.y, e.color ?? '#ffffff', e.n ?? 8);
        break;
      case 'ring':
        if (p) fx.ring(p.x, p.y, (e.r ?? 0) / FP, e.kind === 'fire' ? '#fb923c' : '#a5b4fc');
        break;
      case 'dmg':
        if (p) this.overlays.damageNumber(e.id ?? 0, p.x, p.y, e.amount ?? 0, mine ? '#fca5a5' : '#ffffff');
        break;
      case 'income':
        if (mine && p) {
          fx.floater(p.x, p.y - 0.9, '+' + e.amount, '#fde047');
          this.coinFly(p.x, p.y, 1);
        }
        break;
      case 'mapEvent':
        if (!p) break;
        if (!mine) fx.floater(p.x, p.y - 0.6, T('ev_taken'), '#fca5a5');
        else if (e.gold) {
          fx.floater(p.x, p.y - 0.6, T('ev_gold', { g: e.gold }), '#fde047');
          this.coinFly(p.x, p.y, e.gold >= 100 ? 9 : 5);
        }
        break;
      case 'quest':
        if (mine && p) this.coinFly(p.x, p.y, 6);
        break;
      case 'mysteryNothing':
        if (mine && p) fx.floater(p.x, p.y - 0.6, T('nothing'), '#e5e7eb');
        break;
      case 'bldDown':
        this.juice.shake += mine ? 0.75 : 0.55;
        break;
      case 'guardDown':
        if (p) fx.floater(p.x, p.y - 0.8, T(mine ? 'guardDown' : 'guardBeaten'), mine ? '#fca5a5' : '#fde047');
        break;
      case 'guardBack':
        if (mine && p) fx.floater(p.x, p.y - 0.8, T('guardBack'), '#bbf7d0');
        break;
    }
  }

  // ---------- frame ----------
  /** alpha: 0..1 between the last two ticks; dt: real seconds (0 while paused); ui.demo: the
   *  menu's AI match, shown whole. */
  draw(eng: Engine, alpha: number, dt: number, ui: DrawUi = {}): void {
    if (eng !== this.eng) this.setView(eng, this.local);
    const cam = this.cam, J = this.juice;
    if (cam.W !== this.app.screen.width || cam.H !== this.app.screen.height) this.resize();
    this.time += dt;
    cam.update(eng, dt, !!ui.demo);
    let sx = 0, sy = 0;
    if (J.shake > 0) {
      J.shake = Math.min(1, J.shake);
      const k = J.shake * J.shake * 14;
      sx = Math.sin(this.time * 61) * k;
      sy = Math.cos(this.time * 53) * k;
      J.shake = Math.max(0, J.shake - dt * 1.6);
    }
    const s = cam.scale;
    const ex = cam.ox + sx, ey = cam.oy + sy;
    this.world.scale.set(s);
    this.world.position.set(ex, ey);
    // what is on screen, in view units, with margins for tall sprites (anchored at their foot)
    const vis: Vis = { x0: -ex / s - 1.3, x1: (cam.W - ex) / s + 1.3, y0: -ey / s - 1.0, y1: (cam.H - ey) / s + 1.9 };
    const f: Frame = { eng, alpha, dt, time: this.time, ui, cam, vis, local: this.local };
    this.ground.update(eng);
    this.offers.draw(f);
    this.sprites.draw(f);
    this.effects.draw(f);
    this.edges.draw(f, ui.look ?? false);
    this.hud.draw(f);
    this.overlays.draw(f);
  }

  destroy(): void {
    this.overlays.destroy();
    this.hud.destroy();
    this.edges.destroy();
    this.effects.destroy();
    this.sprites.destroy();
    this.ground.destroy();
    this.world.destroy({ children: true });
  }
}
