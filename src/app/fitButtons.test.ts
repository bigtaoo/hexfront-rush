import { describe, expect, it } from 'vitest';
import { fitFont, squeeze } from './dom';
import { LANGS, T, loadLang, setLang } from './i18n';

// A row of buttons shares its width between them (index.html, `.btn { flex: 1 1 0 }` on the narrow
// screens), so a long word in one language does not wrap and does not widen its button -- it
// crosses the button's painted rim: Italian's "All'attacco!" asked 110 px of the brief's 100 px
// button and sat on the green frame at both ends. dom.ts fitButtons steps that one word down until
// it fits; this is its arithmetic, run over the real words of all thirteen languages.
//
// As in fitTools.test.ts the width here stands in for the browser's, fitted to a live measurement
// in Chrome at 320 px (Italian's "All'attacco!" 110 px at 18 px), and the real check stays a look
// at the panels in the browser. What this guards is that no language's button word is left over
// its button, and that none is shrunk past reading.

/** A word's width in the game's font, per character per pixel of font size. */
const K = 0.52;
/** The room the brief's and the result's buttons have on the narrowest screens the game is given. */
const BUTTONS = [
  { keys: ['go', 'back'], room: 100 },
  { keys: ['playAgain', 'menu'], room: 96 },
  { keys: ['nextStage'], room: 140 },
];
const FS0 = 18;

const width = (word: string, fs: number): number => word.length * fs * K;

describe('a button word stays inside its button in every language', () => {
  it('shrinks the word that does not fit, down to a size still worth reading', async () => {
    for (const lang of LANGS) {
      setLang(lang);
      await loadLang();
      for (const { keys, room } of BUTTONS) {
        for (const key of keys) {
          const word = T(key);
          expect(word.length, `${lang} ${key}`).toBeGreaterThan(0);
          const fs = fitFont(FS0, (f) => width(word, f) <= room);
          const where = `${lang} ${key} "${word}" -> ${fs}px`;
          // either the word is inside its button, or the fit has gone as small as it may go
          expect(width(word, fs) <= room || fs === Math.max(11, FS0 * 0.7), where).toBe(true);
          expect(fs, where).toBeGreaterThanOrEqual(11);
          expect(fs, where).toBeLessThanOrEqual(FS0);
        }
      }
    }
    setLang('en');
    await loadLang();
  });

  it('leaves a word that fits at the size the stylesheet asked for', () => {
    expect(fitFont(18, () => true)).toBe(18);
  });

  it('stops at seven tenths of the size rather than make a word unreadable', () => {
    expect(fitFont(20, () => false)).toBe(14);
    // and never below eleven pixels, however small the stylesheet's own size
    expect(fitFont(13, () => false)).toBe(11);
    expect(fitFont(10, () => false)).toBe(10);
  });
});

describe('a row counts what its children were squeezed by', () => {
  const row = (pairs: [number, number][]) =>
    ({ children: pairs.map(([scrollWidth, clientWidth]) => ({ scrollWidth, clientWidth })) }) as unknown as Element;

  it('adds up the pixels the children are short of', () => {
    expect(squeeze(row([[110, 100], [80, 80]]))).toBe(9);
  });

  it('is nothing where every child has its room', () => {
    expect(squeeze(row([[80, 80], [60, 90]]))).toBe(0);
  });

  it('forgives a pixel, which is the rounding of boxes that are not whole', () => {
    // scrollWidth and clientWidth are whole pixels of sub-pixel boxes: counted, that pixel kept
    // the fit stepping and shrank every language to its floor
    expect(squeeze(row([[81, 80], [61, 60]]))).toBe(0);
  });
});
