// Who the rival is: five characters, one per AI style (sim/setup.ts style 0-4), each with a name,
// a line and a portrait (its wooden figure from the units' atlas on a red disc: no emoji, Playgama 4.3.2). The brief
// shows the rival's card (a crown on a boss); a boss stage opens with a banner and its own music.
// Names and lines come from the lang tables (rv_n<style>, rv_q<style>); the style's one-line
// description is tw_style<style>.

import { STAGES_PER_CHAPTER, type Stage } from './campaign';
import type { MatchKind } from './campaignUi';
import { T } from './i18n';
import type { Renderer } from '../view/renderer';
import atlasJson from '../assets/atlas.json';
import atlasUrl from '../assets/atlas.webp?url';

/** The atlas sheet's size (atlas.json meta), which the figure's viewBox is cut from. */
const { w: ATLAS_W, h: ATLAS_H } = atlasJson.meta.size;

/** The portraits: each style's own wooden toy from the units' atlas (the Tripo figures the board
 *  uses), stood on a red disc. An icon here was the one flat drawing on a screen of toys. */
const FACE: readonly string[] = [
  'guard_red', // balanced
  'militia_red', // builder
  'ogre_red', // warlord
  'shield_red', // turtle
  'adept_red', // gambler
];
const frameOf = (key: string) => (atlasJson as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> }).frames[key]?.frame;

const CROWN = '<svg class="crown" viewBox="0 0 24 14" aria-hidden="true"><path d="M2 12L3.5 3l5 4.5L12 1l3.5 6.5 5-4.5L22 12z" fill="#ffd76a" stroke="#8f5a12" stroke-width="1.4" stroke-linejoin="round"/></svg>';

/** The rival's portrait: its style's figure (cut out of the atlas by an inner viewBox) on a red disc. */
export const portrait = (style: number): string => {
  const f = frameOf(FACE[style] ?? FACE[0]!);
  const fig = f
    ? `<svg x="3" y="1" width="26" height="29" viewBox="${f.x} ${f.y} ${f.w} ${f.h}"><image href="${atlasUrl}" width="${ATLAS_W}" height="${ATLAS_H}"/></svg>`
    : '';
  return `<svg class="face" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#c8402a" stroke="#6b1d0c" stroke-width="2"/><circle cx="16" cy="16" r="12" fill="#e8674a"/>${fig}</svg>`;
};

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
