import { describe, expect, it } from 'vitest';
import { installCanvas } from '../test/canvasFakes';
import { TEAM_BLUE, TEAM_RED } from '../sim/rules';
import { PATCH_D, PATCH_N, TEAM_LINE, groundPatches, mix, teamLook } from './ground';
import { generateMap } from '../sim/map';
import { SKINS } from './skins';

// The battle screen's palette, pinned where it has already gone wrong four times -- and all four
// times against material that was not the reference, or against only one corner of it.
//
// First cut: saturation 0.25 and half grey, snow at 0.02-0.09, which is concrete, not snow. The
// answer then was to push every theme up to 0.30-0.51 off an AI mock (D85). Measured on a real
// frame that read as cluttered and tiring, so the next answer was a saturation *budget*: the ground
// down to 0.12-0.14, nearly all the colour spent on the two territories (D86). Then the actual
// reference game turned up (D:/new/ref): its bare ground is #daa75c, saturation 0.578 at value
// 0.855 -- higher than anything this game had shipped -- and it reads perfectly calm, because the
// board is flat. No grain, no bevel, no dome, no vignette, one hairline grid, and no grid at all
// inside a territory. Colour was never the problem; texture and value noise were (D87).
//
// The fourth was the subtle one: that reading was right, and was then applied to all three themes
// as if sand were the only biome the reference has. Reading all 122 of its frames shows four, and
// three of them are dark -- sand V0.85, snow V0.89, forest V0.44, night V0.28, with no bright
// yellow-green anywhere. Our sprites have a median value of 0.26-0.54, so a V0.84 meadow made the
// ground the brightest thing on screen and left every piece on it able to depart downward only.
// So these now pin a *per-theme* value band rather than one board-wide one, and the territories are
// no longer a hand-authored pair at all: they are mixed off whichever ground they sit on, which is
// the rule the reference's own territory patches fit to within five parts in 255.
// See DECISIONS.md D85, D86, D87, D91.

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
/** The largest difference between two #rrggbb colours, in channel steps out of 255. */
function apart(a: string, b: string): number {
  const ch = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const x = ch(a), y = ch(b);
  return Math.max(...x.map((v, i) => Math.abs(v - y[i]!)));
}
/** The hue the blue team owns: nothing on the ground may wear it. */
const TEAM_BLUE_H = hsv(TEAM_LINE[TEAM_BLUE]!).h;

const tops = SKINS.flatMap((sk) =>
  sk.top.flatMap((pair, zone) => pair.map((c, k) => ({ sk: sk.key, zone, k, c }))));
const themeOf = (key: string) => SKINS.find((s) => s.key === key)!.theme;

/** The value band each theme's ground lives in, measured off the reference's own biomes: its sand
 *  is 0.855, its snow 0.89, its forest 0.44. Every tile of a theme sits inside its band, and the
 *  three bands do not overlap -- value is what tells the themes apart. */
const BAND: Record<string, [number, number]> = {
  snow: [0.84, 0.96],
  desert: [0.7, 0.9],
  meadow: [0.37, 0.56],
};

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

  it("carries the reference's own chroma, each theme inside its own value band", () => {
    for (const t of tops) {
      const { s, v } = hsv(t.c);
      const where = `${t.sk} zone ${t.zone} shade ${t.k} (${t.c})`;
      // the reference's sand is 0.578; a board at a tenth of that was the 'budget' this replaces
      expect(s, where).toBeLessThanOrEqual(0.65);
      const [lo, hi] = BAND[themeOf(t.sk)]!;
      expect(v, where).toBeGreaterThanOrEqual(lo);
      expect(v, where).toBeLessThanOrEqual(hi);
    }
    // and the three are ordered, lightest board to darkest: snow, desert, meadow, at both ends of
    // each theme's range. The bands themselves overlap a little -- the lightest sand (0.886) is
    // above the darkest snow (0.847) -- so the ordering is what is pinned, not a gap.
    const vOf = (theme: string) => tops.filter((t) => themeOf(t.sk) === theme).map((t) => hsv(t.c).v);
    for (const pick of [Math.min, Math.max]) {
      expect(pick(...vOf('snow'))).toBeGreaterThan(pick(...vOf('desert')));
      expect(pick(...vOf('desert'))).toBeGreaterThan(pick(...vOf('meadow')));
    }
    // and inside ONE skin the whole board stays in a narrow band: value is spent on the zone step
    // and on nothing else, never per tile. That is the part of D87 that still holds everywhere.
    for (const sk of SKINS) {
      const vs = sk.top.flatMap((pair) => pair.map((c) => hsv(c).v));
      expect(Math.max(...vs) - Math.min(...vs), sk.key).toBeLessThanOrEqual(0.12);
    }
  });

  it('steps the value from zone to zone so the board has patches, not one field', () => {
    // the reference's bare sand is two value bands a sixth apart (0.855 and 0.702), which is what
    // makes it read as land instead of as a painted table. A first cut of this made the step one
    // hundredth 'to be felt, not seen' -- which is to say not there at all (D87, D88). A full sixth
    // across three zones would put the contested middle in shadow, so ours is 0.076-0.095 of value
    // home country to middle, and about 0.056 on the near-white snow boards.
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
      // zoom there was no honeycomb at all. The floor is a tenth of the *dark* boards' value, which
      // is a smaller absolute step than the same tenth on sand. See DECISIONS.md D88, D89, D91.
      expect(g.v, sk.key).toBeLessThan(t.v);
      // and darker than the *contested middle* too, which is the darkest zone: a grid generated
      // off the home band instead came out lighter than the middle row on the dark boards, so the
      // honeycomb inverted halfway up the map. It is taken off zone 1, the open field (D91).
      expect(g.v, sk.key).toBeLessThan(hsv(sk.top[2][0]).v);
      expect(t.v - g.v, sk.key).toBeGreaterThanOrEqual(0.03);
      expect(t.v - g.v, sk.key).toBeLessThanOrEqual(0.13);
      expect(g.s, sk.key).toBeGreaterThan(t.s);
      expect(hueGap(g.h, t.h), sk.key).toBeLessThan(6);
    }
  });

  it('still tells the three themes apart by saturation, desert warmest of them', () => {
    const satOf = (theme: string) =>
      Math.max(...tops.filter((t) => themeOf(t.sk) === theme).map((t) => hsv(t.c).s));
    expect(satOf('desert')).toBeGreaterThan(satOf('meadow'));
    expect(satOf('meadow')).toBeGreaterThan(satOf('snow'));
  });

  it('keeps the snow themes the lightest board, and a white rather than a blue one', () => {
    for (const sk of SKINS.filter((s) => s.theme === 'snow')) {
      // the home band of a snow skin is the lightest ground in the game
      expect(hsv(sk.top[0][0]).v).toBeGreaterThanOrEqual(0.87);
      for (const pair of sk.top) {
        // The reference's snow is #d9e3e4 -- cool, but saturation 0.05: a white with a breath of
        // blue in it, not a blue board. An earlier cut read "no snow may drift toward the team's
        // blue" as a reason to make snow *warm* cream, which is the one thing snow is not. The
        // protection is the chroma, not the hue: at this saturation there is no blue to read.
        expect(hsv(pair[0]).s, sk.key).toBeLessThanOrEqual(0.12);
      }
    }
  });

  it("never paints ground or water in the blue team's hue", () => {
    for (const t of tops) {
      const { h, s } = hsv(t.c);
      // either it carries no chroma worth confusing (the snow boards) or it is well off the hue
      if (s > 0.15) expect(hueGap(h, TEAM_BLUE_H), `${t.sk} (${t.c})`).toBeGreaterThan(30);
    }
    for (const sk of SKINS) {
      if (!sk.water) continue;
      for (const c of sk.water) expect(hueGap(hsv(c).h, TEAM_BLUE_H), sk.key).toBeGreaterThan(30);
    }
  });

  it('paints every pond a green-teal, well away from the bank it is cut into', () => {
    for (const sk of SKINS) {
      if (!sk.water) continue;
      const w = hsv(sk.water[0]);
      expect(w.h).toBeGreaterThan(150);
      expect(w.h).toBeLessThan(200);
      expect(w.s).toBeGreaterThan(0.3);
      // and it reads against the bank by VALUE, not by hue. Hue was the old rule and it cannot
      // hold any more: on the teal meadow boards a green-teal pond is three degrees off the ground
      // it sits in, and on sand the same pond is a hundred and thirty off. What is true on every
      // board is the value step -- a pond is 0.10 to 0.27 away from its bank, darker than sand and
      // lighter than forest -- and that is what stops it reading as a hole (D91).
      expect(Math.abs(w.v - hsv(sk.top[2][0]).v), sk.key).toBeGreaterThan(0.08);
    }
  });

  it("mixes each territory off its own ground, by the reference's own 0.55", () => {
    // The reference's four measured territory patches, across two different biomes, are all one
    // formula: mix(the ground, the team's line colour, 0.55). On its sand the match is exact; on
    // its forest green it is within five parts in 255. What used to look like a deliberate
    // asymmetry here -- the enemy's land loud and light, your own calm and dark -- is that one mix
    // plus hue arithmetic, because both line colours are value 1.0 and warm sand has almost no blue
    // in it to raise. So the rule is pinned, not the pair it used to produce.
    const refSand = '#daa75c', refForest = '#357167';
    expect(apart(mix(refSand, TEAM_LINE[TEAM_RED]!, 0.55), '#ee6745')).toBeLessThanOrEqual(8);
    expect(apart(mix(refSand, TEAM_LINE[TEAM_BLUE]!, 0.55), '#7e9fb6')).toBeLessThanOrEqual(8);
    expect(apart(mix(refForest, TEAM_LINE[TEAM_RED]!, 0.55), '#a4544f')).toBeLessThanOrEqual(8);
    expect(apart(mix(refForest, TEAM_LINE[TEAM_BLUE]!, 0.55), '#338cbf')).toBeLessThanOrEqual(8);
  });

  it('gives every skin two territories that read apart from it and from each other', () => {
    for (const sk of SKINS) {
      const red = teamLook(sk, TEAM_RED), blue = teamLook(sk, TEAM_BLUE);
      const ground = sk.top[1][0];
      // a territory is a country, not a tint: it departs from its own ground by a clear margin
      expect(apart(red.top[0], ground), sk.key).toBeGreaterThan(40);
      expect(apart(blue.top[0], ground), sk.key).toBeGreaterThan(40);
      // and the two of them are never each other, on any board
      expect(apart(red.top[0], blue.top[0]), sk.key).toBeGreaterThan(60);
      // red stays the warm country and blue the cool one, whatever the ground underneath
      expect(hueGap(hsv(red.top[0]).h, hsv(TEAM_LINE[TEAM_RED]!).h), sk.key).toBeLessThan(40);
      expect(hueGap(hsv(blue.top[0]).h, hsv(TEAM_LINE[TEAM_BLUE]!).h), sk.key).toBeLessThan(40);
      // one colour from end to end: a territory's two checker shades are the same country
      expect(apart(red.top[0], red.top[1]), sk.key).toBeLessThanOrEqual(4);
      // and the grid inside a territory is its own colour a shade down, like the ground's
      expect(hsv(red.grid).v, sk.key).toBeLessThan(hsv(red.top[0]).v);
    }
  });

  it('keeps the two border lines the only near-pure colours in the game', () => {
    for (const tm of [TEAM_BLUE, TEAM_RED]) {
      const l = hsv(TEAM_LINE[tm]!);
      // the front, not a seam: nothing else on the board comes near this, which is what lets one
      // hairline carry what sixty bevels used to (ground.ts, D87)
      expect(l.s).toBeGreaterThanOrEqual(0.7);
      expect(l.v).toBeGreaterThanOrEqual(0.95);
      expect(l.s).toBeGreaterThan(Math.max(...tops.map((t) => hsv(t.c).s)) + 0.1);
    }
  });
});

describe('the ground patches', () => {
  // D98: the reference's bare field is not one colour, it is runs of three to five tiles at four
  // value levels 0.064 apart. These pin that ours is the same kind of thing: three levels, all of
  // them used, in patches and not per tile, and the same on both clients of a match.
  const seeds = [0, 1, 2, 7, 31, 404, 12345];

  it('deals every level out, on every board', () => {
    for (const seed of seeds) {
      const { tiles } = generateMap(seed);
      const p = groundPatches(tiles, seed);
      const hist = PATCH_D.map((_, lv) => [...p].filter((x) => x === lv).length);
      for (const n of hist) expect(n).toBeGreaterThan(tiles.length * 0.08);
      // and no level may swallow the board: 237 of 325 on one level is not patchiness, it is a
      // board repitched by 0.048 with a few dark corners, which is what rolling the levels did.
      for (const n of hist) expect(n).toBeLessThan(tiles.length * 0.62);
    }
  });

  it('lays patches, not a per-tile scatter', () => {
    for (const seed of seeds) {
      const { tiles } = generateMap(seed);
      const p = groundPatches(tiles, seed);
      let same = 0, pairs = 0;
      for (const t of tiles) {
        for (const n of t.nb) {
          pairs++;
          if (p[n] === p[t.i]) same++;
        }
      }
      // a per-tile roll over three levels would agree with a third of its neighbours; PATCH_N
      // spots over 325 tiles is about thirteen tiles a patch, so most neighbours agree. The bar
      // was 0.8 while there were 15 spots (0.85 measured); 24 of them read 0.78, and the thing
      // this pins is patches against a scatter, which 0.78 against 0.33 says just as plainly.
      expect(same / pairs).toBeGreaterThan(0.72);
    }
  });

  it('is the same board for both clients, and a different one per seed', () => {
    expect([...groundPatches(generateMap(7).tiles, 7)]).toEqual([...groundPatches(generateMap(7).tiles, 7)]);
    expect([...groundPatches(generateMap(8).tiles, 8)]).not.toEqual([...groundPatches(generateMap(7).tiles, 7)]);
  });

  it('is centred on the skin colour, not stacked on top of it', () => {
    // D115: the skin colour is the patches' MIDDLE, not their floor. A one-sided ramp does not
    // texture the board, it repitches it -- ours came out 0.022 brighter than skins.ts says, which
    // light.ts (multiply only) cannot take back. So the steps must average out to nothing.
    const mean = PATCH_D.reduce((a, b) => a + b, 0) / PATCH_D.length;
    expect(Math.abs(mean)).toBeLessThan(0.004);
    expect(Math.min(...PATCH_D)).toBeLessThan(0);
    expect(Math.max(...PATCH_D)).toBeGreaterThan(0);
    // and the span stays the measured raggedness, not a gradient
    expect(Math.max(...PATCH_D) - Math.min(...PATCH_D)).toBeLessThanOrEqual(0.064);
    expect(PATCH_N).toBeGreaterThan(8);
  });
});
