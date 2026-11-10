// The HTML panels over the canvas (index.html): menu, how-to, online lobby, campaign, brief, leaderboard, results, the
// pause menu and the achievements, and the corner buttons (sound, music, pause, leave, replay speed). Every text comes from i18n through data-t attributes.

import { T } from './i18n';
import type { Save } from './save';

export function $<E extends HTMLElement = HTMLElement>(id: string): E {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as E;
}

export type Panel = 'menu' | 'howto' | 'result' | 'online' | 'campaign' | 'brief' | 'board' | 'pause' | 'ach';
const PANELS: readonly Panel[] = ['menu', 'howto', 'result', 'online', 'campaign', 'brief', 'board', 'pause', 'ach'];

/** Shows one panel (null: none, the match is on); the leave button shows during an online match
 *  and a replay, the speed button during a replay, the pause button during a solo match. The
 *  music switch shows beside the sound one whenever a panel is up (in a match only the sound one). */
export function show(id: Panel | null, leave: boolean, watch: boolean, pause: boolean): void {
  for (const p of PANELS) $(p).classList.toggle('hidden', p !== id);
  $('leaveBtn').classList.toggle('hidden', !(id === null && leave));
  $('speedBtn').classList.toggle('hidden', !(id === null && watch));
  $('pauseBtn').classList.toggle('hidden', !(id === null && pause));
  $('musicBtn').classList.toggle('hidden', id === null);
}

export function applyTexts(save: Save): void {
  document.title = T('title');
  for (const el of document.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = T(el.getAttribute('data-t') ?? '');
  $<HTMLInputElement>('codeIn').placeholder = T('codeHint');
  updateRecord(save);
  updateShare(save);
}

export function updateRecord(save: Save): void {
  $('record').textContent = T('record', { w: save.wins, l: save.losses });
}

export function updateShare(save: Save): void {
  $<HTMLInputElement>('shareIn').checked = save.shareReplays;
}

export function updateMuteIcon(save: Save): void {
  $('muteBtn').classList.toggle('muted', save.muted);
  $('musicBtn').classList.toggle('muted', save.musicOff);
}

/** The score counts up from 0 once its chip has popped in; the last value always lands. */
export function countUp(el: HTMLElement, to: number, delay: number, still: () => boolean): void {
  el.textContent = '0';
  const t0 = performance.now() + delay;
  const len = 700;
  const step = (now: number) => {
    const u = Math.min(1, Math.max(0, (now - t0) / len));
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - u, 3))));
    if (u < 1 && still()) requestAnimationFrame(step);
    else el.textContent = String(to);
  };
  requestAnimationFrame(step);
}

/** Restarts a CSS reveal animation on `el`. */
export function replay(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
