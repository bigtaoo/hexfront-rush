// Who the rival is: five characters, one per AI style (sim/setup.ts style 0-4), each with a name,
// a line and a portrait (an icon on a red disc, drawn here: no emoji, Playgama 4.3.2). The brief
// shows the rival's card (a crown on a boss); a boss stage opens with a banner and its own music.
// Names and lines come from the lang tables (rv_n<style>, rv_q<style>); the style's one-line
// description is tw_style<style>.

import { STAGES_PER_CHAPTER, type Stage } from './campaign';
import type { MatchKind } from './campaignUi';
import { T } from './i18n';
import type { Renderer } from '../view/renderer';

/** The portraits' icons, by style, in a 24×24 box on the disc (white on red). */
const ICON: readonly string[] = [
  // balanced: crossed swords
  '<path d="M6 5l11 11M18 5L7 16" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M13.5 18.5l5-5M5.5 13.5l5 5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="19.5" cy="19.5" r="1.6" fill="#fff"/><circle cx="4.5" cy="19.5" r="1.6" fill="#fff"/>',
  // builder: a pickaxe over a coin
  '<path d="M4 9.5Q12 2.5 20 9.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M12 6.5V21" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="17.5" cy="17.5" r="3.2" fill="#ffd76a" stroke="#8f5a12" stroke-width="1.2"/>',
  // warlord: a horned helmet
  '<path d="M6.5 15a5.5 5.5 0 0 1 11 0z" fill="#fff"/><path d="M5 16h14v2.6H5z" fill="#fff"/><path d="M7 11.5C4 11 3 8 4.2 4.8M17 11.5c3-.5 4-3.5 2.8-6.7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M11 18.6h2V21h-2z" fill="#fff"/>',
  // turtle: a shield with a tower's battlements
  '<path d="M12 3.2l7 2.8v5c0 4.8-2.9 7.9-7 9.8-4.1-1.9-7-5-7-9.8V6z" fill="#fff"/><path d="M9 10V8h1.5v1h1V8h1v1h1V8H15v2l-.8.8V15H9.8v-4.2z" fill="#c8402a"/>',
  // gambler: a die
  '<rect x="4.5" y="4.5" width="15" height="15" rx="3.2" fill="#fff"/><circle cx="8.6" cy="8.6" r="1.5" fill="#c8402a"/><circle cx="12" cy="12" r="1.5" fill="#c8402a"/><circle cx="15.4" cy="15.4" r="1.5" fill="#c8402a"/>',
];

const CROWN = '<svg class="crown" viewBox="0 0 24 14" aria-hidden="true"><path d="M2 12L3.5 3l5 4.5L12 1l3.5 6.5 5-4.5L22 12z" fill="#ffd76a" stroke="#8f5a12" stroke-width="1.4" stroke-linejoin="round"/></svg>';

/** The rival's portrait: its style's icon on a red disc. */
export const portrait = (style: number): string =>
  `<svg class="face" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#c8402a" stroke="#6b1d0c" stroke-width="2"/><g transform="translate(4 4)">${ICON[style] ?? ICON[0]}</g></svg>`;

export const rivalStyle = (st: Stage): number => st.rival.style ?? 0;
export const rivalName = (style: number): string => T(`rv_n${style}`);

/** A boss stage: the last of a chapter (on Normal or Hard). */
export const isBoss = (m: MatchKind): boolean => m.kind === 'stage' && m.id % STAGES_PER_CHAPTER === STAGES_PER_CHAPTER - 1;

/** The brief's rival card: the portrait (crowned on a boss), the name, the style and the line.
 *  The name and the texts are set as text, not markup. */
export function fillRivalCard(el: HTMLElement, style: number, boss: boolean): void {
  el.classList.toggle('boss', boss);
  el.innerHTML = `<div class="pic">${portrait(style)}${boss ? CROWN : ''}</div><div class="who"><b></b><span></span><i></i></div>`;
  el.querySelector('b')!.textContent = rivalName(style);
  el.querySelector('span')!.textContent = T(`tw_style${style}`);
  el.querySelector('i')!.textContent = T('quote', { q: T(`rv_q${style}`) });
}

/** A boss stage's opening banner, over the countdown: "Boss · <name>". */
export function bossIntro(r: Renderer, st: Stage): void {
  r.banner(`${T('boss')} · ${rivalName(rivalStyle(st))}`, { size: 44, life: 3.2, color: '#ffd76a', y: 0.3, band: 'rgba(107,29,12,0.7)' });
}
