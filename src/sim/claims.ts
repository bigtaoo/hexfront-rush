// Who holds each hex, and where each side's cards may stand on it (D134). The two are one
// subject: a card may not stand on ground the enemy holds, so every change of owner is also a
// change to the cards, and every way the colour moves has to say what it does to the claim beyond
// it. Ground changes hands in three places -- economy.tryBuy (you build on it), combat.claimTile
// (a troop walks over it) and combat.damage (you raze what stood there) -- and all three come
// back through here.

import { fillerCard } from './cardLayout';
import type { Engine } from './engine';
import { NTILES } from './hex';
import { enemyOf, pushReach, TEAM_BLUE, TEAM_NONE, TEAM_RED } from './rules';

/** The ground around a tile a team has just flipped: bare neutral ground beside it becomes
 *  theirs, and the enemy's claim on the bare ground around it is pushed off (pushBack, D134).
 *  That second half is what keeps "no card on the enemy's ground" (offerable) a rule you play
 *  against instead of a wall you stop at: the front still advances by flipping cards, as it
 *  always has, only now it moves the COLOUR first and the card second -- build on the border,
 *  their claim beyond it goes grey, and next turn a card stands there.
 *
 *  Ground going from no-man's-land to ours is a change of owner like any other, so the ENEMY's
 *  card on it has to be rechecked here -- the tile `ti` itself included, since both callers set
 *  its owner just before calling. Buying a BUILDING happens to end with a full recomputeOffers
 *  for both sides, so it was covered by accident; flipping a mystery that gives no building
 *  recomputes only the buyer's, and that was the one hole left in the rule: measured over 16
 *  whole matches, 0.04% of the cards on the board still stood on the other side's colour, up to
 *  four at once, every one of them on ground a halo had taken out from under a card already
 *  there. Doing it here makes claimAround right on its own instead of right by its callers. */
export function claimAround(e: Engine, team: number, ti: number): void {
  const foe = enemyOf(team);
  offerAt(e, foe, ti);
  for (const n of e.tiles[ti].nb) {
    const nt = e.tiles[n];
    if (!nt.obst && nt.owner === TEAM_NONE) {
      nt.owner = team;
      offerAt(e, foe, n);
    }
  }
  pushBack(e, team, ti, reachNow(e));
}

/** Ground changes hands three ways -- you build on it, a troop walks over it, or you raze what
 *  stood there -- and all three push the enemy's claim off the bare ground around it, back to
 *  no-man's-land, `reach` hexes deep (rules.pushReach). Both sides' cards there are rechecked.
 *  All three have to do it, or the rule sets a trap for whoever is losing: if only building
 *  pushed back, and building needs a tile to buy on, a side pressed back onto its own buildings
 *  would have none and no way to ever get one -- measured on 6-7, the loser sat on 5600 gold
 *  with nothing to spend it on from minute ten. Razing matters for the same reason at the other
 *  end: an enemy's built-up core is ground no building and no troop can push back, since a hex
 *  with a building on it is not bare, so without it the last cards stop a ring short of their
 *  castle. A rock stops the push, and so does a building: that ground stays theirs until it is
 *  razed. */
export function pushBack(e: Engine, team: number, ti: number, reach = 1): void {
  const foe = enemyOf(team);
  let edge = [ti];
  const seen = new Set<number>([ti]);
  for (let step = 0; step < reach && edge.length; step++) {
    const next: number[] = [];
    for (const cur of edge) {
      for (const n of e.tiles[cur].nb) {
        if (seen.has(n)) continue;
        seen.add(n);
        const nt = e.tiles[n];
        // a rock stops it, and so does a building: a hex with one on it is not bare ground
        if (nt.obst || nt.bld || nt.owner !== foe) continue;
        nt.owner = TEAM_NONE;
        offerAt(e, TEAM_BLUE, n);
        offerAt(e, TEAM_RED, n);
        next.push(n);
      }
    }
    edge = next;
  }
}

/** How deep this match's push-back reaches right now (rules.pushReach): one hex, further once
 *  the siege is on. */
export function reachNow(e: Engine): number {
  return pushReach(e.playT, e.siegeAt);
}

/** Whether a team may put a card on tile `i`: a free tile, not yet flipped by them, next to
 *  one they have flipped -- and NOT GROUND THE ENEMY HOLDS (D134). Until this rule the board
 *  would draw a blue card straight onto a red hex, which is the one thing the colour on the
 *  ground is there to say cannot happen: you buy on your own side of the line and on
 *  no-man's-land. The enemy's ground is taken by walking troops over it (combat.claimTile) and,
 *  on bare ground, by building up to it (claimAround), or by razing what stood there
 *  (combat.damage) -- all three also pushing their claim off the bare ground beyond (pushBack),
 *  which is what keeps the front moving. Held on its own, with no push-back, the rule turns every
 *  border into a wall: measured over npm run campaign, the late stages stop being matches and
 *  become sieges neither side can walk in (6-7's median blue win went 5:41 -> 18:01). */
function offerable(e: Engine, team: number, i: number): boolean {
  const T = e.team[team], t = e.tiles[i];
  if (t.obst || t.bld || T.open[i] || t.owner === enemyOf(team)) return false;
  for (const n of t.nb) if (T.open[n]) return true;
  return false;
}

/** A card on every tile the team may offer on: the layout's card (a filler card on rubble); a
 *  tile that keeps its card keeps the same one. */
export function recomputeOffers(e: Engine, team: number): void {
  for (let i = 0; i < NTILES; i++) offerAt(e, team, i);
}

/** One tile's card, rechecked. Ground changes hands every time a troop steps on a free tile,
 *  far too often to sweep the whole board for -- and it never has to be: whether tile `i` may
 *  carry a card reads `i`'s own obst/bld/owner and whether any neighbour is open, so no OTHER
 *  tile's answer moves when this one's owner does. combat.claimTile calls this for both sides. */
export function offerAt(e: Engine, team: number, i: number): void {
  const T = e.team[team];
  if (!offerable(e, team, i)) T.offers[i] = -1;
  else if (T.offers[i] < 0) {
    const lay = e.layout.card[team]![i];
    T.offers[i] = e.tiles[i].rubble || lay < 0 ? fillerCard(e.rng.offer) : lay;
  }
}
