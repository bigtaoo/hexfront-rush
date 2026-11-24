import { describe, expect, it } from 'vitest';
import { priceLook } from './offers';
import { SKINS } from './skins';
import { COL } from './viewConst';

// The price under an offer's symbol is the one number a player reads while deciding, and it has
// been wrong in four directions. First a dull clay (#b9a487) on the plaque's own cream, unreadable
// (D70). Then a strong rust red -- readable, but on a board where most prices are out of reach it
// painted the map in the one colour the eye cannot ignore (D83). Then a carved brown, which read
// cleanly and said nothing at all (D84). All three were arguments about how far an unpayable price
// should step back, and all three were answers to a problem the plaque itself created: a dark
// number cut into a wooden card, over a board already full of wooden cards.
//
// The reference game (D:/new/ref) has no card: a cream symbol, a coin and a number, straight on the
// ground, and an out-of-reach price is simply red -- full strength, same dark outline as every
// other number. Half its board is red at once and it still reads, because the board is flat and
// nothing else on it is red. So these pin what is left: bright is what you can buy, red is what you
// cannot, nothing dims, and the red is never the red team's. See DECISIONS.md D87.

const hsv = (hex: string): { h: number; s: number; v: number } => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const mx = Math.max(r!, g!, b!), mn = Math.min(r!, g!, b!), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g! - b!) / d + 6) % 6);
    else if (mx === g) h = 60 * ((b! - r!) / d + 2);
    else h = 60 * ((r! - g!) / d + 4);
  }
  return { h, s: mx === 0 ? 0 : d / mx, v: mx };
};
const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};

/** Every tile top the price can land on. */
const GROUND = SKINS.flatMap((sk) => sk.top.flatMap((pair) => [...pair]));

describe('an offer price', () => {
  it('keeps the affordable one bright and the rest red, both at full strength', () => {
    const rich = priceLook(100, 55);
    const poor = priceLook(54, 55);
    expect(rich.tint).toBe('#ffffff');
    expect(rich.afford).toBe(true);
    expect(poor.afford).toBe(false);
    // THE invariant: the bright side is the one the player can act on. If this ever flips back, a
    // board of prices nobody can pay becomes the loudest thing on screen again.
    expect(lum(rich.tint)).toBeGreaterThan(lum(poor.tint));
    // exactly affordable is affordable
    expect(priceLook(55, 55).tint).toBe(rich.tint);
    // and the look says nothing else: no fade, no dimmed coin, no rim to light (D87). A price you
    // cannot meet is still a price you have to read.
    expect(Object.keys(poor).sort()).toEqual(['afford', 'tint']);
  });

  it('paints the unpayable price a red no ground of ours wears', () => {
    const poor = priceLook(0, 55).tint;
    const p = hsv(poor);
    // a true red, not a warm brown, and the loudest colour in the frame after the border lines:
    // its contrast against a red desert is only 1.4, so it is the digits' own dark outline that
    // carries it -- what this pins is that it never reads as a patch of sand
    expect(p.h).toBeLessThan(15);
    expect(p.v).toBeGreaterThan(0.9);
    for (const c of GROUND) {
      expect(p.s - hsv(c).s, c).toBeGreaterThan(0.15);
    }
  });

  it("says it in red without ever wearing the red team's own colour", () => {
    const poor = priceLook(0, 1).tint;
    // a price is never read as a team mark: both of the team's tones are darker and duller
    expect(poor).not.toBe(COL.red);
    expect(poor).not.toBe(COL.redDark);
    expect(lum(poor)).toBeGreaterThan(lum(COL.redDark));
  });
});
