// The campaign's screens (index.html): the chapter map with its stages and stars, the brief
// before a stage or the daily challenge (what is different there and the three goals), the menu's
// quick match difficulty and daily button, and the results' stars. What a match is (a stage, a
// quick match, the daily challenge) and what its result earns is decided here; game.ts runs it.

import { STD_SIEGE, sideSetup, type ConfigInput, type SideSetup } from '../sim/setup';
import {
  CHAPTERS, EVENTS_ON_MAP, GOAL_EVENTS, GOAL_PAR, GOAL_WIN, SKIRMISH, STAGE_COUNT, STAGES_PER_CHAPTER, chapterStars, dailyStage, dayNumber, goalsMet,
  nextStage, stageAt, stageConfig, stageLabel, stageOpen, type Stage,
} from './campaign';
import { $ } from './dom';
import { T } from './i18n';
import type { Save } from './save';

export type MatchKind = { kind: 'stage'; id: number } | { kind: 'quick' } | { kind: 'daily'; day: number };

export const fmtTime = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The stage a match is played on: a campaign stage, the day's challenge, or none (quick). */
export function stageOf(m: MatchKind): Stage | null {
  return m.kind === 'stage' ? stageAt(m.id) : m.kind === 'daily' ? dailyStage(m.day) : null;
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
    while (save.stages.length < m.id) save.stages.push(0);
    const before = save.stages[m.id] ?? 0;
    save.stages[m.id] = before | now;
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
  }
  return { now, before };
}

// ---------------- what a stage changes ----------------

const pct = (v: number) => `${v > 100 ? '+' : ''}${v - 100}%`;

/** One line per way the stage differs from a standard match: the rival's skill and style, each
 *  side's handicaps (said once for both when they are the same), the siege. */
export function twists(st: Stage): string[] {
  const you = sideSetup(st.you), rival = sideSetup(st.rival), std = sideSetup();
  const out: string[] = [T(`tw_skill${rival.skill}`)];
  if (rival.style) out.push(T(`tw_style${rival.style}`));
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
export function goalText(bit: number, st: Stage, short: boolean): string {
  if (bit === GOAL_WIN) return T('goal_win');
  if (bit === GOAL_EVENTS) return T(short ? 'goal_eventsShort' : 'goal_events', { n: Math.ceil(EVENTS_ON_MAP / 2), t: EVENTS_ON_MAP });
  return T(short ? 'goal_parShort' : 'goal_par', { t: fmtTime(st.par) });
}

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
}

/** The chapter map: chapter ch's seven stages, open or locked, with their stars. */
export function showChapter(save: Save, ch: number, pick: (id: number) => void): void {
  const c = CHAPTERS[ch]!;
  $('chName').textContent = T('chapterN', { n: ch + 1, name: T(`ch_${c.key}`) });
  $('chStars').textContent = `★ ${chapterStars(save.stages, ch)}/${STAGES_PER_CHAPTER * 3}`;
  $<HTMLButtonElement>('chPrev').disabled = ch === 0;
  $<HTMLButtonElement>('chNext').disabled = ch === CHAPTERS.length - 1;
  const grid = $('stageGrid');
  grid.textContent = '';
  for (let s = 0; s < STAGES_PER_CHAPTER; s++) {
    const id = ch * STAGES_PER_CHAPTER + s;
    const b = document.createElement('button');
    b.className = 'stage' + (s === STAGES_PER_CHAPTER - 1 ? ' boss' : '');
    const open = stageOpen(save.stages, id);
    b.disabled = !open;
    b.innerHTML = `<span>${open ? stageLabel(id) : '🔒'}</span><span class="st">${starsHtml(save.stages[id] ?? 0)}</span>`;
    if (open) b.addEventListener('click', () => pick(id));
    grid.appendChild(b);
  }
}

/** The chapter the campaign opens on: the one holding the next stage. */
export const chapterOfNext = (save: Save): number => Math.floor(nextStage(save.stages) / STAGES_PER_CHAPTER);

/** The brief before a stage or the daily challenge. */
export function showBrief(save: Save, m: Exclude<MatchKind, { kind: 'quick' }>): void {
  const st = stageOf(m)!;
  const had = m.kind === 'stage' ? (save.stages[m.id] ?? 0) : save.dailyDay === m.day ? save.dailyGoals : 0;
  if (m.kind === 'stage') {
    const boss = m.id % STAGES_PER_CHAPTER === STAGES_PER_CHAPTER - 1;
    $('briefTitle').textContent = T('stageN', { s: stageLabel(m.id) }) + (boss ? ` · ${T('boss')}` : '');
    $('briefSub').textContent = T(`ch_${CHAPTERS[Math.floor(m.id / STAGES_PER_CHAPTER)]!.key}`);
  } else {
    $('briefTitle').textContent = T('daily');
    $('briefSub').textContent = save.streak && save.streakDay >= m.day - 1 ? T('streak', { n: save.streak }) : T('dailyNew');
  }
  $('briefTwists').innerHTML = twists(st).map((t) => `<li>${t}</li>`).join('');
  $('briefGoals').innerHTML = GOALS.map((b) => `<li class="${had & b ? '' : 'off'}">${goalText(b, st, false)}</li>`).join('');
  $('briefTip').textContent = m.kind === 'stage' ? T(`chtip_${CHAPTERS[Math.floor(m.id / STAGES_PER_CHAPTER)]!.key}`) : '';
}

const LOSS_TIPS = 6;

/** The line under the results' stars: the campaign's end on winning its last stage, a tip
 *  (a different one each loss) on losing a stage, the daily or a quick match. */
function resultTip(m: MatchKind, won: boolean, save: Save): string {
  if (won && m.kind === 'stage' && m.id === STAGE_COUNT - 1) {
    const n = CHAPTERS.reduce((a, _, ch) => a + chapterStars(save.stages, ch), 0);
    return T('campaignDone', { n, t: STAGE_COUNT * GOALS.length });
  }
  return won ? '' : T(`ltip${save.losses % LOSS_TIPS}`);
}

/** The results' stars (null: a quick match, none), the next-stage button and the tip line
 *  (lost: whether the player lost, not merely failed to win). */
export function showStars(m: MatchKind, got: { now: number; before: number } | null, won: boolean, lost: boolean, save: Save): void {
  const tip = won || lost ? resultTip(m, won, save) : '';
  $('resTip').textContent = tip;
  $('resTip').classList.toggle('hidden', !tip);
  const box = $('resStars');
  const st = stageOf(m);
  box.classList.toggle('hidden', !got || !st);
  $('nextBtn').classList.toggle('hidden', !(m.kind === 'stage' && got && got.now & GOAL_WIN && m.id + 1 < STAGE_COUNT));
  if (!got || !st) return;
  box.innerHTML = GOALS.map((b) => {
    const cls = got.now & b ? (got.before & b ? 'on' : 'on new') : got.before & b ? 'had' : '';
    return `<div class="${cls}"><b>★</b>${goalText(b, st, true)}</div>`;
  }).join('');
}
