// First-time hints: after the tutorial, a rule the player has not met yet is said once, on the
// tutorial's hint pill, the first time it matters in a solo match: the waves (the first barracks),
// the siege (shortly before it), the mystery card (the first one offered) and the troop cap (the
// first time the army reaches it). One at a time, for HINT_SECS, with a pause between; each is
// kept in the save (Save.hints) and never said again. They say how the game works, never what a
// face-down card holds.

import { TICK_RATE } from '../sim/fixed';
import { OFFER_LIST, PHASE_PLAY, unitCap } from '../sim/rules';
import { fmtTime } from './campaignUi';
import type { Game } from './game';
import { T } from './i18n';

export const HINT_WAVE = 1, HINT_SIEGE = 2, HINT_MYSTERY = 4, HINT_CAP = 8;
const HINT_SECS = 6;
const HINT_GAP = 3;
/** The siege hint comes this long before the siege. */
const SIEGE_LEAD = 20 * TICK_RATE;

export class Hints {
  private bit = 0;
  private t = 0;
  private gap = 0;

  reset(): void {
    this.bit = 0;
    this.t = 0;
    this.gap = 0;
  }

  /** Once a frame while a solo match runs. */
  update(g: Game, dt: number): void {
    const R = g.renderer, eng = g.eng;
    if (g.mode !== 'solo' || g.tut || g.state !== 'match' || eng.phase !== PHASE_PLAY) {
      if (this.bit) R.hint = null;
      this.bit = 0;
      return;
    }
    if (this.bit) {
      this.t -= dt;
      if (this.t > 0) return;
      R.hint = null;
      this.bit = 0;
      this.gap = HINT_GAP;
    }
    if (this.gap > 0) {
      this.gap -= dt;
      return;
    }
    const due = this.due(g);
    if (!due) return;
    this.bit = due.bit;
    this.t = HINT_SECS;
    R.hint = due.text;
    g.save.hints |= due.bit;
    g.persist();
  }

  /** The first hint not shown yet whose moment has come. */
  private due(g: Game): { bit: number; text: string } | null {
    const seen = g.save.hints, eng = g.eng, me = eng.team[g.localTeam]!, el = eng.elapsed();
    if (!(seen & HINT_WAVE) && me.built.barracks > 0) return { bit: HINT_WAVE, text: T('hint_wave') };
    if (!(seen & HINT_MYSTERY) && me.offers.some((oi) => oi >= 0 && OFFER_LIST[oi]!.kind === 'mystery')) return { bit: HINT_MYSTERY, text: T('hint_mystery') };
    if (!(seen & HINT_SIEGE) && el >= eng.siegeAt - SIEGE_LEAD && el < eng.siegeAt) {
      return { bit: HINT_SIEGE, text: T('hint_siege', { t: fmtTime(Math.round(eng.siegeAt / TICK_RATE)) }) };
    }
    if (!(seen & HINT_CAP) && me.units >= unitCap(el, eng.siegeAt)) return { bit: HINT_CAP, text: T('hint_cap', { n: unitCap(el, eng.siegeAt) }) };
    return null;
  }
}
