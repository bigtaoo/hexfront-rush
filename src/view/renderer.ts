// The renderer: one Pixi stage over the sim, read-only. The sim is integer fixed point stepped at
// 30 Hz; the view runs at display rate and draws every mobile entity at lerp(last tick, this
// tick, alpha). Effects, floaters, damage numbers and coins live here (fed by sim events) and use
// Math.random freely: none of it can reach the sim. The map is drawn from the local team's side
// (the red side sees it flipped top to bottom, sprites upright).
//
// The world container carries the camera (zoom and offset, plus the screen shake); under it the
// layers go ground, its litter (decor.ts), offer cards, tap marker, y-sorted sprites, projectiles
// and effects. Over it,
// in screen pixels: the overview button, the HUD and the overlays.

import { Container, type Application } from 'pixi.js';
import { T } from '../app/i18n';
import type { Engine } from '../sim/engine';
import { FP } from '../sim/fixed';
import type { Tile } from '../sim/map';
import { TEAM_BLUE } from '../sim/rules';
import type { BurstKind, SimEvent } from '../sim/types';
import { Camera } from './camera';
import { EffectLayer } from './effects';
import { Juice, type DrawUi, type Frame, type Vis } from './frame';
import { DecorLayer } from './decor';
import { groundBg, GroundLayer } from './ground';
import { OverviewBtn } from './overview';
import { Hud, type Status } from './hud';
import { LightLayer } from './light';
import { LOOK_B } from './lookB';
import { OfferLayer } from './offers';
import { Overlays, type BannerOpts, type CardPop } from './overlays';
import { setDigitDensity } from './digits';
import { SpriteLayer } from './sprites';
import { TableLayer } from './table';
import { COL, teamLight, teamSpark, type Pt } from './viewConst';

/** What a burst of particles looks like, by what threw it. The sim names only the occasion
 *  (types.ts BurstKind) and the colour is picked here: a guard's white armour, a unit's spark in
 *  its side's colour, a building's grey dust, gold, and a claimed tile in its new owner's colour. */
const BURST_COL: Record<BurstKind, (team: number) => string> = {
  guard: () => '#ffffff',
  unit: teamSpark,
  rubble: () => '#a8a29e',
  gold: () => COL.coin,
  claim: teamLight,
};

/** How much gold one flying coin stands for, and the most a single payout ever sends. Seven mines
 *  used to send a coin each; the stream now carries the weight of the whole tick instead. */
const COIN_PER = 25, COIN_MAX = 8;

export class Renderer {
  readonly cam = new Camera();
  readonly juice = new Juice();
  private world = new Container();
  private table = LOOK_B ? new TableLayer() : null;
  private ground = new GroundLayer();
  private decor = new DecorLayer();
  private offers = new OfferLayer();
  private effects = new EffectLayer();
  private sprites = new SpriteLayer();
  private ovBtn = new OverviewBtn();
  private hud = new Hud(this.juice);
  private light = LOOK_B ? new LightLayer() : null;
  private overlays = new Overlays(this.juice);
  /** Set by the app: a troop of `team` just reached the board. The sim says a troop exists the
   *  instant it is trained, but the view keeps it in the air for BIRTH_TOTAL, so the cue belongs
   *  here and not on the event. */
  onLand: ((team: number) => void) | null = null;
  private eng: Engine | null = null;
  private local = TEAM_BLUE;
  private time = 0;

  constructor(private readonly app: Application) {
    if (this.table) this.world.addChild(this.table.root);
    this.world.addChild(this.ground.root, this.decor.root, this.offers.root, this.effects.under, this.sprites.birth.under, this.sprites.root, this.offers.tags, this.sprites.birth.root, this.effects.root);
    // a troop landing out of its birth light spends the same ring and sparks as any other impact
    this.sprites.birth.land = (x, y, team) => {
      this.effects.ring(x, y, 0.35, teamLight(team));
      this.effects.burst(x, y, COL.coin, 6);
      this.onLand?.(team);
    };
    app.stage.addChild(this.world, this.ovBtn.root, this.hud.root, this.overlays.root);
    if (this.light) {
      // the sand's grain lies on the ground, over it and under everything that stands on it
      this.world.addChildAt(this.light.grain, this.world.getChildIndex(this.ground.root) + 1);
      app.stage.addChildAt(this.light.screen, 1);
    }
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
    this.app.renderer.background.color = groundBg(eng.themeKey, eng.config.seed);
    this.ground.build(eng, this.cam);
    this.decor.build(eng, this.cam);
    this.table?.build(this.cam.tv);
    this.sprites.build(eng, this.cam);
    this.offers.reset();
    this.effects.reset();
  }
  /** Clears per-match juice. The camera is not juice, so it is left alone: a new match goes
   *  through `setView`, which resets the zoom and the scale together, and the online catch-up jump
   *  (game.ts) keeps the player looking where they were. Clearing `overview` and `zoomK` here left
   *  the drawn scale at the overview's - the glide in `Camera.update` only runs while `zoomK` is
   *  away from its goal, and this put both at 0 - so one lag spike stranded an online match zoomed
   *  out for good, with no panning. */
  reset(): void {
    this.income = null;
    this.overlays.reset();
    this.effects.reset();
    this.offers.reset();
    this.juice.reset();
    this.hud.status = null;
  }
  resize(): void {
    this.cam.resize(this.app.screen.width, this.app.screen.height);
    this.light?.resize(this.cam.W, 0, this.cam.H);
  }

  // ---------- camera ----------
  view(x: number, y: number): Pt {
    return this.cam.view(x, y);
  }
  panBy(dx: number, dy: number): void {
    this.cam.panBy(dx, dy);
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
  /** A tap on the overview button: handled (true) or not on it (false). */
  overviewTap(sx: number, sy: number): boolean {
    if (!this.ovBtn.hit(sx, sy)) return false;
    this.cam.setOverview(!this.cam.overview);
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
  /** The income of one tick, pooled by `onEvent` and spent in `draw`: the total, and the mine that
   *  paid most of it, which is where it is said from. 矿脉涌动 is called out when any mine was
   *  surging, at the steepest rate of them -- the outlet has to be visible to be used. */
  private income: { x: number; y: number; best: number; total: number; surge: number } | null = null;
  private flushIncome(): void {
    const k = this.income;
    if (!k) return;
    this.income = null;
    const fx = this.effects;
    fx.floater(k.x, k.y - 0.9, k.surge > 0 ? `+${k.total} +${k.surge}%` : '+' + k.total, k.surge > 0 ? COL.surge : COL.coin);
    // one stream, its weight told by how many coins are in it rather than by how many mines paid
    this.coinFly(k.x, k.y, Math.max(1, Math.min(COIN_MAX, Math.round(k.total / COIN_PER))));
  }
  needGold(x: number, y: number): void {
    const p = this.cam.view(x, y);
    this.effects.floater(p.x, p.y - 0.6, T('needGold'), COL.hurt);
    this.juice.goldShake = 0.4;
  }

  /** Visual reaction to one sim event (sound and UI flow stay in the app). */
  onEvent(e: SimEvent): void {
    const mine = e.team === this.local;
    const p = e.x !== undefined && e.y !== undefined ? this.cam.view(e.x, e.y) : null;
    const fx = this.effects;
    switch (e.type) {
      case 'burst':
        if (p) fx.burst(p.x, p.y, BURST_COL[e.burst ?? 'guard'](e.team ?? TEAM_BLUE), e.n ?? 8);
        break;
      case 'ring':
        if (p) fx.ring(p.x, p.y, (e.r ?? 0) / FP, e.kind === 'fire' ? '#fb923c' : '#a5b4fc');
        break;
      case 'dmg':
        if (p) this.overlays.damageNumber(e.id ?? 0, p.x, p.y, e.amount ?? 0, mine ? COL.hurt : '#ffffff');
        break;
      case 'income':
        // One event per mine, all on the same tick: a board with seven mines threw seven green
        // numbers and seven streams of coins at once, every one of them saying what the gold pill
        // was already saying, and the player had to add them up to learn the one thing that
        // mattered. They are pooled here and said once in `flushIncome`.
        if (mine && p) {
          const amt = e.amount ?? 0;
          const k = this.income;
          if (!k) this.income = { x: p.x, y: p.y, best: amt, total: amt, surge: e.surge ?? 0 };
          else {
            k.total += amt;
            k.surge = Math.max(k.surge, e.surge ?? 0);
            if (amt > k.best) {
              k.best = amt;
              k.x = p.x;
              k.y = p.y;
            }
          }
        }
        break;
      case 'mapEvent':
        if (!p) break;
        if (!mine) fx.floater(p.x, p.y - 0.6, T('ev_taken'), COL.hurt);
        else if (e.gold) {
          fx.floater(p.x, p.y - 0.6, T('ev_gold', { g: e.gold }), COL.coin);
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
        if (p) fx.floater(p.x, p.y - 0.8, T(mine ? 'guardDown' : 'guardBeaten'), mine ? COL.hurt : COL.coin);
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
    setDigitDensity(this.app.renderer.resolution);
    const f: Frame = { eng, alpha, dt, time: this.time, ui, cam, vis, local: this.local };
    this.flushIncome();
    this.ground.update(eng);
    this.decor.update(eng);
    this.offers.draw(f);
    this.sprites.draw(f);
    this.effects.draw(f);
    this.ovBtn.draw(f, ui.look ?? false);
    // Behind the menu the match is a backdrop: no bars, no hand (the menu has its own buttons).
    // A panel over a match is the same backdrop: the result card used to come up with the clock,
    // "wave in 15s", the gold pill and the quest box still lit around it.
    const covered = !!ui.covered;
    this.hud.root.visible = !ui.demo && !covered;
    this.ovBtn.root.visible = !covered;
    if (this.hud.root.visible) this.hud.draw(f);
    this.overlays.draw(f);
  }

  destroy(): void {
    this.overlays.destroy();
    this.hud.destroy();
    this.ovBtn.destroy();
    this.effects.destroy();
    this.sprites.destroy();
    this.ground.destroy();
    this.decor.destroy();
    this.table?.destroy();
    this.world.destroy({ children: true });
  }
}
