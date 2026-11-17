import { beforeAll, describe, expect, it } from 'vitest';
import { Container, type Application } from 'pixi.js';
import { LANGS, loadLang, setLang } from '../app/i18n';
import { Engine } from '../sim/engine';
import { TEAM_BLUE, UNITS, type UnitKey } from '../sim/rules';
import { installCanvas } from '../test/canvasFakes';
import { Renderer } from './renderer';

// The screen-space juice drawn headless (canvasFakes.ts). Two things here are laid out in fixed
// pixels and so are the ones that break: the "new troop" card, whose three lines share the card's
// right half with no room to spare, and the hint slip above the bottom bar. The card is drawn in
// all thirteen languages, because the name on it is the longest word the game shows anywhere.

installCanvas();
const app = { stage: new Container(), screen: { width: 390, height: 844 }, renderer: { background: { color: 0 }, resolution: 2 } };
/** The card's own size, as CardView draws it. */
const CARD_W = 200, CARD_H = 92;
const SIZES: [number, number][] = [
  [390, 844], // a phone upright
  [844, 390], // the same phone sideways (the card goes top left)
  [768, 1024], // a tablet
  [1920, 1080], // a desktop
  [320, 180], // a portal's preview panel
  [240, 400], // a panel narrower still
];

let r: Renderer;
let eng: Engine;

/** Draws one card pop and hands back the card's container and the Texts on it. */
function card(unit: UnitKey, n: number, w = 390, h = 844): { root: Container; texts: { x0: number; x1: number; y0: number; y1: number }[] } {
  app.screen.width = w;
  app.screen.height = h;
  r.card = { unit, rarity: UNITS[unit].rarity, n, t: 0, life: 9 };
  // twice: the first frame lays the card out, the second proves the layout is not undone
  for (let i = 0; i < 2; i++) r.draw(eng, 0.5, 1 / 30, { look: true });
  const root = (r as unknown as { overlays: { cardView: { root: Container } } }).overlays.cardView.root;
  const texts = root.children
    .filter((c) => c.constructor.name === 'Text')
    .map((c) => {
      const b = c.getBounds();
      return { x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height };
    });
  return { root, texts };
}

beforeAll(() => {
  r = new Renderer(app as unknown as Application);
  eng = new Engine({ seed: 5, aiBlue: true, aiRed: true });
  r.setView(eng, TEAM_BLUE);
  // far enough in for the match to be being played (the hint slip only shows then)
  for (let i = 0; i < 120; i++) {
    eng.step([]);
    r.draw(eng, 0.5, 1 / 30, { look: true });
  }
});

describe('overlays layout', () => {
  it('keeps the new troop card’s three lines on the card, in every language', async () => {
    for (const lang of LANGS) {
      setLang(lang);
      await loadLang();
      for (const unit of Object.keys(UNITS) as UnitKey[]) {
        for (const n of [0, 5]) {
          const { root, texts } = card(unit, n);
          expect(texts.length).toBe(3);
          for (const t of texts) {
            const where = `${lang} ${unit} n=${n}: ${t.x0.toFixed(0)}..${t.x1.toFixed(0)} card ${root.x.toFixed(0)}..${(root.x + CARD_W).toFixed(0)}`;
            expect(t.x0, where).toBeGreaterThanOrEqual(root.x + 80);
            expect(t.x1, where).toBeLessThanOrEqual(root.x + CARD_W - 4);
            expect(t.y0, where).toBeGreaterThanOrEqual(root.y);
            expect(t.y1, where).toBeLessThanOrEqual(root.y + CARD_H);
          }
        }
      }
    }
    setLang('en');
    await loadLang();
  });

  it('keeps the card and the hint slip on screen, whatever the screen is', () => {
    r.hint = 'Tap a card next to a tile you own to flip it, then watch what comes out of it.';
    for (const [w, h] of SIZES) {
      const { root } = card('colossus', 0, w, h);
      const where = `${w}x${h}`;
      expect(root.x, where).toBeGreaterThanOrEqual(0);
      expect(root.x + CARD_W, where).toBeLessThanOrEqual(w);
      expect(root.y, where).toBeGreaterThanOrEqual(0);
      expect(root.y + CARD_H, where).toBeLessThanOrEqual(h);
      const over = (r as unknown as { overlays: { pill: { g: Container }; hintText: Container } }).overlays;
      for (const [name, c] of [['slip', over.pill.g], ['hint', over.hintText]] as const) {
        if (!c.visible) continue;
        const b = c.getBounds();
        if (b.width <= 0) continue;
        expect(b.x, `${where} ${name}`).toBeGreaterThanOrEqual(-0.5);
        expect(b.x + b.width, `${where} ${name}`).toBeLessThanOrEqual(w + 0.5);
        expect(b.y + b.height, `${where} ${name}`).toBeLessThanOrEqual(h - r.cam.hudBot + 0.5);
      }
    }
    r.hint = null;
  });
});
