// The campaign's screens (index.html): the chapter map with its stages and stars, the brief
// before a stage or the daily challenge (what is different there and the three goals), the menu's
// quick match difficulty and daily button, and the results' stars. What a match is (a stage, a
// quick match, the daily challenge) and what its result earns is decided here; game.ts runs it.

import { STD_SIEGE, sideSetup, type ConfigInput, type SideSetup } from '../sim/setup';
import {
  CHAPTERS, EVENTS_ON_MAP, GOAL_EVENTS, GOAL_PAR, GOAL_WIN, SKIRMISH, STAGE_COUNT, STAGES_PER_CHAPTER, chapterStars, dailyStage, dayNumber, goalsMet,
  hardOpen, hardStage, nextStage, stageAt, stageConfig, stageLabel, stageOpen, totalStars, type Stage,
} from './campaign';
import { ACHIEVEMENTS, achCount } from './achievements';
import { $ } from './dom';
import { fillRivalCard, rivalStyle } from './rival';
import { T } from './i18n';
import type { Board, ScoreRow } from '../platform/types';
import type { Save } from './save';

/** A campaign stage (hard: the hard campaign's), a quick match or the day's challenge. */
export type MatchKind = { kind: 'stage'; id: number; hard?: boolean } | { kind: 'quick' } | { kind: 'daily'; day: number };

/** The campaign's goals (stars) per stage, and the best times: the normal or the hard one's. */
export const goalsOf = (save: Save, hard: boolean | undefined): number[] => (hard ? save.hard : save.stages);
export const bestOf = (save: Save, hard: boolean | undefined): number[] => (hard ? save.hardBest : save.best);
/** Every campaign star, Normal and Hard (the stars leaderboard). */
export const allStars = (save: Save): number => totalStars(save.stages) + totalStars(save.hard);

export const fmtTime = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The stage a match is played on: a campaign stage, the day's challenge, or none (quick). */
export function stageOf(m: MatchKind): Stage | null {
  if (m.kind === 'stage') return m.hard ? hardStage(stageAt(m.id)) : stageAt(m.id);
  return m.kind === 'daily' ? dailyStage(m.day) : null;
}

/** The engine config for a match (the seed is only drawn for a quick match). */
export function matchConfig(m: MatchKind, save: Save, seed: number): ConfigInput {
  const st = stageOf(m);
  return st ? stageConfig(st) : { seed, aiBlue: false, aiRed: true, red: SKIRMISH[save.skirmish] };
}

/** What a finished match earns: the goals met this time and those met before it (the stars),
 *  saved. A quick match earns none. */
export function recordGoals(m: MatchKind, save: Save, won: boolean, taken: number, total: number, secs: number): { now: number; before: number } | null {
  const st = stageOf(m);
  if (!st || m.kind === 'quick') return null;
  const now = goalsMet(won, taken, total, secs, st.par);
  if (m.kind === 'stage') {
    const goals = goalsOf(save, m.hard);
    while (goals.length < m.id) goals.push(0);
    const before = goals[m.id] ?? 0;
    goals[m.id] = before | now;
    return { now, before };
  }
  if (save.dailyDay !== m.day) {
    save.dailyDay = m.day;
    save.dailyGoals = 0;
  }
  const before = save.dailyGoals;
  save.dailyGoals |= now;
  if (won && save.streakDay !== m.day) {
    save.streak = save.streakDay === m.day - 1 ? save.streak + 1 : 1;
    save.streakDay = m.day;
    save.dailyWins++;
  }
  return { now, before };
}

// ---------------- what a stage changes ----------------

const pct = (v: number) => `${v > 100 ? '+' : ''}${v - 100}%`;

/** One line per way the stage differs from a standard match: the rival's skill (its style is on
 *  the rival's card, rival.ts), each side's handicaps (said once for both when they are the same), the siege. */
export function twists(st: Stage): string[] {
  const you = sideSetup(st.you), rival = sideSetup(st.rival), std = sideSetup();
  const out: string[] = [T(`tw_skill${rival.skill}`)];
  const sides = (k: keyof SideSetup, say: (who: string, v: number) => string) => {
    if (you[k] === rival[k]) {
      if (you[k] !== std[k]) out.push(say(T('whoBoth'), you[k]));
      return;
    }
    if (you[k] !== std[k]) out.push(say(T('whoYour'), you[k]));
    if (rival[k] !== std[k]) out.push(say(T('whoRival'), rival[k]));
  };
  sides('gold', (who, v) => T('tw_gold', { who, n: v }));
  sides('income', (who, v) => T('tw_income', { who, d: pct(v) }));
  sides('castle', (who, v) => T('tw_castle', { who, d: pct(v) }));
  sides('barracks', (who, v) => T('tw_barracks', { who, r: T(['r_common', 'r_rare', 'r_epic', 'r_legendary'][v]!) }));
  sides('towers', (who, v) => T(v === 1 ? 'tw_tower' : 'tw_towers', { who, n: v }));
  if ((st.siege ?? STD_SIEGE) !== STD_SIEGE) out.push(T('tw_siege', { t: fmtTime(st.siege!) }));
  return out;
}

const GOALS = [GOAL_WIN, GOAL_EVENTS, GOAL_PAR] as const;
/** A goal in words: the brief's full line, or (taken given: the results) the short one, where
 *  the chests read as the ones taken against the ones needed, like the in-match line. */
export function goalText(bit: number, st: Stage, taken: number | null = null): string {
  const need = Math.ceil(EVENTS_ON_MAP / 2);
  if (bit === GOAL_WIN) return T('goal_win');
  if (bit === GOAL_EVENTS)
    return taken === null ? T('goal_events', { n: need, t: EVENTS_ON_MAP }) : T('goal_eventsShort', { n: Math.min(taken, need), t: need });
  return T(taken === null ? 'goal_par' : 'goal_parShort', { t: fmtTime(st.par) });
}

/** A locked stage's padlock (an icon drawn here, no emoji: Playgama 4.3.2). */
const LOCK = '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';
const starsHtml = (goals: number) => GOALS.map((b) => `<span class="${goals & b ? '' : 'off'}">★</span>`).join('');

/** The in-match line on a stage or the daily challenge: the chests taken toward the second
 *  star (green once there) and the par. None in a quick match. */
export function goalTrack(m: MatchKind, taken: number): { text: string; color?: string } | null {
  const st = stageOf(m);
  if (!st) return null;
  const n = Math.ceil(EVENTS_ON_MAP / 2);
  return { text: T('goalTrack', { a: Math.min(taken, n), n, t: fmtTime(st.par) }), color: taken >= n ? '#86efac' : undefined };
}

// ---------------- the screens ----------------

/** The menu's campaign, quick match and daily buttons. */
export function updateMenu(save: Save): void {
  const id = nextStage(save.stages);
  $('playBtn').textContent = save.tutorialDone ? `${T('campaign')} · ${stageLabel(id)}` : T('play');
  $('diffBtn').textContent = T(`diff${save.skirmish}`);
  const today = dayNumber(Date.now());
  const done = save.dailyDay === today ? save.dailyGoals : 0;
  $('dailyBtn').innerHTML = `${T('daily')} <span class="st">${starsHtml(done)}</span>`;
  $('achN').textContent = `${achCount(save.ach)}/${ACHIEVEMENTS.length}`;
}

/** The chapter map: chapter ch's seven stages, open or locked, with their stars, on Normal or
 *  Hard (its tabs show once the first stage is won). */
export function showChapter(save: Save, ch: number, hard: boolean, pick: (id: number) => void): void {
  const c = CHAPTERS[ch]!;
  const goals = goalsOf(save, hard);
  $('modeTabs').classList.toggle('hidden', !((save.stages[0] ?? 0) & GOAL_WIN));
  $('modeNormal').classList.toggle('on', !hard);
  $('modeHard').classList.toggle('on', hard);
  $('chName').textContent = T('chapterN', { n: ch + 1, name: T(`ch_${c.key}`) });
  $('chStars').textContent = `★ ${chapterStars(goals, ch)}/${STAGES_PER_CHAPTER * 3}`;
  $<HTMLButtonElement>('chPrev').disabled = ch === 0;
  $<HTMLButtonElement>('chNext').disabled = ch === CHAPTERS.length - 1;
  const grid = $('stageGrid');
  grid.textContent = '';
  grid.classList.toggle('hard', hard);
  for (let s = 0; s < STAGES_PER_CHAPTER; s++) {
    const id = ch * STAGES_PER_CHAPTER + s;
    const b = document.createElement('button');
    b.className = 'stage' + (s === STAGES_PER_CHAPTER - 1 ? ' boss' : '');
    const open = hard ? hardOpen(save.stages, save.hard, id) : stageOpen(save.stages, id);
    b.disabled = !open;
    b.innerHTML = `<span>${open ? stageLabel(id) : LOCK}</span><span class="st">${starsHtml(goals[id] ?? 0)}</span>`;
    if (open) b.addEventListener('click', () => pick(id));
    grid.appendChild(b);
  }
}

/** The leaderboard's rows (null: still loading); a row's name is the platform's, shown as text.
 *  The stars board scores in stars, the daily one in challenges won. */
export function showBoard(rows: ScoreRow[] | null, board: Board): void {
  $('boardSub').textContent = T(board === 'stars' ? 'boardSub' : 'boardSubDaily');
  $('boardStars').classList.toggle('on', board === 'stars');
  $('boardDaily').classList.toggle('on', board === 'daily');
  const list = $('boardList');
  list.textContent = '';
  const note = (key: string) => {
    const li = document.createElement('li');
    li.className = 'note';
    li.textContent = T(key);
    list.appendChild(li);
  };
  if (!rows) return note('boardLoading');
  if (!rows.length) return note('boardEmpty');
  for (const r of rows.slice(0, 50)) {
    const li = document.createElement('li');
    const rank = document.createElement('b');
    rank.textContent = String(r.rank);
    const name = document.createElement('span');
    name.textContent = r.name || T('boardAnon');
    const score = document.createElement('i');
    score.textContent = board === 'stars' ? `★ ${r.score}` : String(r.score);
    li.append(rank, name, score);
    list.appendChild(li);
  }
}

/** The chapter the campaign opens on: the one holding the next stage. */
export const chapterOfNext = (save: Save): number => Math.floor(nextStage(save.stages) / STAGES_PER_CHAPTER);

/** Whether a stage after `m` can be played next from the results: it exists and is open. */
export function nextOpen(m: MatchKind, save: Save): boolean {
  if (m.kind !== 'stage' || m.id + 1 >= STAGE_COUNT) return false;
  return m.hard ? hardOpen(save.stages, save.hard, m.id + 1) : stageOpen(save.stages, m.id + 1);
}

/** The brief before a stage or the daily challenge. */
export function showBrief(save: Save, m: Exclude<MatchKind, { kind: 'quick' }>): void {
  const st = stageOf(m)!;
  const had = m.kind === 'stage' ? (goalsOf(save, m.hard)[m.id] ?? 0) : save.dailyDay === m.day ? save.dailyGoals : 0;
  const boss = m.kind === 'stage' && m.id % STAGES_PER_CHAPTER === STAGES_PER_CHAPTER - 1;
  if (m.kind === 'stage') {
    $('briefTitle').textContent = T('stageN', { s: stageLabel(m.id) }) + (m.hard ? ` · ${T('diff2')}` : '') + (boss ? ` · ${T('boss')}` : '');
    $('briefSub').textContent = T(`ch_${CHAPTERS[Math.floor(m.id / STAGES_PER_CHAPTER)]!.key}`);
  } else {
    $('briefTitle').textContent = T('daily');
    $('briefSub').textContent = save.streak && save.streakDay >= m.day - 1 ? T('streak', { n: save.streak }) : T('dailyNew');
  }
  fillRivalCard($('briefRival'), rivalStyle(st), boss);
  $('briefTwists').innerHTML = twists(st).map((t) => `<li>${t}</li>`).join('');
  $('briefGoals').innerHTML = GOALS.map((b) => `<li class="${had & b ? '' : 'off'}">${goalText(b, st)}</li>`).join('');
  $('briefTip').textContent = m.kind === 'stage' ? T(`chtip_${CHAPTERS[Math.floor(m.id / STAGES_PER_CHAPTER)]!.key}`) : '';
  const best = m.kind === 'stage' ? (bestOf(save, m.hard)[m.id] ?? 0) : 0;
  $('briefBest').textContent = best ? T('bestTime', { t: fmtTime(best) }) : '';
  $('briefBest').classList.toggle('hidden', !best);
}

const LOSS_TIPS = 6;

/** The line under the results' stars: the campaign's end on winning its last stage, a tip
 *  (a different one each loss) on losing a stage, the daily or a quick match. */
function resultTip(m: MatchKind, won: boolean, save: Save): string {
  if (won && m.kind === 'stage' && !m.hard && m.id === STAGE_COUNT - 1) {
    const n = CHAPTERS.reduce((a, _, ch) => a + chapterStars(save.stages, ch), 0);
    return T('campaignDone', { n, t: STAGE_COUNT * GOALS.length });
  }
  return won ? '' : T(`ltip${save.losses % LOSS_TIPS}`);
}

/** The results' stars (null: a quick match, none), the next-stage button and the tip line
 *  (lost: whether the player lost, not merely failed to win; taken: the chests and camps taken). */
export function showStars(m: MatchKind, got: { now: number; before: number } | null, won: boolean, lost: boolean, save: Save, taken = 0): void {
  const tip = won || lost ? resultTip(m, won, save) : '';
  $('resTip').textContent = tip;
  $('resTip').classList.toggle('hidden', !tip);
  const box = $('resStars');
  const st = stageOf(m);
  box.classList.toggle('hidden', !got || !st);
  $('nextBtn').classList.toggle('hidden', !(got && got.now & GOAL_WIN && nextOpen(m, save)));
  if (!got || !st) return;
  box.innerHTML = GOALS.map((b) => {
    const cls = got.now & b ? (got.before & b ? 'on' : 'on new') : got.before & b ? 'had' : '';
    return `<div class="${cls}"><b>★</b>${goalText(b, st, taken)}</div>`;
  }).join('');
}
