// One troop on screen: its ground shadow, the drawn body (art.ts, mirrored to face its way), a
// white additive copy of the body for the hit flash, the rarity ring of epic and legendary troops
// and the hp bar. The pictures are still, so the life is in the transform, moved like a painted
// wooden piece on a board (art/STYLE.md, "Motion"): it hops and rocks from foot to foot while
// walking, breathes while standing, drops onto the board and settles when trained, lunges into a
// melee blow or rocks back from a shot, squashes when hit and tips over backwards when it dies; the
// drake hovers above its shadow. Used by the field (SpriteLayer) and by the "new troop" card popup.

import { Container, Graphics, Texture, type Sprite } from 'pixi.js';
import { TICK_RATE } from '../sim/fixed';
import { LUNGE_TICKS, type UnitKey } from '../sim/rules';
import { artH, artSprite, castSprite, PPU, setCast, unitAnim, unitFall, unitTex, unitTurn } from './art';
import { hpBar, shadowCtx } from './bodies';
import { CAST, LOOK_B, LOOKB_UNIT_K } from './lookB';
import { liveGraphics, sharedCtx, type Pen } from './pen';
import { RARITY_COLOR, teamCol, teamDark } from './viewConst';

/** lookB: the troop stands on a team-coloured base, a flat disc with a darker rim and a thin top
 *  highlight, so its side reads on any ground (also on its own team's land). */
const baseCtx = (team: number, rx: number) =>
  sharedCtx(`ubase|${team}|${rx.toFixed(3)}`, (p) => {
    p.ellipse(0, 0.105, rx * 1.12, rx * 0.48, 'rgba(30,22,14,0.22)');
    p.ellipse(0, 0.055, rx * 1.02, rx * 0.44, 'rgba(26,18,10,0.4)');
    // the puck's side, then its top: a turned disc of painted wood, not a decal
    p.ellipse(0, 0.05, rx, rx * 0.42, teamDark(team));
    p.ellipse(0, 0, rx, rx * 0.42, teamCol(team), teamDark(team), 0.05);
    p.ellipse(0, -0.012, rx * 0.72, rx * 0.26, null, 'rgba(255,255,255,0.35)', 0.035);
  });

/** What a troop looks like this frame, in view units (positions are relative to its centre). */
export interface UnitLook {
  type: UnitKey;
  team: number;
  /** Size (radius) in view units. */
  s: number;
  face: number;
  lunge: boolean;
  /** 0..0.06 hop height while walking, 0 standing. */
  bob: number;
  /** -1..1 the walk's foot phase (which foot it rocks onto), 0 standing. */
  step?: number;
  /** 0..1 where it is in the walk cycle, -1 standing (sprites.ts walkPhase). */
  phase?: number;
  /** Seconds since it was trained (the drop-in plays in the first SPAWN_S). */
  age?: number;
  /** A shooter: rocks back from its attack instead of lunging in. */
  ranged?: boolean;
  /** Ticks left on its attack cooldown. Only a melee blow sets `lunge`; a shot is read off a
   *  rise in this, which happens on the one tick the shooter looses. */
  cd?: number;
  /** 0..1 white flash after a hit. */
  flash: number;
  /** 0..1 health; the bar shows below 1. */
  hp: number;
  own: boolean;
  id: number;
  rarity: number;
  time: number;
}

/** A filled circle of radius 1, scaled to size. */
export const dotCtx = (color: string) => sharedCtx(`dot|${color}`, (p) => p.circle(0, 0, 1, color));
const ringCtx = (color: string, s: number) =>
  sharedCtx(`rring|${color}|${s.toFixed(3)}`, (p) => p.ellipse(0, 0, s * 1.05, s * 0.4, null, color, 0.05));

/** The ground point under a troop of size s, below its centre. */
export const unitFoot = (s: number): number => s * 0.85;
/** How high the drake flies over its shadow. */
const DRAKE_LIFT = 0.22;
/** Frames in the rendered walk cycle (tools/art3d/pose.py WALK) and in the strike (STRIKE). */
export const WALK_FRAMES = 6;
/** Frames in the rendered strike (tools/art3d/pose.py STRIKE). */
export const STRIKE_FRAMES = 4;
/** Frames in the rendered topple (tools/art3d/pose.py FALL), and the share of DEATH_S they play
 *  over: the piece is down well before it has finished fading out. */
export const FALL_FRAMES = 3, FALL_S = 0.55;
/** The share of the topple the piece spends still on its feet. The first drawn frame is already
 *  a third of the way over, so cutting to it on the frame of death snapped the figure into a
 *  lean; a struck toy stands for an instant, then goes. */
const FALL_HOLD = 0.18;
/** Which topple frame a piece `k` (0..1 of DEATH_S) into its death shows, '' while it still
 *  stands. A fall accelerates, so the three frames are spaced by p squared rather than evenly:
 *  it hangs on the first and goes over through the other two. Shared with the castle guard
 *  (sprites.ts), which topples the same way. */
export function fallTag(k: number): string {
  const p = (Math.min(1, k / FALL_S) - FALL_HOLD) / (1 - FALL_HOLD);
  return p <= 0 ? '' : `_d${Math.min(FALL_FRAMES - 1, Math.floor(p * p * FALL_FRAMES))}`;
}
/** Picture scale over the art's own size (lookB draws troops bigger). */
const PIC_K = LOOK_B ? LOOKB_UNIT_K : 1;
/** The drop-in after training: a fall for the first DROP of it, then a squash and settle. */
const SPAWN_S = 0.42, DROP = 0.55, DROP_H = 0.9;
/** How long a fallen troop takes to tip over and fade. */
export const DEATH_S = 0.5;
/** The blow lasts LUNGE_TICKS in the sim; the view plays it out in seconds so it is smooth at any
 *  frame rate. The sim's flag is on or off, and reading it straight put the piece into the lunge
 *  pose on one frame and yanked it out of it on another — a pop in both directions. */
export const LUNGE_S = LUNGE_TICKS / TICK_RATE;
/** How fast a piece turns round, in `face` per second: a wooden figure pivots on its base, and
 *  the straight mirror flip this replaces popped from one profile to the other on a single frame.
 *  Without turn frames in the atlas it goes edge-on instead, never thinner than TURN_MIN of its
 *  width - which is the sheet-of-paper flip `turnTag` below replaces wherever it can. */
export const TURN_RATE = 11, TURN_MIN = 0.12;
/** `face` at the two views the atlas carries besides the still: the still stands for a whole
 *  face of 1, `_t1` for half way round, `_t0` for head-on, and each is shown while the piece is
 *  nearer it than its neighbours. */
const TURN_SIDE = 0.75, TURN_FRONT = 0.25;
/** Which of them a piece turned this far is drawn as, '' being the still it already has.
 *
 *  A troop is one picture facing right that the board mirrors to face left, so a turn had nothing
 *  in between: squashing it to a sliver and back was the only move left, and it read as a sheet
 *  of paper flipping. The renders now carry two more views of every troop (tools/art3d/pose.py
 *  `swivel`), so the swing is five drawn steps - still, half, head-on, half mirrored, still
 *  mirrored - at full width throughout, and the mirror happens on the head-on view, which is
 *  symmetrical and cannot show it. */
export function turnTag(faceCur: number): string {
  const m = Math.abs(faceCur);
  return m >= TURN_SIDE ? '' : m < TURN_FRONT ? '_t0' : '_t1';
}
/** The blow's shape: out fast over the first third, back over the rest, 0 at both ends. */
export function lungeK(k: number): number {
  return k < 0.3 ? Math.sin((k / 0.3) * (Math.PI / 2)) : Math.cos((((k - 0.3) / 0.7) * Math.PI) / 2);
}

export class UnitView {
  readonly root = new Container();
  private shadow = new Graphics();
  private ring = new Graphics();
  private body: Sprite;
  /** lookB: the shadow the troop throws (null in the shipped look). */
  private cast: Sprite | null = null;
  private flash: Sprite;
  private hp: { g: Graphics; p: Pen } = liveGraphics();
  /** What the textures and the shadow/ring contexts were last built for. Compared field by field:
   *  the joined string this used to be was an allocation per troop per frame. */
  private kType = '';
  private kTeam = -1;
  private kS = -1;
  private kRar = -1;
  /** The hp bar's last reading: hp quantised to 1/1000, -1 while it is full. */
  private hpQ = -1;
  private hpOwn = false;
  private hpS = -1;
  /** The animation frame shown (`_w3`, `_a1`, or '' for the still), and whether this troop has any. */
  private kTag = '';
  private anim = false;
  /** Whether the atlas carries this troop's two turn views as well as its cycles. */
  private turns = false;
  /** Whether it carries the three frames it topples through when killed. */
  private falls = false;
  /** The still this troop falls back to (the strike and walk frames are read off the atlas). */
  private still = Texture.EMPTY;
  /** Picture height, view units. */
  private h = 1;
  seen = 0;
  /** When it fell (frame time, s); null while it lives. */
  deadT: number | null = null;
  /** The way it faced last (a fallen troop tips over away from it). */
  face = 1;
  /** Frame time the blow in progress began (`-1` once none is). */
  private lungeAt = -1;
  /** The way it is turned right now, -1..1, easing toward `face`; and the last frame time seen. */
  private faceCur = 0;
  private lastT = -1;
  /** The attack cooldown last seen, to catch the tick it is reloaded on (`-1` before the first). */
  private prevCd = -1;

  constructor() {
    this.body = artSprite(unitTex('militia', 0));
    this.flash = artSprite(unitTex('militia', 0));
    this.flash.blendMode = 'add';
    this.root.addChild(this.shadow, this.ring, this.body, this.flash, this.hp.g);
    if (LOOK_B) {
      this.cast = castSprite(unitTex('militia', 0));
      this.root.addChildAt(this.cast, 0);
    }
  }

  update(u: UnitLook): void {
    const s = u.s, face = u.face, foot = unitFoot(s);
    this.face = face;
    if (u.type !== this.kType || u.team !== this.kTeam || s !== this.kS || u.rarity !== this.kRar) {
      this.kType = u.type;
      this.kTeam = u.team;
      this.kS = s;
      this.kRar = u.rarity;
      const t = unitTex(u.type, u.team);
      this.still = t;
      this.kTag = '';
      this.anim = unitAnim(u.type, u.team);
      this.turns = this.anim && unitTurn(u.type, u.team);
      this.falls = this.anim && unitFall(u.type, u.team);
      this.body.texture = t;
      this.flash.texture = t;
      if (this.cast) this.cast.texture = t;
      this.h = artH(t) * PIC_K;
      this.shadow.context = LOOK_B ? baseCtx(u.team, Math.max(s * 0.95 * PIC_K, 0.3)) : shadowCtx(Math.max(s * 0.9, 0.22));
      this.shadow.position.set(0, foot);
      this.ring.visible = u.rarity >= 2;
      if (u.rarity >= 2) this.ring.context = ringCtx(RARITY_COLOR[u.rarity] ?? '#ffffff', s);
      this.ring.position.set(0, foot);
    }
    // it pivots on its base to turn round rather than mirroring between frames
    const gap = this.lastT < 0 ? 9 : Math.max(0, u.time - this.lastT);
    const dt = this.lastT < 0 ? 1 : Math.min(0.05, gap);
    this.lastT = u.time;
    // The sim stamps `lungeT` only when a blow lands in melee, so a shooter never played its
    // strike frames - nor the rock back below, which was written for it. The shot is read off
    // the cooldown instead, which only ever rises on the tick the shooter looses. `gap` drops
    // the first frame after it comes back into view, where the cooldown last seen is stale.
    const cd = u.cd ?? 0;
    const shot = !!u.ranged && this.prevCd >= 0 && cd > this.prevCd && gap <= 0.25;
    this.prevCd = cd;
    if (this.faceCur !== face) {
      const d = face - this.faceCur, st = TURN_RATE * dt;
      this.faceCur = Math.abs(d) <= st ? face : this.faceCur + (d > 0 ? st : -st);
    }
    const turn = this.turns ? turnTag(this.faceCur) : '';
    // A carved piece keeps its shape: everything below is a move or a tip about the foot it stands
    // on, never a change of size. The squash and stretch this used to ride on (and the matching
    // `2 - sy` width) is what made a solid, fully drawn picture read as a sheet of paper being
    // crumpled: the whole figure, head included, widened exactly as much as it shortened.
    // A still breath is a sway of under a degree, not a pulse.
    let lift = u.bob, rot = Math.sin(u.time * 0.9 + u.id * 1.7) * 0.014, bx = 0, alpha = 1;
    if (u.type === 'drake') {
      lift = DRAKE_LIFT + Math.sin(u.time * 5 + u.id) * 0.05;
      rot = Math.sin(u.time * 2.3 + u.id) * 0.05;
    } else {
      // it has no knees: it rocks onto the foot it lands on and leans the way it is going. Both
      // terms are added to the sway rather than replacing it, and both vanish with the stride, so
      // nothing jumps on the frame a foot lands (bob is 0 there and a branch would snap the lean).
      // with rendered frames the legs do the walking: the rock would be the picture swaying on
      // top of a figure that is already striding, which is the tell this replaces.
      const st = this.anim ? 0 : (u.step ?? 0);
      rot += st * 0.13 + face * 0.045 * Math.abs(st);
    }
    if ((u.lunge || shot) && this.lungeAt < 0) this.lungeAt = u.time;
    if (this.lungeAt >= 0) {
      const el = u.time - this.lungeAt;
      if (el >= LUNGE_S && !u.lunge) this.lungeAt = -1;
      else {
        const lk = lungeK(Math.min(1, Math.max(0, el / LUNGE_S)));
        // the shot's kick is back on its heels; the melee blow goes in
        bx += (u.ranged ? -face * 0.05 : face * 0.12) * lk;
        rot += (u.ranged ? -face * 0.1 : face * 0.16) * lk;
      }
    }
    // a blow knocks it back on its foot; the white flash carries the hit, the shape does not
    if (u.flash > 0) {
      bx -= face * 0.07 * u.flash;
      rot -= face * 0.13 * u.flash;
    }
    if (this.anim) {
      const tag = this.frameTag(u, turn);
      if (tag !== this.kTag) {        // only on a change: a texture swap breaks the draw batch
        this.kTag = tag;
        const t = unitTex(u.type, u.team, tag);
        this.body.texture = t;
        this.flash.texture = t;
        if (this.cast) this.cast.texture = t;
      }
    }
    const age = u.age ?? SPAWN_S;
    if (age < SPAWN_S) {
      const k = Math.max(0, age) / SPAWN_S;
      if (k < DROP) {
        const d = k / DROP;
        lift += DROP_H * (1 - d * d);
        alpha = Math.min(1, d * 3);
      } else {
        // it lands, sets into the board for a moment and rocks itself still
        const w = Math.sin((Math.PI * (k - DROP)) / (1 - DROP));
        lift -= 0.045 * w;
        rot += face * 0.2 * w;
      }
    }
    // Written out rather than looped over [this.body, this.flash]: that array was an allocation
    // per troop per frame, on the view's hottest line.
    // with turn frames the rotation is drawn, so the piece keeps its full width the whole way
    // round and only its sign flips, on the symmetrical head-on frame where nothing shows it
    const fx = this.turns
      ? (this.faceCur < 0 ? -1 : 1)
      : Math.abs(this.faceCur) < TURN_MIN
        ? face > 0
          ? TURN_MIN
          : -TURN_MIN
        : this.faceCur;
    const kx = (fx * PIC_K) / PPU, ky = PIC_K / PPU, by = foot - lift;
    this.body.position.set(bx, by);
    this.body.scale.set(kx, ky);
    this.body.rotation = rot;
    this.flash.position.set(bx, by);
    this.flash.scale.set(kx, ky);
    this.flash.rotation = rot;
    this.body.alpha = alpha;
    this.shadow.alpha = alpha;
    if (this.cast) {
      // on the ground under the feet, even under a hovering drake. It draws in as the piece comes
      // off the board and leans with it: a shadow that never reacted to the hop was half of why
      // nothing looked like it had left the ground.
      const cs = 1 / (1 + lift * 0.9);
      this.cast.position.set(bx * 0.6, foot);
      setCast(this.cast, kx * cs, ky * cs);
      this.cast.alpha = CAST.alpha * alpha * cs;
    }
    this.flash.visible = u.flash > 0;
    if (u.flash > 0) this.flash.alpha = 0.85 * u.flash;
    // the bar rides over the picture's top (drawn at 0, moved, so a hovering drake does not redraw it)
    this.hp.g.position.set(0, foot - lift - this.h - 0.1);
    const hq = u.hp < 1 ? Math.round(u.hp * 1000) : -1;
    if (hq !== this.hpQ || u.own !== this.hpOwn || s !== this.hpS) {
      this.hpQ = hq;
      this.hpOwn = u.own;
      this.hpS = s;
      const p = this.hp.p.clear();
      if (u.hp < 1) hpBar(p, 0, 0, Math.max(0.5, s * 1.8), Math.max(0, u.hp), u.own);
    }
  }

  /** Which rendered frame this troop shows: the strike while a blow is in progress, else the walk
   *  cycle, else '' for the still it stands in. */
  /** The turn comes first: it lasts under a fifth of a second, and a piece drawn at its full
   *  width in a profile it has turned out of is the pop this frame exists to remove. */
  private frameTag(u: UnitLook, turn: string): string {
    if (turn) return turn;
    if (this.lungeAt >= 0) {
      const k = (u.time - this.lungeAt) / LUNGE_S;
      if (k < 1) return `_a${Math.min(STRIKE_FRAMES - 1, Math.floor(k * STRIKE_FRAMES))}`;
    }
    const ph = u.phase ?? -1;
    return ph < 0 ? '' : `_w${Math.min(WALK_FRAMES - 1, Math.floor(ph * WALK_FRAMES))}`;
  }

  /** The troop has fallen: `k` 0..1 over DEATH_S. It goes over backwards on its heels, as a
   *  knocked piece does, and fades; its base and shadow go with it.
   *
   *  With the topple rendered (`_d0.._d2`) the model itself is what turns, so the piece
   *  foreshortens as it goes down, its soles come round towards us and its face ends up at the
   *  sky. Spinning the standing picture in its own plane - what this did, and all it could do
   *  with one drawn view - kept the figure standing while the photograph of it rotated, which is
   *  the sheet of paper again. That is still the fallback for a troop with no frames in the
   *  atlas (?only3's stand-ins). */
  dieFrame(k: number, face: number): void {
    const e = 1 - (1 - k) * (1 - k);
    const fade = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
    this.flash.visible = false;
    this.hp.g.visible = false;
    if (this.falls) {
      const tag = fallTag(k);
      if (tag !== this.kTag) {
        this.kTag = tag;
        const t = unitTex(this.kType as UnitKey, this.kTeam, tag);
        this.body.texture = t;
        if (this.cast) this.cast.texture = t;
      }
      // the drawn frames carry the tip, so the sprite is left upright and at its full width:
      // all that is left for the transform is which way it faces
      this.body.rotation = 0;
      this.body.scale.x = ((face < 0 ? -1 : 1) * PIC_K) / PPU;
    } else {
      if (this.kTag) {                // it falls as the carved piece it is, not mid-stride
        this.kTag = '';
        this.body.texture = this.still;
        if (this.cast) this.cast.texture = this.still;
      }
      this.body.rotation = -face * 1.35 * e;
    }
    this.body.alpha = fade;
    this.shadow.alpha = fade;
    if (this.cast) this.cast.alpha = CAST.alpha * fade * (1 - e);
    this.ring.visible = false;
  }

  /** Picture height of the troop shown, view units. */
  get height(): number {
    return this.h;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
