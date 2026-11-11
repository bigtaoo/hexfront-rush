// The camera turns a screen of pixels into a view of the board: where the two HUD rails sit, how
// much of the map a play zoom shows, and which world point a tap landed on. It is the one piece of
// the view with real arithmetic in it, and the arithmetic is reversible — a tap goes screen to
// world and the sprites come back world to screen — so a sign or a factor wrong here does not
// throw, it just puts the board somewhere else and sends every tap to the wrong hex.

import { describe, expect, it } from 'vitest';
import type { Engine } from '../sim/engine';
import { FP } from '../sim/fixed';
import { NTILES } from '../sim/hex';
import { PHASE_PLAY, TEAM_BLUE, TEAM_RED } from '../sim/rules';
import { Camera } from './camera';
import { LOOK_B, LOOKB_VIEW } from './lookB';
import { MAP_X0, MAP_X1, MAP_Y0, MAP_Y1, SQRT3, VIEW_FLIP_Y, VIEW_HEXES, VIEW_ROWS } from './viewConst';

const MAP_W = MAP_X1 - MAP_X0, MAP_H = MAP_Y1 - MAP_Y0;
const VIEW = LOOK_B ? LOOKB_VIEW : { hexes: VIEW_HEXES, rows: VIEW_ROWS };
/** The screens the game actually meets: a desktop, a phone held up and lying down, a small tablet,
 *  the old 4:3 of a school laptop, and a portal's thumbnail panel. */
const SCREENS: [number, number][] = [
  [1920, 1080], [1366, 768], [390, 844], [844, 390], [768, 1024], [320, 480], [300, 120], [160, 90], [1, 1],
];
/** Enough of an Engine for the camera: it reads tile positions, live buildings and the phase. */
const TILES = Array.from({ length: NTILES }, (_, i) => ({ x: (i % 13) * 1732, y: Math.floor(i / 13) * 1500 }));
const engine = (): Engine => ({ tiles: TILES, units: [], blds: [], phase: PHASE_PLAY, introT: 0 }) as unknown as Engine;
const fresh = (W: number, H: number): Camera => {
  const c = new Camera();
  c.resize(W, H);
  return c;
};

describe('the screen layout', () => {
  it('leaves a play area between the two rails on every screen, down to a thumbnail', () => {
    // a portal lists a game in a small panel, and a desktop window can be dragged nearly shut.
    // The rails have a minimum height meant for a phone; taken as given on a screen shorter than
    // the two of them the play area comes out negative, and so does every scale drawn from it —
    // the board would be drawn mirrored and inside out and the camera clamp would collapse
    for (const [W, H] of SCREENS) {
      const c = fresh(W, H);
      const state = [W, H, c.hudTop > 0, c.hudBot > 0, c.hudTop + c.hudBot < H, c.availH > 0, c.fitScale > 0, c.scale > 0];
      expect(state).toEqual([W, H, true, true, true, true, true, true]);
      expect(c.playScale).toBeGreaterThanOrEqual(c.fitScale);
    }
  });

  it('keeps the board between the two rails on any frame big enough to see', () => {
    for (const [W, H] of SCREENS) {
      if (H < 60) continue; // below this the rails have given up everything and nothing is playable
      const c = fresh(W, H);
      expect([W, H, c.viewCY > c.hudTop, c.viewCY < H - c.hudBot]).toEqual([W, H, true, true]);
    }
  });

  it('gives the rails their full height on anything a player holds in a hand', () => {
    // the squeeze is for frames nobody plays in; a phone must be untouched by it
    for (const H of [272, 320, 480, 667, 844, 1080, 1440, 2400]) {
      const c = fresh(390, H);
      expect([H, c.hudTop]).toEqual([H, Math.max(58, Math.min(78, H * 0.085))]);
      expect([H, c.hudBot]).toEqual([H, Math.max(64, Math.min(92, H * 0.1))]);
    }
  });

  it('shows about the intended stretch of board at play zoom', () => {
    // the zoom takes whichever axis runs out first, so one of the two is tight and neither is
    // ever looser than asked for
    for (const [W, H] of [[390, 844], [1920, 1080], [844, 390]] as [number, number][]) {
      const c = fresh(W, H);
      const across = (c.W - 12) / c.playScale, down = c.availH / c.playScale;
      const tight = across <= SQRT3 * VIEW.hexes + 1e-9 || down <= 1.5 * VIEW.rows + 1.5 + 1e-9;
      expect([W, H, tight]).toEqual([W, H, true]);
    }
  });

  it('always has an overview worth opening: the map is taller than any screen shows', () => {
    // the map is 25 rows and a play view is about 8; no screen shape fits the whole of it at play
    // zoom, so the zoom button and the edge markers are always live during a match
    for (const [W, H] of SCREENS) {
      const c = fresh(W, H);
      expect([W, H, c.canZoom, c.fitAll]).toEqual([W, H, true, false]);
    }
  });

  it('takes the whole map in once the overview is open', () => {
    const c = fresh(390, 844);
    c.setView({ tiles: [] } as unknown as Engine, TEAM_BLUE);
    c.placeCamera((MAP_X0 + MAP_X1) / 2, (MAP_Y0 + MAP_Y1) / 2);
    c.setOverview(true);
    c.update({ units: [], tiles: [] } as unknown as Engine, 2, true); // a demo step glides the zoom home
    c.demo = false;
    c.update({ units: [] } as unknown as Engine, 2, true);
    expect(c.overview).toBe(false); // switching to the menu closes it
  });
});

describe('screen and world', () => {
  it('takes a tap back to the world point the sprite was drawn at', () => {
    for (const [W, H] of SCREENS) {
      const c = fresh(W, H);
      c.placeCamera((MAP_X0 + MAP_X1) / 2, (MAP_Y0 + MAP_Y1) / 2);
      for (const [vx, vy] of [[0, 0], [3.5, 7.25], [MAP_X1, MAP_Y1], [-2, -2]]) {
        const s = c.worldToScreen(vx!, vy!);
        const w = c.screenToWorld(s.x, s.y);
        // screenToWorld answers in world fixed point and un-flips y on the way
        expect(Math.abs(w.x / FP - vx!)).toBeLessThan(2 / FP);
        expect(Math.abs(c.vy(w.y / FP) - vy!)).toBeLessThan(2 / FP);
      }
    }
  });

  it('flips the board for red and only for red, and the flip is its own inverse', () => {
    const eng = { tiles: [{ x: 0, y: 0 }, { x: 1500, y: 3000 }] } as unknown as Engine;
    const blue = fresh(390, 844), red = fresh(390, 844);
    blue.setView(eng, TEAM_BLUE);
    red.setView(eng, TEAM_RED);
    expect(blue.flip).toBe(false);
    expect(red.flip).toBe(true);
    expect(blue.tv[1]).toEqual({ x: 1.5, y: 3 });
    expect(red.tv[1]).toEqual({ x: 1.5, y: VIEW_FLIP_Y - 3 });
    expect(red.vy(red.vy(3))).toBe(3);
    // forward is up for both sides: the far row is above the near one on screen
    const near = blue.tv[0]!, far = blue.tv[1]!;
    expect(far.y).toBeGreaterThan(near.y);
    expect(red.tv[1]!.y).toBeLessThan(red.tv[0]!.y);
  });

  it('resets the view when a new match sets it, so nothing carries over', () => {
    const c = fresh(390, 844);
    c.placeCamera(5, 5);
    c.setOverview(true);
    c.zoomK = 1;
    c.setView({ tiles: [] } as unknown as Engine, TEAM_BLUE);
    expect([c.cam, c.camGoal, c.overview, c.zoomK]).toEqual([null, null, false, 0]);
  });
});

describe('keeping the board on screen', () => {
  it('never lets the camera show past the edge of the map', () => {
    const c = fresh(390, 844);
    for (const [x, y] of [[-100, -100], [100, 100], [MAP_X0, MAP_Y0], [MAP_X1, MAP_Y1]]) {
      c.placeCamera(x!, y!);
      const half = c.W / 2 / c.scale, halfY = c.availH / 2 / c.scale;
      expect(c.cam!.x - half).toBeGreaterThanOrEqual(MAP_X0 - 1e-9);
      expect(c.cam!.x + half).toBeLessThanOrEqual(MAP_X1 + 1e-9);
      expect(c.cam!.y - halfY).toBeGreaterThanOrEqual(MAP_Y0 - 1e-9);
      expect(c.cam!.y + halfY).toBeLessThanOrEqual(MAP_Y1 + 1e-9);
    }
  });

  it('centres an axis the screen is wider than, rather than pinning it to an edge', () => {
    const c = fresh(1920, 1080); // wide enough to show the whole map across: x is the free axis
    c.placeCamera(-50, 6);
    expect(c.cam!.x).toBeCloseTo((MAP_X0 + MAP_X1) / 2, 9);
    expect(c.ox).toBeCloseTo(c.W / 2 - ((MAP_X0 + MAP_X1) / 2) * c.scale, 9);
  });

  it('drags with the finger 1:1, and not at all when the whole map is already shown', () => {
    const c = fresh(390, 844);
    c.placeCamera((MAP_X0 + MAP_X1) / 2, (MAP_Y0 + MAP_Y1) / 2);
    const before = c.cam!.y;
    c.panBy(0, 60);
    expect(c.cam!.y).toBeCloseTo(before - 60 / c.scale, 9);
    expect(c.camGoal).toEqual(c.cam); // a drag becomes the camera's goal, so it stays put
    // in the overview the whole map is on screen, so a drag has nowhere to go
    const zoomed = fresh(390, 844);
    zoomed.placeCamera(0, 0);
    zoomed.setView(engine(), TEAM_BLUE);
    zoomed.placeCamera(0, 0);
    zoomed.setOverview(true);
    zoomed.update(engine(), 5, false);
    expect(zoomed.fitAll).toBe(true);
    const at = { ...zoomed.cam! };
    zoomed.panBy(100, 100);
    expect(zoomed.cam).toEqual(at);
  });

  it('comes back from the overview centred on what the player tapped', () => {
    const c = fresh(390, 844);
    c.placeCamera(0, 0);
    c.setOverview(true);
    expect(c.overview).toBe(true);
    c.setOverview(false, { x: MAP_X1 / 2, y: MAP_Y1 - 1 });
    expect(c.overview).toBe(false);
    expect(c.camGoal!.x).toBeCloseTo(MAP_X1 / 2, 9);
    // the goal is already clamped, so the glide cannot aim off the map
    expect(c.camGoal!.y).toBeLessThanOrEqual(MAP_Y1 - c.availH / 2 / c.playScale + 1e-9);
  });

  it('aims a jump at play zoom even while the overview is open', () => {
    // tapping an edge marker while zoomed out means "take me there", not "show me the map there"
    const c = fresh(390, 844);
    c.placeCamera(0, 0);
    c.setOverview(true);
    c.lookAt(3, MAP_Y1 - 1);
    expect(c.overview).toBe(false);
    const halfY = c.availH / 2 / c.playScale; // clamped at the play zoom, not at the one on screen
    expect(c.camGoal!.y).toBeCloseTo(MAP_Y1 - halfY, 9);
  });
});

describe('the menu backdrop', () => {
  const demoEng = { units: [] } as unknown as Engine;

  it('fills the opening frame with board rather than table', () => {
    // the map is a tall column: at the demo zoom alone the table took half of a 16:9 frame, and
    // the first thing a player sees decides whether they stay
    for (const [W, H] of [[1920, 1080], [1366, 768], [390, 844]] as [number, number][]) {
      const c = fresh(W, H);
      c.update(demoEng, 1 / 60, true);
      const covers = MAP_W * c.scale >= W * 0.79 || MAP_H * c.scale >= H * 0.91;
      expect([W, H, covers]).toEqual([W, H, true]);
      expect(c.demo).toBe(true);
      expect(c.canZoom).toBe(false); // no zoom button on the menu
    }
  });

  it('comes back to the match zoom when the menu closes', () => {
    const c = fresh(390, 844);
    c.update(demoEng, 1 / 60, true);
    const menu = c.scale;
    c.setView(engine(), TEAM_BLUE);
    c.update(engine(), 1 / 60, false);
    expect(c.demo).toBe(false);
    expect(c.zoomK).toBe(0);
    expect(c.scale).toBeCloseTo(c.playScale, 9);
    expect(c.scale).not.toBeCloseTo(menu, 3);
  });
});
