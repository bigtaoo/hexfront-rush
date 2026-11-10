// The screen HUD: the top bar (troop counts, the clock, the tug bar of tiles held) and the bottom
// panel (the gold pill, the current quest, the online status line). The bar backgrounds and the
// avatars are redrawn on resize; the fills each frame; texts restyle only when they change. Numbers
// (counts, the clock, gold) are picture numbers (digits.ts), words are Texts.

import { Container, Graphics, type Text } from 'pixi.js';
import { T } from '../app/i18n';
import { questOf } from '../sim/economy';
import { TICK_RATE } from '../sim/fixed';
import { enemyOf, siegePct, WAVE_TICKS } from '../sim/rules';
import { coin } from './bodies';
import type { Camera } from './camera';
import { Num } from './digits';
import type { Frame, Juice } from './frame';
import { label, liveGraphics, setLabel, type LabelOpts } from './pen';
import { teamCol } from './viewConst';

export interface Status {
  text: string;
  color?: string;
}

const PANEL = 'rgba(15,23,42,0.72)';
/** A picture number's height over the font size of the label it replaced (its outline is part of it). */
const NUM_K = 1.1;

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
      n.position.set(x, y);
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
    const pad = 10, av = top * 0.32;
    const p = this.back.p.clear();
    p.rect(0, 0, W, top, PANEL);
    p.rect(0, H - cam.hudBot, W, cam.hudBot, PANEL);
    p.circle(pad + av, top * 0.42, av, teamCol(me), '#ffffff', 2);
    p.circle(W - pad - av, top * 0.42, av, teamCol(foe), '#ffffff', 2);
    const { bx, by, bw, bh } = this.tugRect(cam);
    p.rrect(bx, by, bw, bh, bh / 2, null, '#ffffff', 2);
    this.tugMask.clear();
    this.tugMask.roundRect(bx, by, bw, bh, bh / 2).fill('#ffffff');
  }
  private tugRect(cam: Camera) {
    const top = cam.hudTop, pad = 10, av = top * 0.32;
    const bx = pad + av * 2 + 10;
    return { bx, by: top * 0.6, bw: cam.W - 2 * bx, bh: Math.max(14, top * 0.24) };
  }

  draw(f: Frame): void {
    const eng = f.eng, cam = f.cam, J = this.juice;
    const me = f.local, foe = enemyOf(me);
    if (cam.W !== this.W || cam.H !== this.H || me !== this.side) this.layout(cam, me);
    const W = cam.W, H = cam.H, top = cam.hudTop;
    const pad = 10, av = top * 0.32, cx = W / 2;
    const fs = Math.max(13, top * 0.26);
    const Tme = eng.team[me]!, Tfoe = eng.team[foe]!;
    this.num('me', String(Tme.units), pad + av, top * 0.42, { size: fs * 0.95, color: '#fff', weight: 900 });
    this.num('foe', String(Tfoe.units), W - pad - av, top * 0.42, { size: fs * 0.95, color: '#fff', weight: 900 });
    // the clock: time played (no limit, the match ends when a castle falls)
    const tPlayed = Math.floor(eng.elapsed() / TICK_RATE);
    const mm = Math.floor(tPlayed / 60), ss = tPlayed % 60;
    this.num('clock', `${mm}:${String(ss).padStart(2, '0')}`, cx, top * 0.3, { size: fs * 1.15, color: '#ffffff', weight: 900 });
    // beside it: the seconds to the next wave (bigger and yellow in its last 3), and the siege once it is on
    const toWave = Math.ceil((WAVE_TICKS - (eng.elapsed() % WAVE_TICKS)) / TICK_RATE);
    this.text('wave', T('waveIn', { n: toWave }), cx + fs * 2.4, top * 0.3, { size: fs * (toWave <= 3 ? 0.78 : 0.7), color: toWave <= 3 ? '#fde047' : '#e2e8f0', weight: 800, align: 'left' });
    const siege = eng.siegeLevel();
    this.text('siege', siege ? T('siegeTag', { n: siegePct(eng.elapsed(), eng.siegeAt) - 100 }) : '', cx - fs * 2.4, top * 0.3, { size: fs * 0.7, color: '#fca5a5', weight: 800, align: 'right' });
    // the tug bar: tiles held, own side from the left
    const { bx, by, bw, bh } = this.tugRect(cam);
    const a = Tme.tiles, b = Tfoe.tiles;
    const k = a + b ? a / (a + b) : 0.5;
    const tp = this.tug.p.clear();
    tp.rect(bx, by, bw, bh, teamCol(foe));
    tp.rect(bx, by, bw * k, bh, teamCol(me));
    tp.rect(bx, by, bw, bh * 0.4, 'rgba(255,255,255,0.25)');
    this.num('tugA', String(a), bx + 8, by + bh / 2 + 1, { size: bh * 0.75, color: '#fff', weight: 900, stroke: 'rgba(0,0,0,0.4)', align: 'left' });
    this.num('tugB', String(b), bx + bw - 8, by + bh / 2 + 1, { size: bh * 0.75, color: '#fff', weight: 900, stroke: 'rgba(0,0,0,0.4)', align: 'right' });

    // the gold pill
    const bt = H - cam.hudBot;
    const gy = bt + cam.hudBot / 2;
    const gfs = Math.max(18, cam.hudBot * 0.34);
    const gold = Tme.gold;
    const gw = gfs * 4.2;
    if (J.lastGold !== null && gold < J.lastGold) J.goldPop = Math.min(J.goldPop, -0.5);
    J.lastGold = gold;
    const gx = W / 2 - gw / 2 + (J.goldShake > 0 ? Math.sin(J.goldShake * 60) * J.goldShake * 22 : 0);
    J.goldAt = { x: W / 2 - gw / 2 + gfs * 0.8, y: gy };
    const p = this.dyn.p.clear();
    p.rrect(gx, gy - gfs * 0.75, gw, gfs * 1.5, gfs * 0.75, 'rgba(0,0,0,0.45)', (f.ui.goldFlash ?? 0) > 0 ? '#f87171' : null, 3);
    const pk = J.goldPop > 0 ? 1 + 0.35 * J.goldPop : J.goldPop < 0 ? 1 + 0.15 * J.goldPop : 1;
    coin(p, gx + gfs * 0.8, gy, gfs * 0.52 * pk);
    const gt = this.num('gold', String(gold), gx + gfs * 1.55, gy + 1, { size: gfs, color: J.goldShake > 0 ? '#fca5a5' : '#fde047', weight: 900, align: 'left' });
    gt.scale.set(pk);

    // the quest (left of the pill)
    const qp = questOf(eng, me);
    const qx = 8, qw = Math.min(W / 2 - gw / 2 - 16, 240);
    if (qp && qw > 90) {
      const qfs = Math.max(11, Math.min(15, qw / 15));
      const flash = eng.tick - Tme.questT < TICK_RATE * 1.2;
      p.rrect(qx, gy - qfs * 1.9, qw, qfs * 3.8, 10, flash ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.12)');
      const pbw = qw - 20 - qfs * 3.5;
      p.rrect(qx + 10, gy + qfs * 0.35, pbw, qfs * 0.8, qfs * 0.4, 'rgba(0,0,0,0.4)');
      p.rrect(qx + 10, gy + qfs * 0.35, Math.max(qfs * 0.8, (pbw * qp.prog) / qp.q.need), qfs * 0.8, qfs * 0.4, '#4ade80');
      coin(p, qx + qw - qfs * 2.6, gy + qfs * 0.75, qfs * 0.45);
      const qt = this.text('quest', T('quest_' + qp.q.id, { n: qp.q.need }), qx + 10, gy - qfs * 0.75, { size: qfs, color: '#ffffff', weight: 800, align: 'left' });
      // a long quest (Russian, on a phone held upright) shrinks to its box instead of running under the gold pill
      qt.scale.set(1);
      if (qt.width > qw - 16) qt.scale.set((qw - 16) / qt.width);
      this.num('qprog', `${qp.prog}/${qp.q.need}`, qx + 10 + pbw / 2, gy + qfs * 0.77, { size: qfs * 0.7, color: '#fff', weight: 800 });
      this.num('qreward', String(qp.q.reward), qx + qw - qfs * 2.0, gy + qfs * 0.78, { size: qfs * 0.85, color: '#fde047', weight: 900, align: 'left' });
    } else {
      this.hide('quest');
      this.hide('qprog');
      this.hide('qreward');
    }
    // online status, just above the bottom panel on the right
    if (this.status) {
      const sfs = Math.max(11, Math.min(14, W / 40));
      this.text('status', this.status.text, W - 10, bt - sfs * 0.9, { size: sfs, color: this.status.color || '#cbd5e1', weight: 800, stroke: 'rgba(0,0,0,0.5)', align: 'right' });
    } else this.hide('status');
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
