import { describe, expect, it } from 'vitest';
import { installCanvas } from '../test/canvasFakes';
import { BADGE_R, badgeSpot } from './buildingView';

// A building's badge -- the disc that shows what it makes, with the ring that fills toward the
// next coin or troop -- sits at the building's feet. On a barracks or a mine that is empty ground.
// On the castle it was not: the castle is the widest picture on the board and its gate is exactly
// what the middle of it is built around, so the coin and its ring were stamped across the arch,
// over the one part of the sprite the eye reads as a door. It stands at the castle's right-hand
// foot now. These hold that apart from two ways of undoing it: putting it back in the middle, and
// pushing it so far out that it hangs over the neighbouring tile's offer card.

installCanvas();
/** Half a tile's width in view units (a hex is 1.73 across). */
const HALF_TILE = 0.866;
/** Half the gate's width in view units, measured off the castle picture as drawn (BLD_W 1.45). */
const GATE_HALF = 0.18;

describe("a building's badge", () => {
  it('stands off the castle gate', () => {
    const at = badgeSpot('base');
    expect(at.x - BADGE_R).toBeGreaterThan(GATE_HALF);
  });

  it("stays on the castle's own tile", () => {
    expect(badgeSpot('base').x + BADGE_R + 0.06).toBeLessThan(HALF_TILE);
  });

  it('leaves every other building wearing it at its feet', () => {
    for (const type of ['mine', 'barracks', 'tower']) expect(badgeSpot(type).x).toBe(0);
    expect(badgeSpot('base').y).toBe(badgeSpot('mine').y);
  });
});
