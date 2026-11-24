import { describe, expect, it } from 'vitest';
import { installCanvas } from '../test/canvasFakes';
import { TEAM_BLUE, TEAM_RED } from '../sim/rules';
import { TEAM_HUE } from './ground';
import { SKINS } from './skins';

// The battle screen's palette, pinned where it has already gone wrong three times -- twice in one
// direction, once in the other, all three against material that was not the reference.
//
// First cut: saturation 0.25 and half grey, snow at 0.02-0.09, which is concrete, not snow. The
// answer then was to push every theme up to 0.30-0.51 off an AI mock (D85). Measured on a real
// frame that read as cluttered and tiring, so the next answer was a saturation *budget*: the ground
// down to 0.12-0.14, nearly all the colour spent on the two territories (D86). Then the actual
// reference game turned up (D:/new/ref): its bare ground is #daa75c, saturation 0.578 at value
// 0.855 -- higher than anything this game has ever shipped -- and it reads perfectly calm, because
// the board is flat. No grain, no bevel, no dome, no vignette, one hairline grid, and no grid at
// all inside a territory. Colour was never the problem; texture and value noise were (D87).
//
// So these pin the reference's own numbers: the ground carries real chroma inside one narrow value
// band, the two territories are deliberately *unequal* (the enemy's land loud and lighter than the
// ground, your own calm, cool and darker), and the two border lines are the only near-pure colours
// anywhere in the game. See DECISIONS.md D85, D86, D87.

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

  it("carries the reference's own chroma, inside one narrow value band", () => {
    for (const t of tops) {
      const { s, v } = hsv(t.c);
      const where = `${t.sk} zone ${t.zone} shade ${t.k} (${t.c})`;
      // the reference's sand is 0.578; a board at a tenth of that was the 'budget' this replaces
      expect(s, where).toBeLessThanOrEqual(0.65);
      // the board stays light, and its darkest tile is no darker than the reference's own darker
      // sand band (#b27d4c, value 0.698). Value is what the eye reads as texture, so it is spent
      // deliberately: in zone-wide steps, never per tile.
      expect(v, where).toBeGreaterThanOrEqual(0.69);
      expect(v, where).toBeLessThanOrEqual(0.93);
    }
    const vs = tops.map((t) => hsv(t.c).v);
    expect(Math.max(...vs) - Math.min(...vs)).toBeLessThanOrEqual(0.24);
  });

  it('steps the value from zone to zone so the board has patches, not one field', () => {
    // the reference's bare ground is two value bands a sixth apart (0.855 and 0.702), which is what
    // makes it read as land instead of as a painted table. A first cut of this made the step one
    // hundredth 'to be felt, not seen' -- which is to say not there at all (D87, D88). A full sixth
    // across three zones would put the contested middle in shadow, so ours is about 0.095 of value
    // home country to middle -- six tenths of the reference's -- and the snow boards half of that.
    for (const sk of SKINS) {
      const step = hsv(sk.top[0][0]).v - hsv(sk.top[2][0]).v;
      expect(step, sk.key).toBeGreaterThanOrEqual(0.05);
      expect(step, sk.key).toBeLessThanOrEqual(0.11);
      // and it only ever gets darker, home country to contested middle
      expect(hsv(sk.top[1][0]).v, sk.key).toBeLessThan(hsv(sk.top[0][0]).v);
      expect(hsv(sk.top[2][0]).v, sk.key).toBeLessThan(hsv(sk.top[1][0]).v);
    }
  });

  it('draws the grid in its own colour, a shade darker and no more', () => {
    for (const sk of SKINS) {
      const g = hsv(sk.grid), t = hsv(sk.top[1][0]);
      // A tenth of value down and an eighth of saturation up. Measured twice off the reference, and
      // the second reading is the one these numbers keep: on *bright* sand its line is only 0.855 ->
      // 0.827, a thirtieth of value, and the cell reads from the lit rim along its lower edges
      // instead (ground.ts). The first reading, 14% down, came off a shadowed patch and made our
      // line nearly four times the reference's -- an inked outline on every hex, which is what made
      // the board look drawn. A 5% line, where this started, was the other extreme: at a phone's
      // zoom there was no honeycomb at all. See DECISIONS.md D88, D89.
      expect(g.v, sk.key).toBeLessThan(t.v);
      expect(t.v - g.v, sk.key).toBeGreaterThanOrEqual(0.055);
      expect(t.v - g.v, sk.key).toBeLessThanOrEqual(0.13);
      expect(g.s, sk.key).toBeGreaterThan(t.s);
      expect(hueGap(g.h, t.h), sk.key).toBeLessThan(6);
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

  it('makes the two territories unequal on purpose: enemy loud, own land calm', () => {
    const red = TEAM_HUE[TEAM_RED]!.top.map(hsv), blue = TEAM_HUE[TEAM_BLUE]!.top.map(hsv);
    const groundV = tops.map((t) => hsv(t.c).v), groundS = tops.map((t) => hsv(t.c).s);
    for (const r of red) {
      // the enemy's land is the alarm: louder and lighter than any bare ground on any board
      expect(r.s).toBeGreaterThan(Math.max(...groundS));
      expect(r.v).toBeGreaterThanOrEqual(Math.max(...groundV));
    }
    // snow is the one board paler than your own field, so saturation is measured against the
    // coloured boards and value -- which holds everywhere -- carries the reading on the snow ones
    const coloured = tops.filter((t) => SKINS.find((k) => k.key === t.sk)!.theme !== 'snow');
    for (const b of blue) {
      // your own land is the calm half: cooler, quieter and *darker* than the ground it sits in,
      // so a glance at the board shows only the part you are losing
      expect(b.s).toBeLessThan(Math.min(...coloured.map((t) => hsv(t.c).s)));
      expect(b.v).toBeLessThan(Math.min(...groundV));
    }
    expect(blue[0]!.h).toBeGreaterThan(195);
    expect(red[0]!.h).toBeLessThan(35);
  });

  it('keeps the two border lines the only near-pure colours in the game', () => {
    for (const tm of [TEAM_BLUE, TEAM_RED]) {
      const l = hsv(TEAM_HUE[tm]!.line);
      // the front, not a seam: nothing else on the board comes near this, which is what lets one
      // hairline carry what sixty bevels used to (ground.ts, D87)
      expect(l.s).toBeGreaterThanOrEqual(0.7);
      expect(l.v).toBeGreaterThanOrEqual(0.95);
      expect(l.s).toBeGreaterThan(Math.max(...tops.map((t) => hsv(t.c).s)) + 0.1);
    }
  });
});
