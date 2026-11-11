// The first match's tutorial: a hint line and a pointing hand. Step 0 asks for any card, step 1
// for a barracks (or moves on after a while), step 2 points at the nearest map event (a chest or a
// camp: first to flip it takes it), step 3 says how to win and then it is done for good.
// It is always played on TUTORIAL_SEED: the same map and the same cards (cardLayout.ts), with a
// mine, a barracks and a mystery among the six cards around the castle, as on every map.

import { cardCost, standingOf } from '../sim/economy';
import type { Engine } from '../sim/engine';
import { NTILES } from '../sim/hex';
import { baseTile, type Tile } from '../sim/map';
import { OFFER_LIST, PHASE_PLAY, type Offer } from '../sim/rules';
import type { Game } from './game';
import { T } from './i18n';

/** The tutorial's map: a meadow. */
export const TUTORIAL_SEED = 2;
/** A step's lesson stays up at least this long, even when the player has already done what the
 *  next step asks. Without it the barracks lesson could not be read: the hand in step 0 points at
 *  the nearest card the player can pay for, which on the tutorial's own map is the barracks, so
 *  building it met step 1 on the frame it opened and its line showed for one frame (16 ms). */
const MIN_READ = 3;

export interface Tutorial {
  step: number;
  /** Seconds in this step. */
  t: number;
}

/** Where the hand points: the nearest card the player can pay for (any card in step 0, a barracks
 *  in step 1). "Nearest" means nearest the own castle, which is where the camera opens. */
export function guideTarget(eng: Engine, me: number, step: number): Tile | null {
  const home = eng.tiles[baseTile(me)]!;
  const tm = eng.team[me]!;
  const standing = standingOf(eng, me);
  const near = (pred: (o: Offer) => boolean): Tile | null => {
    let best: Tile | null = null;
    let bd = Infinity;
    for (let i = 0; i < NTILES; i++) {
      const oi = tm.offers[i]!;
      if (oi < 0) continue;
      const t = eng.tiles[i]!;
      const o = OFFER_LIST[oi]!;
      if (t.bld || !pred(o)) continue;
      // affordable first, then by distance
      const d = (t.x - home.x) ** 2 + (t.y - home.y) ** 2 + (cardCost(oi, standing) > tm.gold ? 1e15 : 0);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  };
  if (step === 0) return near(() => true);
  if (step === 1) return near((o) => o.kind === 'barracks');
  if (step === 2) {
    let best: Tile | null = null;
    let bd = Infinity;
    for (const t of eng.tiles) {
      if (!t.event) continue;
      const d = (t.x - home.x) ** 2 + (t.y - home.y) ** 2;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }
  return null;
}

export function updateTutorial(g: Game, dt: number): void {
  const tut = g.tut;
  const eng = g.eng;
  if (!tut || eng.phase !== PHASE_PLAY) return;
  tut.t += dt;
  const b = eng.team[g.localTeam]!.built;
  const total = b.mine + b.tower + b.barracks + b.mystery;
  const R = g.renderer;
  R.guide = guideTarget(eng, g.localTeam, tut.step);
  switch (tut.step) {
    case 0:
      R.hint = T('tip_build');
      if (total >= 1) Object.assign(tut, { step: 1, t: 0 });
      break;
    case 1:
      R.hint = T('tip_barracks');
      if (tut.t > MIN_READ && (b.barracks >= 1 || tut.t > 18)) Object.assign(tut, { step: 2, t: 0 });
      break;
    case 2:
      R.hint = T('tip_event');
      if (tut.t > 8) Object.assign(tut, { step: 3, t: 0 });
      break;
    case 3:
      R.hint = T('tip_win');
      if (tut.t > 6) {
        R.hint = null;
        R.guide = null;
        g.save.tutorialDone = true;
        g.persist();
        g.tut = null;
      }
      break;
  }
}
