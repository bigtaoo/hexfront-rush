// What the sim's events mean to the player: banners, sounds, the card pop, and the end of the
// match. The renderer draws its own effects for them (Renderer.onEvent); this is the app's part.

import type { Engine } from '../sim/engine';
import { makeReplay } from '../sim/replay';
import { SIEGE, TEAM_BLUE } from '../sim/rules';
import type { SimEvent } from '../sim/types';
import type { Game } from './game';
import { T } from './i18n';

/** full: sound, visuals and flow; visual: the menu's demo; none: a fast-forward, flow only. */
export type Fx = 'full' | 'visual' | 'none';

export function handleEvents(g: Game, eng: Engine, fx: Fx): void {
  const R = g.renderer;
  const S = g.sound;
  const me = g.localTeam;
  for (const e of eng.events) {
    if (e.type === 'end') {
      if (g.mode !== 'demo') onMatchEnd(g, eng, e, fx !== 'none');
      continue;
    }
    if (fx === 'none') continue;
    R.onEvent(e);
    if (fx !== 'full') continue;
    const mine = e.team === me;
    switch (e.type) {
      case 'count':
        R.banner(String(e.n), { size: 96, life: 0.9, color: '#fde047' });
        S.play('beep');
        break;
      case 'fight':
        R.banner(T('fight'), { size: 64, life: 1.1, color: '#ffffff', band: me === TEAM_BLUE ? 'rgba(37,99,235,0.55)' : 'rgba(220,38,38,0.55)' });
        S.play('go');
        break;
      case 'wave':
        S.play('go', 0.3);
        break;
      case 'siege':
        R.banner(T(e.n === 1 ? 'siege' : 'siegeMore', { n: (e.n ?? 1) * SIEGE.dmgStep }), { size: 40, life: 2.2, color: '#fca5a5', y: 0.3 });
        S.play('beep');
        break;
      case 'needGold':
        if (mine && g.needGoldT <= 0 && e.x !== undefined && e.y !== undefined) {
          g.needGoldT = 1.2;
          g.ui.goldFlash = 0.6;
          R.needGold(e.x, e.y);
          S.play('error');
        }
        break;
      case 'built':
        if (mine) S.play('build');
        break;
      case 'barracks':
        if (mine && e.unit) {
          S.play('build');
          R.card = { unit: e.unit, rarity: e.rarity ?? 0, t: 0, life: 2.2 };
          if (e.rarity === 3) {
            R.banner(T('legendary'), { size: 58, life: 1.8, color: '#fde047', band: 'rgba(120,53,15,0.6)' });
            S.play('legend');
          }
        }
        break;
      case 'mysteryNothing':
        if (mine) S.play('nothing');
        break;
      case 'mysteryWin':
        // a squad that sets off now, or a barracks standing on the tile for good
        if (mine && e.unit) {
          const bar = e.kind === 'barracks';
          R.banner(T(e.rarity === 3 ? 'legendary' : 'lucky'), { size: e.rarity === 3 ? 58 : 48, life: 1.6, color: '#fde047', y: 0.32, band: e.rarity === 3 ? 'rgba(120,53,15,0.6)' : undefined });
          R.card = { unit: e.unit, rarity: e.rarity ?? 0, n: bar ? 0 : e.n, t: 0, life: 2.4 };
          if (bar) S.play('build');
          S.play(e.rarity === 3 ? 'legend' : 'quest');
        }
        break;
      case 'spawn':
        if (mine) S.play('spawn');
        break;
      case 'shoot':
        S.play('shoot');
        break;
      case 'hit':
        S.play('hit');
        break;
      case 'melee':
        S.play('melee');
        break;
      case 'unitDown':
        S.play('pop');
        break;
      case 'bldDown':
        S.play('destroy');
        break;
      case 'guardDown':
        S.play(mine ? 'destroy' : 'quest');
        break;
      case 'guardBack':
        if (mine) S.play('spawn');
        break;
      case 'mapEvent':
        if (!mine) S.play('destroy');
        else if (e.unit) {
          R.banner(T(e.kind === 'warband' ? 'ev_warband' : 'ev_camp'), { size: 44, life: 1.4, color: '#fde047', y: 0.32 });
          R.card = { unit: e.unit, rarity: e.rarity ?? 0, n: e.n, t: 0, life: 2.2 };
          S.play('quest');
        } else S.play('coin');
        break;
      case 'income':
        if (mine) S.play('income');
        break;
      case 'quest':
        if (mine) {
          R.banner(T('questDone', { g: e.reward ?? 0 }), { size: 30, life: 1.8, color: '#86efac', y: 0.72 });
          S.play('quest');
        }
        break;
      default:
        break;
    }
  }
}

/** The sim says the match is over: the end banner, the replay (kept, and a solo one sent), and
 *  the results after a beat (at once after a fast-forward). */
function onMatchEnd(g: Game, eng: Engine, e: SimEvent, loud: boolean): void {
  const me = g.localTeam;
  g.platform.gameplayStop();
  if (loud) {
    const won = e.winner === me;
    g.sound.play(won ? 'win' : e.winner ? 'lose' : 'beep');
    g.renderer.banner(won ? T('victory') : e.winner ? T('defeat') : T('draw'), {
      size: 64,
      life: 2.2,
      color: won ? '#93c5fd' : e.winner ? '#fca5a5' : '#ffffff',
      band: 'rgba(0,0,0,0.45)',
    });
  }
  g.pendingResult = loud ? 2.0 : 0.01;
  g.renderer.hint = null;
  g.renderer.guide = null;
  g.tut = null;
  if (g.mode === 'watch') return;
  g.lastReplay = makeReplay(eng.config, g.source.log, eng);
  if (g.mode === 'solo') g.uploads?.end();
  if (g.mode === 'online') g.online.matchOver(eng, e);
}
