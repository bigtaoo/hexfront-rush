import { describe, expect, it } from 'vitest';
import { installCanvas } from '../test/canvasFakes';
import { TEAM_BLUE, TEAM_RED } from '../sim/rules';
import { TEAM_HUE } from './ground';
import { SKINS } from './skins';

// The battle screen's palette, pinned where it has already gone wrong twice -- once in each
// direction.
//
// First cut: saturation 0.25 and half grey, snow at 0.02-0.09, which is concrete, not snow. The
// answer then was to push every theme up to the reference's own 0.30-0.51 (D85). Measured on a real
// frame that overshot badly the other way: the whole picture came to saturation 0.54 against the
// reference's 0.33, and a plain tile, a tree standing on it and the card lying on it all landed at
// value 0.74-0.80 -- one value band where there have to be three. A board as colourful as the
// territory laid over it is what "cluttered and tiring" meant (D86).
//
// So the rule these pin is a *budget*, not a floor: the ground keeps its hue and almost none of its
// chroma, the two team washes get nearly all of it and are the loudest large areas on screen, and
// the small marks that are meant to be seen -- the ponds -- stay saturated because they are small.
// Nothing on the ground borrows the blue team's periwinkle. See DECISIONS.md D85, D86.

installCanvas();

/** Hue in degrees, saturation and value, from a #rrggbb string. */
function hsv(hex: string): { h: number; s: number; v: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h, s: mx === 0 ? 0 : d / mx, v: mx };
}
/** Degrees between two hues, the short way round. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
/** The hues the two teams own: nothing on the ground may wear the blue one. */
const TEAM_BLUE_H = hsv(TEAM_HUE[TEAM_BLUE]!.top[0]).h;

const tops = SKINS.flatMap((sk) =>
  sk.top.flatMap((pair, zone) => pair.map((c, k) => ({ sk: sk.key, zone, k, c }))));

describe("the map's palette", () => {
  it('paints twelve skins, four per theme', () => {
    expect(SKINS).toHaveLength(12);
    for (const theme of ['meadow', 'desert', 'snow']) {
      expect(SKINS.filter((s) => s.theme === theme)).toHaveLength(4);
    }
  });

  it('gives every ground tile a hue: none of them is a grey', () => {
    for (const t of tops) {
      // a hint of hue, but a hue: 0.05 is the snow floor. At zero a tile is literally grey and the
      // three themes stop telling themselves apart, which is where the first cut went wrong (D85).
      expect(hsv(t.c).s, `${t.sk} zone ${t.zone} shade ${t.k} (${t.c})`)
        .toBeGreaterThanOrEqual(0.05);
    }
  });

  it('spends almost no colour on the ground, so the team washes can have it all', () => {
    for (const t of tops) {
      // the budget, and the reason the board stopped being tiring: nothing the ground wears may get
      // within reach of a team wash (0.46-0.52), or who-owns-what goes back to being unreadable.
      expect(hsv(t.c).s, `${t.sk} zone ${t.zone} shade ${t.k} (${t.c})`).toBeLessThanOrEqual(0.16);
      // and the board is the lightest large surface in the game, under everything standing on it
      expect(hsv(t.c).v, `${t.sk} zone ${t.zone} shade ${t.k} (${t.c})`).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('still tells the three themes apart by saturation, desert warmest of them', () => {
    const satOf = (theme: string) =>
      Math.max(...tops.filter((t) => SKINS.find((s) => s.key === t.sk)!.theme === theme)
        .map((t) => hsv(t.c).s));
    // desert > meadow > snow, the same order as before, just an eighth of the distance apart
    expect(satOf('desert')).toBeGreaterThan(satOf('meadow'));
    expect(satOf('meadow')).toBeGreaterThan(satOf('snow'));
  });

  it('keeps the snow themes the brightest board, and warm rather than blue', () => {
    for (const sk of SKINS.filter((s) => s.theme === 'snow')) {
      // the home band of a snow skin is the lightest ground in the game
      expect(hsv(sk.top[0][0]).v).toBeGreaterThanOrEqual(0.87);
      for (const pair of sk.top) {
        // rosy ivory through gold and olive to green: the whole fan is on the warm side of 120
        expect(hsv(pair[0]).h).toBeLessThanOrEqual(120);
      }
    }
  });

  it('never paints ground or water in the blue team\'s hue', () => {
    for (const t of tops) expect(hueGap(hsv(t.c).h, TEAM_BLUE_H)).toBeGreaterThan(45);
    for (const sk of SKINS) {
      if (!sk.water) continue;
      for (const c of sk.water) expect(hueGap(hsv(c).h, TEAM_BLUE_H)).toBeGreaterThan(30);
    }
  });

  it('paints every pond a green-teal, well away from the bank it is cut into', () => {
    for (const sk of SKINS) {
      if (!sk.water) continue;
      const w = hsv(sk.water[0]);
      expect(w.h).toBeGreaterThan(150);
      expect(w.h).toBeLessThan(200);
      expect(w.s).toBeGreaterThan(0.3);
      // a pond is a different colour family from the ground it sits in, not a shade of it
      expect(hueGap(w.h, hsv(sk.top[2][0]).h)).toBeGreaterThan(40);
    }
  });

  it("holds both team washes high and light, so the field reads as that team's land", () => {
    for (const tm of [TEAM_BLUE, TEAM_RED]) {
      for (const c of TEAM_HUE[tm]!.top) {
        const { s, v } = hsv(c);
        // high: a wash at 0.24 stopped reading as territory at all. light: value is what keeps the
        // roofs and the troops on top of it, so the hue can rise without the field swallowing them.
        expect(s).toBeGreaterThanOrEqual(0.4);
        expect(v).toBeGreaterThanOrEqual(0.85);
        // and loud against the ground, by a wide margin: this is where the whole budget went (D86)
        expect(s).toBeGreaterThan(3 * Math.max(...tops.map((t) => hsv(t.c).s)));
      }
    }
    expect(hsv(TEAM_HUE[TEAM_BLUE]!.top[0]).h).toBeGreaterThan(195);
    expect(hsv(TEAM_HUE[TEAM_RED]!.top[0]).h).toBeLessThan(35);
  });
});
