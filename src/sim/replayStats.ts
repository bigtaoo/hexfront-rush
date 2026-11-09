// What the collected replays say once played again (`npm run replays`, scripts/replays.ts): how
// matches end and how long they run, how the players and the AI spend their flips (what they
// build, the mystery cards' luck, chests and quests, taps without the gold), and the troops the
// barracks train. Ported in spirit from Potion Siege's replayStats (D:\fang src/sim/replayStats.ts).

import type { Engine } from './engine';
import { runReplay, type Replay } from './replay';
import { ENGINE_VERSION, MATCH_TICKS, TEAMS, type OfferKind, type UnitKey } from './rules';
import type { EndReason } from './types';
import { TICK_RATE } from './fixed';

const OFFER_KINDS: readonly OfferKind[] = ['mine', 'tower', 'barracks', 'mystery'];

/** One kind of seat (a player or the AI) over all the matches. */
export interface SideStats {
  seats: number;
  won: number;
  lost: number;
  /** Cards tapped (built or not), and the taps that lacked the gold. */
  flips: number;
  needGold: number;
  built: Map<OfferKind, number>;
  mysteryWin: number;
  mysteryNothing: number;
  /** Barracks (and lucky mystery cards) by rarity 0..3. */
  rarity: number[];
  trained: Map<UnitKey, number>;
  chests: number;
  quests: number;
  /** Sums over the seats, for averages: tiles and unspent gold at the end, the most troops at once. */
  tiles: number;
  goldLeft: number;
  peakUnits: number;
  /** Seats that flipped at all, and the sum of the seconds of play before their first flip. */
  firstFlips: number;
  firstFlipSecs: number;
}

/** One kind of match: solo (a player against the AI), online (two players) or ai (AI against AI). */
export interface KindStats {
  matches: number;
  /** Played to a result; the rest were cut short (left, or the page hidden). */
  ended: number;
  reasons: Map<EndReason, number>;
  blueWins: number;
  redWins: number;
  draws: number;
  /** Ended matches by length in whole minutes of play. */
  minutes: Map<number, number>;
  player: SideStats;
  ai: SideStats;
}

export interface ReplayStats {
  /** Replays played; those of another engine version; those that did not play back to their hashes. */
  played: number;
  oldVersion: number;
  desynced: number;
  kinds: Map<string, KindStats>;
}

export const newStats = (): ReplayStats => ({ played: 0, oldVersion: 0, desynced: 0, kinds: new Map() });

const newSide = (): SideStats => ({
  seats: 0, won: 0, lost: 0, flips: 0, needGold: 0, built: new Map(), mysteryWin: 0, mysteryNothing: 0, rarity: [0, 0, 0, 0],
  trained: new Map(), chests: 0, quests: 0, tiles: 0, goldLeft: 0, peakUnits: 0, firstFlips: 0, firstFlipSecs: 0,
});

const add = <K>(m: Map<K, number>, k: K, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

export function kindOf(r: Replay): 'solo' | 'online' | 'ai' {
  const { aiBlue, aiRed } = r.config;
  return aiBlue && aiRed ? 'ai' : aiBlue || aiRed ? 'solo' : 'online';
}

function kindStats(s: ReplayStats, kind: string): KindStats {
  let k = s.kinds.get(kind);
  if (!k) s.kinds.set(kind, (k = { matches: 0, ended: 0, reasons: new Map(), blueWins: 0, redWins: 0, draws: 0, minutes: new Map(), player: newSide(), ai: newSide() }));
  return k;
}

/** What one seat did in one match, before it is added in. */
interface Seat {
  flips: number;
  needGold: number;
  mysteryWin: number;
  mysteryNothing: number;
  rarity: number[];
  trained: Map<UnitKey, number>;
  chests: number;
  quests: number;
  peakUnits: number;
  firstFlip: number;
}
const newSeat = (): Seat => ({ flips: 0, needGold: 0, mysteryWin: 0, mysteryNothing: 0, rarity: [0, 0, 0, 0], trained: new Map(), chests: 0, quests: 0, peakUnits: 0, firstFlip: -1 });

/** The engine's events of one tick, into the seats. */
function onTick(e: Engine, seats: Seat[]): void {
  for (const ev of e.events) {
    const st = ev.team === 1 || ev.team === 2 ? seats[ev.team]! : null;
    if (!st) continue;
    switch (ev.type) {
      case 'needGold':
        st.needGold++;
        break;
      case 'mysteryNothing':
        st.mysteryNothing++;
        break;
      case 'mysteryWin':
        st.mysteryWin++;
        st.rarity[ev.rarity ?? 0]!++;
        break;
      case 'barracks':
        st.rarity[ev.rarity ?? 0]!++;
        break;
      case 'spawn':
        if (ev.unit) add(st.trained, ev.unit);
        break;
      case 'chest':
        st.chests++;
        break;
      case 'quest':
        st.quests++;
        break;
      default:
        break;
    }
  }
  for (const t of TEAMS) seats[t]!.peakUnits = Math.max(seats[t]!.peakUnits, e.team[t]!.units);
}

/** Plays `r` again into `s`. 'old': another engine version; 'desync': it did not play back to
 *  its own hashes (or threw); neither is counted. */
export function addReplay(s: ReplayStats, r: Replay): 'ok' | 'old' | 'desync' {
  if (r.v !== ENGINE_VERSION) {
    s.oldVersion++;
    return 'old';
  }
  const seats = [newSeat(), newSeat(), newSeat()];
  let engine: Engine;
  try {
    const run = runReplay(r, undefined, (e) => onTick(e, seats), {
      beforeCommand: (e, c) => {
        const st = c.owner === 1 || c.owner === 2 ? seats[c.owner]! : null;
        if (!st || c.flip < 0) return;
        st.flips++;
        if (st.firstFlip < 0) st.firstFlip = e.elapsed();
      },
    });
    if (!run.ok) throw new Error('desync');
    engine = run.engine;
  } catch {
    s.desynced++;
    return 'desync';
  }
  s.played++;
  const k = kindStats(s, kindOf(r));
  k.matches++;
  const res = engine.result;
  if (res) {
    k.ended++;
    add(k.reasons, res.reason);
    if (res.winner === 1) k.blueWins++;
    else if (res.winner === 2) k.redWins++;
    else k.draws++;
    add(k.minutes, Math.floor(Math.min(engine.elapsed(), MATCH_TICKS) / (60 * TICK_RATE)));
  }
  for (const t of TEAMS) {
    const ai = t === 1 ? r.config.aiBlue : r.config.aiRed;
    const side = ai ? k.ai : k.player;
    const seat = seats[t]!;
    const team = engine.team[t]!;
    side.seats++;
    if (res && res.winner === t) side.won++;
    else if (res && res.winner) side.lost++;
    side.flips += seat.flips;
    side.needGold += seat.needGold;
    for (const kind of OFFER_KINDS) add(side.built, kind, team.built[kind]);
    side.mysteryWin += seat.mysteryWin;
    side.mysteryNothing += seat.mysteryNothing;
    for (let i = 0; i < 4; i++) side.rarity[i]! += seat.rarity[i]!;
    for (const [u, n] of seat.trained) add(side.trained, u, n);
    side.chests += seat.chests;
    side.quests += seat.quests;
    side.tiles += team.tiles;
    side.goldLeft += team.gold;
    side.peakUnits += seat.peakUnits;
    if (seat.firstFlip >= 0) {
      side.firstFlips++;
      side.firstFlipSecs += seat.firstFlip / TICK_RATE;
    }
  }
  return 'ok';
}
