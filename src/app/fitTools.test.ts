import { describe, expect, it } from 'vitest';
import { fitSteps } from './dom';
import { LANGS, T, loadLang, setLang } from './i18n';

// The quick match's difficulty words live in a tray that opens under the mode planks
// (index.html, #quickPop). Four long words carry the row off both edges of a narrow phone:
// Polish's "Latwy Normalny Trudny Brutalny" measured 384 px of a 360 px screen, with the last
// word past the right edge where the body's `overflow: hidden` cut it off. dom.ts fitTools
// shrinks the words to the room the row has; this is its arithmetic, run over the real words of
// all thirteen languages.
//
// The widths here are a stand-in for the browser's: the row's own width was measured live in
// Chrome at 360 px (Polish 384 px at 13 px, 344 px at 11 px) and the two numbers below were
// fitted to it, back when the medals and the gear shared the row -- they are corner tokens of
// their own since D78, so the only width the words do not scale is the segment frame itself. A
// stand-in is enough for what this guards -- that no language's words, however long, leave the
// row wider than the phone it is on -- but a change to the row's furniture belongs in FIXED, and
// the real check stays a look at the menu in the browser.

/** The row's width that the words do not scale: the segment frame's own border and gaps. */
const FIXED = 16;
/** A word's width in the game's font, per character per pixel of font size. */
const K = 0.62;

/** The narrowest screens the game is given, and the room a row has on each (the fit keeps 12 px). */
const SCREENS = [320, 360, 390, 414, 768];

function rowWidth(words: string[], fs: number, pad: number): number {
  const chars = words.reduce((n, w) => n + w.length, 0);
  return FIXED + chars * fs * K + 8 * pad;
}

describe('the menu tools row fits every language', () => {
  it('keeps the difficulty words, the medals and the gear on the screen', async () => {
    for (const lang of LANGS) {
      setLang(lang);
      await loadLang();
      const words = [0, 1, 2, 3].map((i) => T(`diff${i}`));
      for (const w of words) expect(w.length, `${lang} diff`).toBeGreaterThan(0);
      for (const screen of SCREENS) {
        const got = fitSteps(screen - 12, 13, 5, (fs, pad) => rowWidth(words, fs, pad));
        const where = `${lang} ${screen}px -> ${got.fs}px`;
        expect(rowWidth(words, got.fs, got.pad), where).toBeLessThanOrEqual(screen);
        expect(got.fs, where).toBeGreaterThanOrEqual(9);
      }
    }
    setLang('en');
    await loadLang();
  });

  it('leaves the words alone where the row has the room', () => {
    const fits = fitSteps(400, 13, 5, (fs, pad) => rowWidth(['Easy', 'Normal', 'Hard', 'Brutal'], fs, pad));
    expect(fits).toEqual({ fs: 13, pad: 5 });
  });

  it('stops at nine pixels rather than make a word unreadable', () => {
    const tiny = fitSteps(40, 13, 5, () => 999);
    expect(tiny.fs).toBe(9);
    expect(tiny.pad).toBe(3);
  });
});
