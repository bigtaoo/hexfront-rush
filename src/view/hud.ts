// The screen HUD: the top bar (troop counts, the wave countdown with the time played quiet beside
// it, the tug bar of tiles held) and the bottom panel (the gold pill, the current quest, the online
// status line). One thing is loud in each bar -- when the next wave comes, and what there is to
// spend; everything else is said quietly, in a darker material (D79). The bar backgrounds and the
// avatars are redrawn on resize; the fills each frame; texts restyle only when they change. Numbers
// (counts, the clock, gold) are picture numbers (digits.ts), words are Texts.

import { Container, Graphics, type Text } from 'pixi.js';
import { T } from '../app/i18n';
import { questOf } from '../sim/economy';
import { TICK_RATE } from '../sim/fixed';
import { enemyOf, siegePct, unitCap, WAVE_TICKS } from '../sim/rules';
import { coin } from './bodies';
import type { Camera } from './camera';
import { Num, snapPx } from './digits';
import type { Frame, Juice } from './frame';
import { fitWidth, label, liveGraphics, setLabel, type LabelOpts, type Pen } from './pen';
import { COL, teamCol, UI, WOOD } from './viewConst';

export interface Status {
  text: string;
  color?: string;
}

/** Where a rail's grain lines sit across its height. Five lines plus a lit face plus six shadow
 *  steps made the rails busier than the board between them: three is enough to read as wood. */
const GRAIN = [0.22, 0.5, 0.8];
/** A picture number's height over the font size of the label it replaced (its outline is part of it). */
const NUM_K = 1.1;
/** A side whose army is at the troop cap: its count and a ring round its avatar in this. */
const CAP_COL = COL.coin;
/** The tug bar is never wider than this (px). */
const TUG_MAX = 600;
/** A frame's width round its slot, px. */
const BEZEL = 3;
/** An army token's radius in a rail of this height. It used to be 0.32 of it flat, which fitted
 *  while the rail was 58 px; in a slimmer one (camera.ts) the token's frame, and the gold cap ring
 *  outside that, climbed off the top of the screen. The second term keeps the whole thing inside. */
const avatarR = (top: number): number => Math.min(top * 0.32, top * 0.42 - 6.5);

/** A raised wooden frame round a slot of x, y, w, h: its drop below, its face, its lit top. */
function bezel(p: Pen, x: number, y: number, w: number, h: number, r: number): void {
  const X = x - BEZEL, Y = y - BEZEL, W = w + 2 * BEZEL, H = h + 2 * BEZEL, R = r + BEZEL;
  p.rrect(X, Y + 2.5, W, H, R, WOOD.rim);
  p.rrect(X, Y, W, H, R, WOOD.face, WOOD.rim, 1.5);
  p.rrect(X + 1.5, Y + 1, W - 3, Math.min(H * 0.4, R * 2), Math.min(R, H * 0.2), WOOD.hi);
}
/** An army token: a team-coloured disc in a wooden ring, with a gloss like the page's chips. */
function token(p: Pen, x: number, y: number, r: number, col: string): void {
  p.circle(x, y + 2.5, r + BEZEL, WOOD.rim);
  p.circle(x, y, r + BEZEL, WOOD.face, WOOD.rim, 1.5);
  p.circle(x, y, r, col, 'rgba(0,0,0,0.35)', 1.5);
  p.circle(x - r * 0.28, y - r * 0.34, r * 0.42, 'rgba(255,255,255,0.26)');
}

export class Hud {
  readonly root = new Container();
  private back = liveGraphics();
  private tug = liveGraphics();
  private tugMask = new Graphics();
  private tugBox = new Container();
  private dyn = liveGraphics();
  private texts = new Map<string, Text>();
  private nums = new Map<string, Num>();
  private W = 0;
  private H = 0;
  private side = 0;
  status: Status | null = null;

  constructor(private juice: Juice) {
    this.tugBox.addChild(this.tug.g);
    this.tugBox.mask = this.tugMask;
    this.root.addChild(this.back.g, this.tugBox, this.tugMask, this.dyn.g);
  }

  /** A text slot by name, created on first use. */
  private text(key: string, s: string, x: number, y: number, o: LabelOpts, show = true): Text {
    let t = this.texts.get(key);
    if (!t) {
      t = label(s, o);
      this.texts.set(key, t);
      this.root.addChild(t);
    }
    t.visible = show;
    if (show) {
      setLabel(t, s, o);
      t.position.set(x, y);
    }
    return t;
  }
  /** A number slot by name: a picture number (digits.ts), sized like a label of the same size. */
  private num(key: string, s: string, x: number, y: number, o: LabelOpts, show = true): Num {
    let n = this.nums.get(key);
    if (!n) {
      n = new Num();
      this.nums.set(key, n);
      this.root.addChild(n);
    }
    n.visible = show;
    if (show) {
      n.set(s, { h: o.size * NUM_K, tint: o.color, align: o.align });
      // on a whole device pixel, so the glyphs land texel for texel (digits.ts)
      n.position.set(snapPx(x), snapPx(y));
    }
    return n;
  }
  private hide(key: string): void {
    const n = this.nums.get(key);
    if (n) n.visible = false;
    const t = this.texts.get(key);
    if (t) t.visible = false;
  }

  private layout(cam: Camera, me: number): void {
    const W = cam.W, H = cam.H, top = cam.hudTop, foe = enemyOf(me);
    this.W = W;
    this.H = H;
    this.side = me;
    const av = avatarR(top);
    const p = this.back.p.clear();
    this.rail(p, 0, top, W, 1);
    this.rail(p, H - cam.hudBot, cam.hudBot, W, -1);
    const { bx, by, bw, bh, la, ra } = this.tugRect(cam);
    token(p, la, top * 0.42, av, teamCol(me));
    token(p, ra, top * 0.42, av, teamCol(foe));
    bezel(p, bx, by, bw, bh, bh / 2);
    p.rrect(bx, by, bw, bh, bh / 2, UI.slot);
    this.tugMask.clear();
    this.tugMask.roundRect(bx, by, bw, bh, bh / 2).fill('#ffffff');
  }
  /** One of the two rails: a raised walnut bar across the screen, lit from above, with a dark rim
   *  along the edge the board is on (`dir` 1 = the board is below it) and its shadow falling on the
   *  board past that rim. Redrawn only on resize. */
  private rail(p: Pen, y: number, h: number, W: number, dir: 1 | -1): void {
    p.rect(0, y, W, h, UI.rail);
    p.rect(0, y + h * 0.74, W, h * 0.26, 'rgba(0,0,0,0.16)');
    for (const g of GRAIN) p.rect(0, y + h * g, W, 1, UI.grain);
    const edge = dir > 0 ? y + h : y;
    p.rect(0, edge - (dir > 0 ? 2.5 : 0), W, 2.5, UI.rim);
    p.rect(0, edge - (dir > 0 ? 4.5 : -2), W, 2, UI.lip);
    // the rail stands over the board, so it throws a shadow on it
    for (let i = 0; i < 3; i++) p.rect(0, edge + (dir > 0 ? i * 2 : -(i + 1) * 2), W, 2, `rgba(22,12,4,${(0.18 - i * 0.055).toFixed(3)})`);
  }
  /** The tug bar, centred and at most TUG_MAX wide (across a monitor it was a metre-long strip the
   *  eye had to travel), and the two army tokens either side of it (la, ra: their centres). */
  private tugRect(cam: Camera) {
    const top = cam.hudTop, pad = 10, av = avatarR(top);
    const bw = Math.min(TUG_MAX, cam.W - 2 * (pad + av * 2 + 10));
    const bx = (cam.W - bw) / 2;
    return { bx, by: top * 0.6, bw, bh: Math.max(8, top * 0.2), la: bx - 10 - av, ra: bx + bw + 10 + av };
  }

  draw(f: Frame): void {
    const eng = f.eng, cam = f.cam, J = this.juice;
    const me = f.local, foe = enemyOf(me);
    if (cam.W !== this.W || cam.H !== this.H || me !== this.side) this.layout(cam, me);
    const W = cam.W, H = cam.H, top = cam.hudTop;
    const av = avatarR(top), cx = W / 2;
    const { bx, by, bw, bh, la, ra } = this.tugRect(cam);
    const fs = Math.max(13, top * 0.26);
    // one pen for everything redrawn each frame, cleared once here (the cap rings, the wave line,
    // the gold pill, the quest sign)
    const p = this.dyn.p.clear();
    const Tme = eng.team[me]!, Tfoe = eng.team[foe]!;
    // an army at the cap trains nothing more, so a barracks bought now is gold thrown away: the
    // count and the ring go gold while a side is full (the rule itself is said once, hints.ts)
    const cap = unitCap(eng.elapsed(), eng.siegeAt);
    const full = (n: number) => n >= cap;
    this.num('me', String(Tme.units), la, top * 0.42, { size: fs * 0.95, color: full(Tme.units) ? CAP_COL : '#fff', weight: 900 });
    this.num('foe', String(Tfoe.units), ra, top * 0.42, { size: fs * 0.95, color: full(Tfoe.units) ? CAP_COL : '#fff', weight: 900 });
    // The next wave is the only clock that decides anything: the match has no time limit (it ends
    // when a castle falls), so the time played used to be the loudest number on the screen for no
    // reason, while the one the player plays to was small grey text beside it. They have swapped.
    const row = top * 0.3;
    const toWave = Math.ceil((WAVE_TICKS - (eng.elapsed() % WAVE_TICKS)) / TICK_RATE);
    const hot = toWave <= 3;
    // the hero size is held inside the bar as well: on a portal's preview panel the bars squeeze
    // (camera.ts BAR_SHARE) and a size with a 13 px floor hung off the top of the screen
    // A progress line under it was tried and taken out again: in a rail this slim it ends where the
    // tug bar begins, and two stacked horizontal bars read as one. The number says how long.
    const heroFs = Math.min(fs * (hot ? 1.5 : 1.35), top * 0.46);
    // the time played, quiet, beside it. It is measured first: the countdown and the clock are
    // centred together, or the pair sits off to one side of a screen whose middle it marks.
    const tPlayed = Math.floor(eng.elapsed() / TICK_RATE);
    const mm = Math.floor(tPlayed / 60), ss = tPlayed % 60;
    const ck = this.num('clock', `${mm}:${String(ss).padStart(2, '0')}`, cx, row, { size: fs * 0.62, color: UI.dim, weight: 800, align: 'right' });
    const wx = cx + (ck.width + 10) / 2;
    const wv = this.text('wave', T('waveIn', { n: toWave }), wx, row, { size: heroFs, color: hot ? COL.coin : UI.cream, weight: 900 });
    fitWidth(wv, Math.min(bw, W - 2 * (av * 2 + 16)) - ck.width - 10);
    const half = Math.max(wv.width, heroFs * 2) / 2;
    ck.position.set(snapPx(wx - half - 10), snapPx(row));
    const siege = eng.siegeLevel();
    const sx = wx + half + 10;
    const sg = this.text('siege', siege ? T('siegeTag', { n: siegePct(eng.elapsed(), eng.siegeAt) - 100 }) : '', sx, row, { size: Math.max(11, fs * 0.66), color: COL.hurt, weight: 800, align: 'left' });
    fitWidth(sg, Math.max(1, ra - av - 6 - sx));
    // the tug bar: tiles held, own side from the left
    const a = Tme.tiles, b = Tfoe.tiles;
    const k = a + b ? a / (a + b) : 0.5;
    const tp = this.tug.p.clear();
    tp.rect(bx, by, bw, bh, teamCol(foe));
    tp.rect(bx, by, bw * k, bh, teamCol(me));
    tp.rect(bx, by, bw, bh * 0.4, 'rgba(255,255,255,0.14)');
    this.num('tugA', String(a), bx + 8, by + bh / 2 + 1, { size: bh * 0.75, color: '#fff', weight: 900, stroke: 'rgba(0,0,0,0.4)', align: 'left' });
    this.num('tugB', String(b), bx + bw - 8, by + bh / 2 + 1, { size: bh * 0.75, color: '#fff', weight: 900, stroke: 'rgba(0,0,0,0.4)', align: 'right' });

    // the gold pill
    const bt = H - cam.hudBot;
    const gy = bt + cam.hudBot / 2;
    // the gold is the one thing the player spends, so it keeps its size while the bar round it
    // shrinks (camera.ts). Held inside the bar: the pill plus its frame may not hang off the
    // bottom of a squeezed one (a portal's preview panel).
    const gfs = Math.max(14, Math.min(cam.hudBot * 0.4, (cam.hudBot / 2 - BEZEL - 1) / 0.75));
    const gold = Tme.gold;
    const gw = gfs * 4.2;
    if (J.lastGold !== null && gold < J.lastGold) J.goldPop = Math.min(J.goldPop, -0.5);
    J.lastGold = gold;
    const gx = W / 2 - gw / 2 + (J.goldShake > 0 ? Math.sin(J.goldShake * 60) * J.goldShake * 22 : 0);
    J.goldAt = { x: W / 2 - gw / 2 + gfs * 0.8, y: gy };
    if (full(Tme.units)) p.circle(la, top * 0.42, av + BEZEL + 2, null, CAP_COL, 2.5);
    if (full(Tfoe.units)) p.circle(ra, top * 0.42, av + BEZEL + 2, null, CAP_COL, 2.5);
    const gh = gfs * 1.5;
    bezel(p, gx, gy - gfs * 0.75, gw, gh, gfs * 0.75);
    p.rrect(gx, gy - gfs * 0.75, gw, gh, gfs * 0.75, UI.slot, (f.ui.goldFlash ?? 0) > 0 ? '#f87171' : null, 3);
    // the slot's inner shadow under its top edge
    p.rrect(gx + 2, gy - gfs * 0.75 + 1, gw - 4, gh * 0.3, gh * 0.15, 'rgba(0,0,0,0.25)');
    const pk = J.goldPop > 0 ? 1 + 0.35 * J.goldPop : J.goldPop < 0 ? 1 + 0.15 * J.goldPop : 1;
    coin(p, gx + gfs * 0.8, gy, gfs * 0.52 * pk);
    const gt = this.num('gold', String(gold), gx + gfs * 1.55, gy + 1, { size: gfs, color: J.goldShake > 0 ? COL.hurt : COL.coin, weight: 900, align: 'left' });
    gt.scale.set(pk);

    // The quest, left of the pill. It wore the same light wooden frame as the gold, so the bar held
    // two equally loud slots for two very unequal things: what you spend and what you may do next.
    // It is dark leather now, the lobby's own corner material (index.html .tok), and keeps the
    // green flash for the moment it is finished.
    const qp = questOf(eng, me);
    const qx = 8, qw = Math.min(W / 2 - gw / 2 - qx - 8 - BEZEL, 240);
    if (qw > 90) {
      // the sign stays inside the bar: its frame's drop hung off the bottom of the screen on every
      // phone held sideways, and by more on a preview panel
      const qfs = Math.min(Math.max(11, Math.min(15, qw / 15)), (cam.hudBot / 2 - 2.5) / 1.9);
      const flash = eng.tick - Tme.questT < TICK_RATE * 1.2;
      p.rrect(qx, gy - qfs * 1.9, qw, qfs * 3.8, 10, flash ? 'rgba(34,140,60,0.92)' : 'rgba(26,14,5,0.62)', 'rgba(243,214,164,0.18)', 1.5);
      const pbw = qw - 20 - qfs * 3.5;
      p.rrect(qx + 10, gy + qfs * 0.35, pbw, qfs * 0.8, qfs * 0.4, 'rgba(18,10,3,0.55)');
      p.rrect(qx + 10, gy + qfs * 0.35, Math.max(qfs * 0.8, (pbw * qp.prog) / qp.q.need), qfs * 0.8, qfs * 0.4, '#35a35c');
      coin(p, qx + qw - qfs * 2.6, gy + qfs * 0.75, qfs * 0.45);
      // a long quest (Russian, on a phone held upright) shrinks to its box instead of running under the gold pill
      fitWidth(this.text('quest', T('quest_' + qp.q.id, { n: qp.q.need }), qx + 10, gy - qfs * 0.75, { size: qfs, color: '#ffffff', weight: 800, align: 'left' }), qw - 16);
      this.num('qprog', `${qp.prog}/${qp.q.need}`, qx + 10 + pbw / 2, gy + qfs * 0.77, { size: Math.max(12, qfs * 0.7), color: '#fff', weight: 800, stroke: 'rgba(0,0,0,0.45)' });
      this.num('qreward', String(qp.q.reward), qx + qw - qfs * 2.0, gy + qfs * 0.78, { size: Math.max(12, qfs * 0.85), color: COL.coin, weight: 900, align: 'left' });
    } else {
      this.hide('quest');
      this.hide('qprog');
      this.hide('qreward');
    }
    // online status, just above the bottom panel on the right
    if (this.status) {
      const sfs = Math.max(11, Math.min(14, W / 40));
      this.text('status', this.status.text, W - 10, bt - sfs * 0.9, { size: sfs, color: this.status.color || UI.dim, weight: 800, stroke: 'rgba(0,0,0,0.5)', align: 'right' });
    } else this.hide('status');
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
