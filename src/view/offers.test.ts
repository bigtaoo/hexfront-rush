import { describe, expect, it } from 'vitest';
import { priceLook } from './offers';
import { COL } from './viewConst';

// The price under an offer's symbol is the one number a player reads while deciding, and for a
// while the "you cannot pay for this" version of it was a dull clay (#b9a487) stamped on the
// plaque's own cream (#cbb086) -- the same tone, so the warning was both the least obvious thing
// on the card and the hardest to read. It is red now. These hold the three states apart and keep
// the red clear of the cream it sits on and of the red team's own colour.

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

describe('an offer price', () => {
  it('turns red the moment the player cannot pay for it', () => {
    const rich = priceLook(100, 55, 0);
    const poor = priceLook(54, 55, 0);
    expect(rich.tint).toBe('#ffffff');
    expect(poor.tint).not.toBe(rich.tint);
    // the clay it used to be came to 1.16 against the plaque -- all but invisible. A price the
    // player cannot meet is now the highest-contrast thing on the card, the white one (2.08) included
    expect(contrast(poor.tint, PLAQUE)).toBeGreaterThan(3);
    expect(contrast(poor.tint, PLAQUE)).toBeGreaterThan(contrast(rich.tint, PLAQUE));
    expect(poor.coinAlpha).toBeLessThan(rich.coinAlpha);
    // exactly affordable is affordable
    expect(priceLook(55, 55, 0).tint).toBe(rich.tint);
  });

  it('shows a rebate only on a price the player can actually meet', () => {
    expect(priceLook(100, 55, 20).tint).toBe(COL.rebate);
    expect(priceLook(10, 55, 20).tint).toBe(priceLook(10, 55, 0).tint);
  });

  it("never dresses a price in the red team's own colour", () => {
    expect(priceLook(0, 1, 0).tint).not.toBe(COL.red);
    expect(priceLook(0, 1, 0).tint).not.toBe(COL.redDark);
  });
});
