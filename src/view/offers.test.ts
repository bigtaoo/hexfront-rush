import { describe, expect, it } from 'vitest';
import { priceLook } from './offers';
import { COL } from './viewConst';

// The price under an offer's symbol is the one number a player reads while deciding, and it has
// been wrong in both directions. First a dull clay (#b9a487) on the plaque's own cream (#cbb086),
// unreadable (D70). Then a strong rust red -- readable, but on a board where most prices are out
// of reach it painted the whole map in the one colour the eye cannot ignore, so everything the
// player could NOT do was the loudest thing on screen (D83). These hold the direction: what can be
// bought is the bright one, what cannot stays readable without a hue to chase.

const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
/** WCAG contrast between two opaque colours. */
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
/** The carved plaque a price is stamped on (PLQ's face in offers.ts). */
const PLAQUE = '#cbb086';

/** `a` laid over `b` at alpha `f`, as the renderer composites a faded label onto its plaque. */
const mix = (a: string, b: string, f: number): string => {
  const ch = (hex: string): [number, number, number] => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [ar, ag, ab] = ch(a), [br, bg, bb] = ch(b);
  const m = (x: number, y: number) => Math.round(x * f + y * (1 - f));
  return '#' + [m(ar, br), m(ag, bg), m(ab, bb)].map((v) => v.toString(16).padStart(2, '0')).join('');
};

const sat = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mx = Math.max(...ch), mn = Math.min(...ch);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

describe('an offer price', () => {
  it('keeps the affordable one bright and lets the rest recede', () => {
    const rich = priceLook(100, 55);
    const poor = priceLook(54, 55);
    expect(rich.tint).toBe('#ffffff');
    expect(poor.tint).not.toBe(rich.tint);
    // THE invariant: the two sit on opposite sides of the plaque they are stamped on, and the
    // bright side is the one the player can act on. If this ever flips back, a board of prices
    // nobody can pay becomes the loudest thing on screen again.
    expect(lum(poor.tint)).toBeLessThan(lum(PLAQUE));
    expect(lum(rich.tint)).toBeGreaterThan(lum(PLAQUE));
    // and the price row itself steps back, rim and coin with it
    expect(poor.fade).toBeLessThan(rich.fade);
    expect(poor.coinAlpha).toBeLessThan(rich.coinAlpha);
    expect(rich.rich).toBe(true);
    expect(poor.rich).toBe(false);
    // exactly affordable is affordable
    expect(priceLook(55, 55).tint).toBe(rich.tint);
  });

  it('still lets a price it cannot pay be read', () => {
    // the clay it used to be came to 1.16 against the plaque -- all but invisible. Dark on cream
    // is not a warning, but it is a number. Measured AFTER the row's own fade, because a tint that
    // passes on its own still washes out once the fade mixes the plaque back into it: the first
    // try at this traded a red rash for smudges nobody could read.
    const poor = priceLook(0, 55);
    expect(contrast(mix(poor.tint, PLAQUE, poor.fade), PLAQUE)).toBeGreaterThan(2.5);
  });

  it("never chases the eye with a hue, nor wears the red team's own colour", () => {
    const poor = priceLook(0, 1);
    // a saturated price is what D83 took out: no rust red, no green, nothing that reads as an alert
    expect(sat(poor.tint)).toBeLessThan(0.45);
    expect(poor.tint).not.toBe(COL.red);
    expect(poor.tint).not.toBe(COL.redDark);
  });
});
