import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FITTED } from './dom';

// Every panel's words are measured against the screen they are on and stepped down where they do
// not fit (dom.ts refit). Three fits do it, each with its own idea of what to measure: fitButtons
// for the wooden buttons, fitTabs for a row of tabs, fitTools for the menu's difficulty segments.
// A button that is none of the three is measured by nothing, and the test for that cannot be a
// width: it is that the button was never looked at. The settings' three graphics modes were such a
// button for as long as they existed -- in Russian and Turkish their words sat two and five pixels
// past the card's edge, and no sweep of button widths would have said so, because the fit never
// ran on them. This holds index.html's own buttons to the list of what the fits cover.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** index.html's buttons, whole, with their contents (buttons do not nest). */
const buttons = (): string[] => [...readFileSync(`${ROOT}index.html`, 'utf8').matchAll(/<button\b[\s\S]*?<\/button>/g)].map((m) => m[0]);

/** A button draws a word when it, or something inside it, is given one (dom.ts applyTexts);
 *  data-ta is a screen reader's name for an icon button and is never drawn. */
const carriesAWord = (b: string): boolean => /\bdata-t="/.test(b);

/** The class a button is fitted by, or null: the three fits in FITTED. */
const fittedBy = (b: string): string | null => {
  const cls = /\bclass="([^"]*)"/.exec(b)?.[1]?.split(/\s+/) ?? [];
  if (cls.includes('btn')) return '.btn';
  if (cls.includes('tab')) return '.tab';
  // the menu's difficulty: the segments of #diffBtn, the one `.seg`, each marked with its level
  if (/\bdata-d="/.test(b)) return '.seg button';
  return null;
};

describe('every button that draws a word is fitted by something', () => {
  it('leaves none of index.html’s worded buttons outside the fits', () => {
    const loose = buttons().filter((b) => carriesAWord(b) && !fittedBy(b));
    expect(loose.map((b) => /\bid="([^"]*)"/.exec(b)?.[1] ?? b.slice(0, 60))).toEqual([]);
  });

  it('reads the page, so an empty scan is not a green test', () => {
    const all = buttons();
    expect(all.length).toBeGreaterThan(30);
    expect(all.filter(carriesAWord).length).toBeGreaterThan(25);
    // the icon buttons (the mute switch, the pause, the chapter arrows) carry no word of their own
    expect(all.filter((b) => !carriesAWord(b)).length).toBeGreaterThan(0);
  });

  it('checks the same three fits dom.ts says it runs', () => {
    expect(FITTED.split(',').map((s) => s.trim())).toEqual(['.btn', '.tab', '.seg button']);
  });
});
