import { describe, expect, it } from 'vitest';
import { Container, type Application } from 'pixi.js';
import { Engine } from '../sim/engine';
import { TEAM_BLUE } from '../sim/rules';
import { installCanvas } from '../test/canvasFakes';
import { Renderer } from './renderer';

// The HUD built and drawn headless (canvasFakes.ts), over the screens the game is given: a phone
// upright and sideways, a tablet, two desktops, and the thumbnail-sized frames a portal's preview
// panel hands it. Nothing the HUD draws may leave the screen: the bars are the only place the
// player's own fingers do not reach, and a slot's wooden frame hanging off the bottom edge was the
// one thing the eye catches at a glance.

installCanvas();
const app = { stage: new Container(), screen: { width: 390, height: 844 }, renderer: { background: { color: 0 }, resolution: 2 } };
const SIZES: [number, number][] = [
  [390, 844], // a phone upright
  [844, 390], // the same phone sideways
  [768, 1024], // a tablet
  [1920, 1080], // a desktop
  [2560, 1080], // an ultrawide one
  [320, 180], // a portal's preview panel
  [240, 400], // a panel narrower still
];

/** Draws a match on a screen of this size and returns the HUD's children, with their bounds. */
function hudOn(r: Renderer, w: number, h: number, status = true): { name: string; x0: number; y0: number; x1: number; y1: number }[] {
  app.screen.width = w;
  app.screen.height = h;
  const eng = new Engine({ seed: 5, aiBlue: true, aiRed: true });
  r.setView(eng, TEAM_BLUE);
  r.status = status ? { text: '42 ms' } : null;
  // far enough in for the quest, the gold and the wave countdown to be saying something
  for (let i = 0; i < 120; i++) {
    eng.step([]);
    for (const e of eng.events) r.onEvent(e);
    r.draw(eng, 0.5, 1 / 30, { look: true });
  }
  const root = (r as unknown as { hud: { root: Container } }).hud.root;
  return root.children
    .filter((c) => c.visible)
    .map((c) => {
      const b = c.getBounds();
      return { name: c.constructor.name, x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
    })
    .filter((b) => b.x1 > b.x0 && b.y1 > b.y0);
}

describe('hud layout', () => {
  it('keeps every part of the bars on screen, whatever the screen is', () => {
    const r = new Renderer(app as unknown as Application);
    for (const [w, h] of SIZES) {
      const parts = hudOn(r, w, h);
      expect(parts.length).toBeGreaterThan(4);
      for (const p of parts) {
        const where = `${w}x${h} ${p.name} ${p.x0.toFixed(0)},${p.y0.toFixed(0)}..${p.x1.toFixed(0)},${p.y1.toFixed(0)}`;
        expect(p.x0, where).toBeGreaterThanOrEqual(-0.5);
        expect(p.y0, where).toBeGreaterThanOrEqual(-0.5);
        expect(p.x1, where).toBeLessThanOrEqual(w + 0.5);
        expect(p.y1, where).toBeLessThanOrEqual(h + 0.5);
      }
    }
    r.destroy();
  });

  it('leaves the play area between the bars clear', () => {
    const r = new Renderer(app as unknown as Application);
    for (const [w, h] of SIZES) {
      // the link line is the one thing drawn outside the bars, just over the bottom one
      const parts = hudOn(r, w, h, false);
      const cam = r.cam;
      expect(cam.hudTop + cam.hudBot).toBeLessThan(h);
      // the two shared Graphics hold both bars at once (the rails, the frames), so they span the
      // screen by design; every text and number belongs to one bar alone
      for (const p of parts.filter((q) => q.name !== 'Graphics')) {
        const inTop = p.y1 <= cam.hudTop + 0.5;
        const inBot = p.y0 >= h - cam.hudBot - 0.5;
        expect(inTop || inBot, `${w}x${h} ${p.name} ${p.y0.toFixed(0)}..${p.y1.toFixed(0)} bars ${cam.hudTop.toFixed(0)}/${cam.hudBot.toFixed(0)}`).toBe(true);
      }
    }
    r.destroy();
  });
});
