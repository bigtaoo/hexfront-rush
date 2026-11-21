import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { menuHidden } from './campaignUi';
import { freshSave } from './save';

// The difficulty used to stand on the lobby as a permanent row of white segments: a setting, drawn
// louder than the button that starts a match (D78). It is a tray now -- #quickPop, opened by the
// quick match plank, closed again by dom.ts show() every time the lobby comes up. Three things
// have to stay true for that tray to work, and each has been got wrong once:
//   * it ships closed, or the lobby comes up with the setting hanging open under the planks;
//   * the first-play rule never names its contents, or a new player opens an empty tray;
//   * the words inside it are still the ones the fit measures (dom.ts FITTED, '.seg button').

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const html = (): string => readFileSync(`${ROOT}index.html`, 'utf8');

/** The tray, whole, as it ships in index.html. */
const tray = (): string => /<div class="pop[^"]*" id="quickPop">[\s\S]*?<\/div>\s*<\/div>/.exec(html())?.[0] ?? '';

describe('the quick match’s difficulty tray', () => {
  it('ships closed', () => {
    expect(/<div class="pop hidden" id="quickPop">/.test(html())).toBe(true);
  });

  it('holds the difficulty, and holds it inside the lobby’s own column', () => {
    expect(tray()).toContain('id="diffBtn"');
    // the planks and the tray are one column: the tray opens under them, not over the board
    const main = /<div class="menuMain">[\s\S]*?id="quickPop"/.exec(html());
    expect(main, 'the tray lives in .menuMain').not.toBeNull();
  });

  it('is the lobby’s only difficulty row', () => {
    const menu = /<div id="menu"[\s\S]*?\n<\/div>/.exec(html())?.[0] ?? html();
    expect([...menu.matchAll(/id="diffBtn"/g)]).toHaveLength(1);
  });

  it('is never emptied by the first-play rule', () => {
    // menuHidden hides the lobby's extras until the tutorial is done; the tray's contents are the
    // tray's business, so naming diffBtn there would leave a new player an empty tray to open
    for (const save of [freshSave(), { ...freshSave(), tutorialDone: true }]) {
      for (const onlineOk of [false, true]) {
        expect(Object.keys(menuHidden(save, onlineOk))).not.toContain('diffBtn');
      }
    }
  });
});
