// The HTML panels over the canvas (index.html): menu, how-to, online lobby, campaign, brief, leaderboard, results, the
// pause menu, the achievements and the settings, and the corner buttons (sound, music, pause, leave, replay speed). Every text comes from i18n through data-t attributes, and the icon buttons' aria-labels through data-ta.

import { T } from './i18n';
import { settleFocus } from './panelKeys';
import type { Save } from './save';

export function $<E extends HTMLElement = HTMLElement>(id: string): E {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as E;
}

export type Panel = 'menu' | 'howto' | 'result' | 'online' | 'campaign' | 'brief' | 'board' | 'pause' | 'ach' | 'settings';
const PANELS: readonly Panel[] = ['menu', 'howto', 'result', 'online', 'campaign', 'brief', 'board', 'pause', 'ach', 'settings'];

let current: Panel | null = null;
/** The panel up now (null: none). */
export const openPanel = (): Panel | null => current;

/** Shows one panel (null: none, the match is on); the leave button shows during an online match
 *  and a replay, the speed button during a replay, the pause button during a solo match. The
 *  sound switch shows in a match, on the menu and in the pause menu; the music switch only on the
 *  menu. On the other panels both stay off the screen (the settings hold them): a corner token sat
 *  over a panel's own bottom button on a short phone. The music switch no longer takes the pause
 *  button's place either: a quick double tap on pause turned the music off. */
export function show(id: Panel | null, leave: boolean, watch: boolean, pause: boolean): void {
  current = id;
  // a button armed for a second tap (pauseMenu.ts) forgets it once the panels change
  for (const el of document.querySelectorAll<HTMLElement>('.armed')) {
    el.classList.remove('armed');
    el.textContent = T(el.getAttribute('data-t') ?? '');
  }
  for (const p of PANELS) $(p).classList.toggle('hidden', p !== id);
  $('leaveBtn').classList.toggle('hidden', !(id === null && leave));
  $('speedBtn').classList.toggle('hidden', !(id === null && watch));
  $('pauseBtn').classList.toggle('hidden', !(id === null && pause));
  $('muteBtn').classList.toggle('hidden', !(id === null || id === 'menu' || id === 'pause'));
  $('musicBtn').classList.toggle('hidden', id !== 'menu');
  settleFocus(id);
}

export function applyTexts(save: Save): void {
  document.title = T('title');
  for (const el of document.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = T(el.getAttribute('data-t') ?? '');
  // the icon buttons' screen-reader names: index.html holds the English ones until the table is in
  for (const el of document.querySelectorAll<HTMLElement>('[data-ta]')) el.setAttribute('aria-label', T(el.getAttribute('data-ta') ?? ''));
  $<HTMLInputElement>('codeIn').placeholder = T('codeHint');
  updateRecord(save);
  updateShare(save);
}

/** The menu's record line; kept invisible (its room kept) until the first match is over. */
export function updateRecord(save: Save): void {
  const el = $('record');
  el.textContent = T('record', { w: save.wins, l: save.losses });
  el.style.visibility = save.wins + save.losses + save.draws ? '' : 'hidden';
}

export function updateShare(save: Save): void {
  $<HTMLInputElement>('shareIn').checked = save.shareReplays;
}

export function updateMuteIcon(save: Save): void {
  $('muteBtn').classList.toggle('muted', save.muted);
  $('musicBtn').classList.toggle('muted', save.musicOff);
  $<HTMLInputElement>('optSfx').checked = !save.muted;
  $<HTMLInputElement>('optMusic').checked = !save.musicOff;
  showVolume('optSfxVol', save.sfxVol, save.muted);
  showVolume('optMusicVol', save.musicVol, save.musicOff);
}

/** A volume slider: its knob, its green fill, and greyed out while its sound is off. It stays
 *  draggable then: dragging it is how the sound comes back on (settings.ts). */
export function showVolume(id: string, pct: number, off: boolean): void {
  const el = $<HTMLInputElement>(id);
  el.value = String(off ? 0 : pct);
  el.style.setProperty('--v', `${off ? 0 : pct}%`);
  el.classList.toggle('off', off);
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
