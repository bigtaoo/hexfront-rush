// The campaign, the quick match's difficulties and the daily challenge: what each one sets up
// (a seed and the two sides' setups, sim/setup.ts) and how it is scored. Plain data and pure
// functions: scripts/campaign.ts plays every stage AI-vs-AI to calibrate the table.
//
// Six chapters of seven stages, each on its own fixed map (the seed: the same cards every time,
// so a stage can be learnt), each chapter on one theme and around one idea, the seventh stage of
// each a boss. Stars: winning, taking at least half the map's chests and camps, winning within
// the par time. (Not the castle's hp: the side that wins hardly ever takes a hit, scripts/campaign.ts.)
// A stage keeps every goal ever met (a bit each), so they can be won one run at a time. The next
// stage opens when this one is won.

import type { ConfigInput, SideSetup } from '../sim/setup';
import type { ThemeKey } from '../sim/map';

export interface Stage {
  seed: number;
  /** The rival's setup (red, the AI); its skill must be given (the standard is the best AI). */
  rival: Partial<SideSetup> & { skill: number };
  /** The player's setup, when it is not the standard one. */
  you?: Partial<SideSetup>;
  /** Seconds before the siege, when it is not the standard 8:00. */
  siege?: number;
  /** Seconds: winning within this earns the third star. */
  par: number;
}

export interface Chapter {
  key: string;
  theme: ThemeKey;
  stages: readonly Stage[];
}

export const GOAL_WIN = 1, GOAL_EVENTS = 2, GOAL_PAR = 4, GOAL_ALL = 7;
export const STAGES_PER_CHAPTER = 7;

const R = (skill: number, rest: Partial<SideSetup> = {}) => ({ skill, ...rest });

export const CHAPTERS: readonly Chapter[] = [
  {
    // first steps: a beginner rival on a short purse, then a novice one
    key: 'greenfield', theme: 'meadow', stages: [
      { seed: 2, rival: R(0, { castle: 60, income: 65 }), par: 165 },
      { seed: 101, rival: R(0, { income: 70 }), par: 165 },
      { seed: 150, rival: R(0, { style: 4, income: 90 }), par: 180 },
      { seed: 185, rival: R(1, { income: 95 }), par: 195 },
      { seed: 1099, rival: R(1, { style: 1, income: 85 }), par: 195 },
      { seed: 262, rival: R(1, { income: 80 }), par: 195 },
      { seed: 1144, rival: R(2, { style: 2, income: 85 }), par: 210 },
    ],
  },
  {
    // gold rush: both sides start rich, so the first minute is a race to spend well
    key: 'sunscorch', theme: 'desert', stages: [
      { seed: 122, rival: R(1, { gold: 200, income: 90 }), you: { gold: 200 }, par: 210 },
      { seed: 6045, rival: R(1, { gold: 250, style: 4, income: 75 }), you: { gold: 250 }, par: 165 },
      { seed: 136, rival: R(2, { income: 85 }), par: 225 },
      { seed: 143, rival: R(2, { gold: 300, style: 1, income: 80 }), you: { gold: 300 }, par: 195 },
      { seed: 6171, rival: R(2, { barracks: 1, style: 2, income: 85 }), par: 270 },
      { seed: 6181, rival: R(2, { gold: 300, style: 4, income: 55 }), you: { gold: 150 }, par: 180 },
      { seed: 6221, rival: R(3, { gold: 400, income: 90 }), you: { gold: 400 }, par: 225 },
    ],
  },
  {
    // blitz: the siege comes early, so buildings fall fast and the troop cap rises soon
    key: 'frostmarch', theme: 'snow', stages: [
      { seed: 11011, rival: R(2, { income: 92 }), siege: 240, par: 270 },
      { seed: 115, rival: R(2, { style: 2, income: 95 }), siege: 180, par: 255 },
      { seed: 157, rival: R(2, { barracks: 1, income: 83 }), siege: 240, par: 240 },
      { seed: 164, rival: R(3, { income: 94 }), siege: 180, par: 240 },
      { seed: 171, rival: R(3, { style: 2, income: 90 }), siege: 150, par: 240 },
      { seed: 11147, rival: R(3, { style: 3, towers: 1, income: 90 }), siege: 120, par: 240 },
      { seed: 199, rival: R(3, { barracks: 2, style: 1, income: 72 }), siege: 180, par: 255 },
    ],
  },
  {
    // fortresses: towers and a stronger castle; it pays to break through rather than trade
    key: 'stonewall', theme: 'meadow', stages: [
      { seed: 276, rival: R(3, { style: 3, towers: 1, castle: 130 }), par: 285 },
      { seed: 297, rival: R(3, { style: 3, towers: 2, castle: 150, income: 95 }), par: 255 },
      { seed: 16083, rival: R(3, { towers: 2, castle: 150 }), par: 270 },
      { seed: 16099, rival: R(3, { style: 3, towers: 3, castle: 200 }), par: 300 },
      { seed: 353, rival: R(3, { style: 1, towers: 2, castle: 150, income: 97 }), par: 255 },
      { seed: 367, rival: R(3, { style: 3, towers: 3, castle: 200, income: 105 }), par: 315 },
      { seed: 381, rival: R(3, { style: 3, towers: 3, castle: 250, barracks: 2, income: 76 }), par: 285 },
    ],
  },
  {
    // warlords: the rival starts with an army
    key: 'warlords', theme: 'desert', stages: [
      { seed: 227, rival: R(3, { style: 2, barracks: 1, income: 90 }), par: 240 },
      { seed: 255, rival: R(3, { style: 2, income: 102 }), par: 240 },
      { seed: 21108, rival: R(3, { style: 2, barracks: 2, income: 78 }), par: 270 },
      { seed: 290, rival: R(3, { style: 4, gold: 200, income: 76 }), par: 255 },
      { seed: 21175, rival: R(3, { style: 2, barracks: 2, income: 80 }), par: 285 },
      { seed: 332, rival: R(3, { style: 1, income: 98 }), par: 255 },
      { seed: 21226, rival: R(3, { style: 2, barracks: 3, income: 80 }), par: 315 },
    ],
  },
  {
    // the last front: everything at once
    key: 'lastfront', theme: 'snow', stages: [
      { seed: 206, rival: R(3, { style: 1, towers: 1 }), par: 270 },
      { seed: 26049, rival: R(3, { barracks: 1, income: 95 }), siege: 240, par: 300 },
      { seed: 26071, rival: R(3, { style: 4, gold: 200, income: 78 }), par: 255 },
      { seed: 26098, rival: R(3, { style: 1, barracks: 2, income: 80 }), par: 270 },
      { seed: 26149, rival: R(3, { style: 2, barracks: 3, income: 75 }), par: 300 },
      { seed: 26205, rival: R(3, { style: 1, barracks: 2, castle: 150, towers: 2, income: 80 }), par: 285 },
      { seed: 26218, rival: R(3, { style: 1, barracks: 3, castle: 150, towers: 2, income: 75 }), par: 315 },
    ],
  },
];

export const STAGE_COUNT = CHAPTERS.length * STAGES_PER_CHAPTER;

export function stageAt(id: number): Stage {
  return CHAPTERS[Math.floor(id / STAGES_PER_CHAPTER)]!.stages[id % STAGES_PER_CHAPTER]!;
}

// ---------------- the hard campaign ----------------

/** The hard campaign: the same 42 stages and maps, the rival one skill up and with HARD_INCOME
 *  more income; a rival already at the top skill (most of chapters 3-6) gets HARD_INCOME_TOP instead.
 *  Calibrated (`HARD=1 npm run campaign -- 16`): the bot wins about 15-27 points less often than
 *  on Normal, chapter by chapter. Its stars and best times are kept apart (Save.hard,
 *  Save.hardBest); a hard stage opens once it is won on Normal and the hard one before it is won. */
export const HARD_INCOME = 1.1;
export const HARD_INCOME_TOP = 1.2;
export function hardStage(st: Stage): Stage {
  const r = st.rival;
  const top = r.skill >= 3;
  return { ...st, rival: { ...r, skill: Math.min(3, r.skill + 1), income: Math.round((r.income ?? 100) * (top ? HARD_INCOME_TOP : HARD_INCOME)) } };
}

/** Hard stage id is open: won on Normal, and the first one or the hard one before it is won. */
export const hardOpen = (normal: readonly number[], hard: readonly number[], id: number): boolean =>
  ((normal[id] ?? 0) & GOAL_WIN) !== 0 && (id === 0 || ((hard[id - 1] ?? 0) & GOAL_WIN) !== 0);

/** "3-5": chapter and stage, from 1. */
export const stageLabel = (id: number): string => `${Math.floor(id / STAGES_PER_CHAPTER) + 1}-${(id % STAGES_PER_CHAPTER) + 1}`;

/** The player is blue, the AI red. */
export function stageConfig(st: Stage): ConfigInput {
  return { seed: st.seed, aiBlue: false, aiRed: true, blue: st.you ?? {}, red: st.rival, siege: st.siege };
}

/** The second star: the map events (chests and camps) the player took are at least half of
 *  those on the map (every map has EVENTS_ON_MAP). Going out of the way for them is a choice:
 *  the stand-in, which does not, gets it in 7-30% of its wins, and it pulls against the par. */
export const EVENTS_ON_MAP = 8;
export const eventsGoal = (taken: number, total: number): boolean => taken * 2 >= total;

/** The goals a match met (GOAL_* bits): none when it was not won. */
export function goalsMet(won: boolean, taken: number, total: number, secs: number, par: number): number {
  if (!won) return 0;
  return GOAL_WIN | (eventsGoal(taken, total) ? GOAL_EVENTS : 0) | (secs <= par ? GOAL_PAR : 0);
}

export const starCount = (goals: number): number => (goals & 1) + ((goals >> 1) & 1) + ((goals >> 2) & 1);
/** Every star the campaign's stages won (the leaderboard's score). */
export const totalStars = (goals: readonly number[]): number => goals.reduce((n, g) => n + starCount(g ?? 0), 0);

/** Stage id is open: the first one, or the one before it is won. */
export const stageOpen = (goals: readonly number[], id: number): boolean => id === 0 || ((goals[id - 1] ?? 0) & GOAL_WIN) !== 0;

/** The furthest open stage (where the campaign button leads). */
export function nextStage(goals: readonly number[]): number {
  let id = 0;
  while (id + 1 < STAGE_COUNT && stageOpen(goals, id + 1)) id++;
  // the first open stage not yet won, else the last open one
  for (let i = 0; i <= id; i++) if (!((goals[i] ?? 0) & GOAL_WIN)) return i;
  return id;
}

export function chapterStars(goals: readonly number[], ch: number): number {
  let n = 0;
  for (let i = 0; i < STAGES_PER_CHAPTER; i++) n += starCount(goals[ch * STAGES_PER_CHAPTER + i] ?? 0);
  return n;
}

// ---------------- quick match ----------------

/** Easy, Normal (the standard AI, as before the campaign), Hard, Brutal. */
export const SKIRMISH: readonly (Partial<SideSetup> & { skill: number })[] = [
  R(1, { income: 85 }),
  R(3),
  R(3, { style: 1, income: 110 }),
  R(3, { style: 1, income: 125, barracks: 1 }),
];
export const SKIRMISH_STD = 1;

// ---------------- daily challenge ----------------

/** One twist per day of the week, the rival's style by the date. */
const DAILY: readonly Omit<Stage, 'seed'>[] = [
  { rival: R(3, { gold: 300 }), you: { gold: 300 }, par: 240 },
  { rival: R(3, { barracks: 1 }), you: { barracks: 1 }, par: 240 },
  { rival: R(3), siege: 150, par: 255 },
  { rival: R(3, { towers: 2, castle: 150 }), you: { towers: 2, castle: 150 }, par: 285 },
  { rival: R(3, { income: 150 }), you: { income: 150 }, par: 240 },
  { rival: R(3, { barracks: 2 }), you: { barracks: 2 }, par: 255 },
  { rival: R(3, { income: 110 }), par: 285 },
];

/** Days since 1970-01-01 (UTC) of a Date.now() value. */
export const dayNumber = (now: number): number => Math.floor(now / 86400000);

export function dailyStage(day: number): Stage {
  // a seed nobody would pick by hand, the same for everyone that day
  let h = (day * 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  const t = DAILY[day % DAILY.length]!;
  return { ...t, seed: h % 1000000000, rival: { ...t.rival, style: day % 5 } };
}
