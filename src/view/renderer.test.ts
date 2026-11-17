// The renderer needs no GPU to be built and stepped: Pixi only uploads anything when something is
// actually rendered, so a stage, a screen size and a fake 2D canvas are enough to watch the camera
// and the per-match juice follow the match.

import { describe, expect, it } from 'vitest';
import { Container, type Application } from 'pixi.js';
import { Engine } from '../sim/engine';
import { TEAM_BLUE } from '../sim/rules';
import { installCanvas } from '../test/canvasFakes';
import { Renderer } from './renderer';

installCanvas();

const fakeApp = (w = 390, h = 844) =>
  ({
    stage: new Container(),
    screen: { width: w, height: h },
    renderer: { background: { color: 0 }, resolution: 2 },
  }) as unknown as Application;

const engine = () => new Engine({ seed: 7, aiBlue: false, aiRed: false });
/** Enough frames for the zoom to finish gliding. */
const settle = (r: Renderer, eng: Engine): void => {
  for (let i = 0; i < 200; i++) r.draw(eng, 0, 0.016);
};

describe('renderer', () => {
  it('clears the juice of a match without moving the camera', () => {
    // online, a lag spike: the sim is fast-forwarded through the backlog and the juice of those
    // ticks is thrown away (game.ts). The camera is not juice -- clearing `overview` and `zoomK`
    // but not the scale left the match drawn at the overview's zoom for good, with `fitAll` true,
    // so nothing panned and the edge markers stayed away.
    const r = new Renderer(fakeApp());
    const eng = engine();
    r.setView(eng, TEAM_BLUE);
    r.draw(eng, 0, 0.016);
    const play = r.cam.scale;
    expect(r.fitAll).toBe(false);

    r.setOverview(true);
    settle(r, eng);
    expect(r.cam.scale).toBeCloseTo(r.cam.fitScale, 9);

    r.status = { text: 'anything' };
    r.hint = 'anything';
    r.reset();
    expect(r.status).toBe(null);
    expect(r.hint).toBe(null);
    // the player is still looking at the whole map, and can still zoom back in
    expect(r.overview).toBe(true);
    expect(r.cam.scale).toBeCloseTo(r.cam.fitScale, 9);
    r.setOverview(false);
    settle(r, eng);
    expect(r.cam.scale).toBeCloseTo(play, 9);
    expect(r.fitAll).toBe(false);
    r.destroy();
  });

  it('starts the next match at play zoom, whatever the last one left open', () => {
    const r = new Renderer(fakeApp());
    const eng = engine();
    r.setView(eng, TEAM_BLUE);
    r.draw(eng, 0, 0.016);
    const play = r.cam.scale;
    r.setOverview(true);
    settle(r, eng);

    const next = engine();
    r.reset();
    r.setView(next, TEAM_BLUE);
    expect(r.overview).toBe(false);
    expect(r.cam.scale).toBeCloseTo(play, 9);
    r.draw(next, 0, 0.016);
    expect(r.cam.scale).toBeCloseTo(play, 9);
    r.destroy();
  });
});
