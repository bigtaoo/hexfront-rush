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
  refit(id);
  settleFocus(id);
}

/** The menu's tools row -- the difficulty, the medals and the gear -- is held on one line (the
 *  gear on a row of its own looked lost). Four long difficulty words carry that row off both
 *  edges of a narrow phone: Polish's "Latwy Normalny Trudny Brutalny" measured 384 px of a 360 px
 *  screen, so the first word started off the left edge and the gear sat past the right one, where
 *  the body's `overflow: hidden` cut it off; Russian and Italian overflowed too. The words shrink
 *  to the room the row has. Only the words: every button keeps its 44 px height, so no tap target
 *  gets smaller, and the two knobs are the CSS variables --segFs and --segPad (index.html). */
export function fitTools(): void {
  const seg = $('diffBtn'), row = seg.parentElement, hold = row?.parentElement;
  // the menu hidden (display: none): nothing has a width to measure, and showing it runs this again
  if (!row || !hold || !row.getClientRects().length) return;
  seg.style.removeProperty('--segFs');
  seg.style.removeProperty('--segPad');
  const btn = seg.firstElementChild;
  if (!btn) return;
  const cs = getComputedStyle(btn), hs = getComputedStyle(hold);
  const fs0 = parseFloat(cs.fontSize) || 13, pad0 = parseFloat(cs.paddingLeft) || 10;
  // the row may sit a little wider than the box it is in, whose padding is cut for cards, so it
  // is given a little slack past that box; what it may not do is leave the screen. Lying down the
  // menu is two columns and the row is in the narrower one, so the box is the real limit there --
  // measured against the screen alone, the words kept their size and the gear left the column.
  const hr = hold.clientWidth - parseFloat(hs.paddingLeft) - parseFloat(hs.paddingRight);
  const room = Math.min(document.documentElement.clientWidth - 12, hr + 24);
  // two things go wrong here and they are measured against different things: the row leaving the
  // room it has, and the row handing its own children less than their words need. The fit is
  // given the worse of the two as one overflow to drive to nothing.
  fitSteps(0, fs0, pad0, (fs, pad) => {
    seg.style.setProperty('--segFs', `${fs}px`);
    seg.style.setProperty('--segPad', `${pad}px`);
    return Math.max(row.getBoundingClientRect().width - room, squeeze(row));
  });
}

/** The pixels a row's own children are short of: what their words need past the room the row
 *  handed them. A flex row never measures wider than the box it sits in, so a row whose children
 *  shrank looks fitted while their letters cross their wooden rims -- in Japanese the difficulty
 *  words squeezed the menu's medal button until its "3/10" sat past the button's edge, with the
 *  row itself measuring a tidy 280 px of 280. Counted into the fit, that squeeze shrinks the
 *  words instead. */
export function squeeze(row: Element): number {
  let over = 0;
  // scrollWidth and clientWidth are whole pixels of boxes that are not: a pixel apart is the
  // rounding, not a word that does not fit, and chasing it shrank every language to the floor
  for (const el of row.children) over += Math.max(0, el.scrollWidth - el.clientWidth - 1);
  return over;
}

/** The fit's own arithmetic, with the measuring left to the caller so a test can do it without a
 *  browser: the words step down a pixel at a time, the padding beside them with them, until the
 *  row fits the room it has. Nine pixels is as small as a word may get; below that it stops,
 *  because an unreadable difficulty is worse than a row that touches the edges. */
export function fitSteps(room: number, fs0: number, pad0: number, width: (fs: number, pad: number) => number): { fs: number; pad: number } {
  let fs = fs0, pad = pad0;
  for (let i = 0; i < 12 && width(fs, pad) > room && fs > 9.5; i++) {
    fs -= 1;
    pad = Math.max(3, pad - 0.7);
  }
  return { fs, pad };
}

/** A button holding a word it has no room for. The buttons of a row share that row's width
 *  (flex: 1 1 0), so one language's long word does not wrap -- it crosses the button's painted
 *  rim: Italian's "All'attacco!" asked 110 px of the brief's 100 px button and sat on the green
 *  frame at both ends. Such a word steps down until it fits; every other button is left alone,
 *  and no button's box, height or tap target moves.
 *
 *  The word is measured on one line, because the other way a word misses its room leaves no
 *  width behind at all: a label with a space in it breaks at the space and the button grows a
 *  second line instead, its scrollWidth as tidy as its clientWidth. Four of those on the menu of
 *  a 320 px-tall landscape phone carried the difficulty, the medals and the gear off the bottom
 *  of the screen, where the body's `overflow: hidden` cut them off; Chinese, Japanese, Russian,
 *  French and Italian each lost the whole row. What a word does when it still does not fit at
 *  the smallest size -- wrap, or cross the rim -- is the button's own business: the measuring
 *  line is taken off again before the fit returns. */
export function fitButtons(panel: HTMLElement): void {
  for (const b of panel.querySelectorAll<HTMLElement>('.btn')) {
    b.style.removeProperty('font-size');
    if (!b.getClientRects().length) continue;
    const fs0 = parseFloat(getComputedStyle(b).fontSize) || 16;
    b.style.whiteSpace = 'nowrap';
    const fs = fitFont(fs0, (f) => {
      b.style.fontSize = `${f}px`;
      const cs = getComputedStyle(b);
      return wordRoom(b.clientWidth, parseFloat(cs.paddingLeft), parseFloat(cs.paddingRight), wordWidth(b)) >= 0;
    });
    b.style.removeProperty('white-space');
    if (fs >= fs0) b.style.removeProperty('font-size');
  }
}

/** The pixels a button's own words have to spare on one line: the room inside its padding, less
 *  what the words need. Negative, and they do not fit. A pixel is given away to rounding, as
 *  everywhere else here: these are fractional boxes reported as whole numbers. */
export const wordRoom = (client: number, padL: number, padR: number, need: number): number => client - padL - padR + 1 - need;

/** The width a button's contents draw, whatever they are -- words, a count, a gear. */
function wordWidth(b: HTMLElement): number {
  const r = document.createRange();
  r.selectNodeContents(b);
  return r.getBoundingClientRect().width;
}

/** The button fit's own arithmetic, the measuring left to the caller so a test can do it without
 *  a browser: a pixel a step, down to seven tenths of the size the stylesheet asked for and never
 *  below eleven pixels -- a word too small to read is worse than one touching its frame. */
export function fitFont(fs0: number, fits: (fs: number) => boolean): number {
  const floor = Math.max(11, fs0 * 0.7);
  let fs = fs0;
  while (fs > floor && !fits(fs)) fs = Math.max(floor, fs - 1);
  return fs;
}

/** A row of tabs whose words are wider than the row. The tabs share it (index.html
 *  `.opt.q .tab { flex: 1 }`) and a flex item never shrinks below its longest word, so the row
 *  grows instead: in Russian and Turkish the settings' three graphics modes pushed their row two
 *  and five pixels past the card. The three words step down together, so the row stays even. */
export function fitTabs(panel: HTMLElement): void {
  for (const row of panel.querySelectorAll<HTMLElement>('.tabs')) {
    const tabs = [...row.querySelectorAll<HTMLElement>('.tab')];
    for (const t of tabs) t.style.removeProperty('font-size');
    if (!tabs.length || !row.getClientRects().length) continue;
    const fs0 = parseFloat(getComputedStyle(tabs[0]!).fontSize) || 14;
    const fs = fitFont(fs0, (f) => {
      for (const t of tabs) t.style.fontSize = `${f}px`;
      return row.scrollWidth <= row.clientWidth + 1;
    });
    if (fs >= fs0) for (const t of tabs) t.style.removeProperty('font-size');
  }
}

/** Every button whose word a fit measures and may shrink: the wooden buttons (fitButtons), the
 *  tab rows' tabs (fitTabs) and the menu's difficulty segments (fitTools). A button in index.html
 *  that carries a word and is none of these is fitted by nothing, and its longest translation
 *  crosses its rim unseen -- which is what the graphics tabs did. buttonFit.test.ts holds the page
 *  to this list. */
export const FITTED = '.btn, .tab, .seg button';

/** Every fit, for the panel just shown (dom.show) and again when the screen or the font changes
 *  under it (boot.ts). */
export function refit(id: Panel | null): void {
  if (!id) return;
  const panel = $(id);
  // what the last screen's fit left behind is not what this one is measured against
  for (const b of panel.querySelectorAll<HTMLElement>(FITTED)) b.style.removeProperty('font-size');
  if (id === 'menu') fitTools();
  fitButtons(panel);
  fitTabs(panel);
  if (id === 'menu') tuckCorners();
}

/** Two boxes sharing any of the screen. The corner check's own arithmetic, so a test can do it
 *  without a browser; a DOMRect is one of these. */
export const boxesTouch = (a: Box, b: Box): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
export type Box = { left: number; right: number; top: number; bottom: number };

/** The room kept clear around the corner tokens, so a row that merely grazes them is moved apart
 *  too: at a pixel's distance the gear and the switch read as one smudged knob. */
const CORNER_GAP = 6;

/** The menu is the one panel that keeps the sound and the music switch on the screen, and the
 *  menu's own bottom row -- the difficulty, the medals, the gear -- ends in the same corner they
 *  sit in. On a tall phone they are far apart. On a short one they are not: at 640x360 the music
 *  switch covered the right half of the gear, at 568x320 both switches lay over it completely,
 *  and a tap meant for the settings turned the music off instead. The switches step off the
 *  screen where they would touch the row. Nothing is lost by it: the settings hold both, one tap
 *  away on the gear that is now reachable, which is already how every other panel does without
 *  them. They are put back the moment the screen has the room again (boot.ts refits on resize),
 *  so a turned phone shows them again. */
function tuckCorners(): void {
  const row = $('menu').querySelector('.row.tools');
  const mute = $('muteBtn'), music = $('musicBtn');
  if (!row) return;
  // measured where they would be, not where the last screen left them: hidden, they have no box
  mute.classList.remove('hidden');
  music.classList.remove('hidden');
  const r = row.getBoundingClientRect();
  const near = { left: r.left - CORNER_GAP, right: r.right + CORNER_GAP, top: r.top - CORNER_GAP, bottom: r.bottom + CORNER_GAP };
  const clash = boxesTouch(near, mute.getBoundingClientRect()) || boxesTouch(near, music.getBoundingClientRect());
  mute.classList.toggle('hidden', clash);
  music.classList.toggle('hidden', clash);
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
