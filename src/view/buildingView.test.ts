import { describe, expect, it } from 'vitest';
import { installCanvas } from '../test/canvasFakes';
import atlasJson from '../assets/atlas.json';
import { PPU, TILE_FOOT } from './art';
import { BADGE_R, badgeSpot, bldScale } from './buildingView';

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
/** Half the gate's width in view units, measured off the castle picture as drawn (1.35 wide). */
const GATE_HALF = 0.2;
/** How far apart two rows of hexes are, and where the offer plaque on a tile one row up reaches
 *  down to: offers.ts PLQ spans cy +/- h/2, so its bottom edge is 0.47 below its own tile centre. */
const ROW = 1.5, PLQ_BOTTOM = 0.47;
/** The buildings in the atlas, by their drawn size in view units (tools/art3d packs them at PPU). */
const CAST = Object.entries(atlasJson.frames)
  .filter(([n]) => /^(base|barracks[1-4]|mine|tower)_(blue|red)$/.test(n))
  .map(([n, f]) => {
    const w = f.frame.w / PPU, h = f.frame.h / PPU, k = bldScale(n.split('_')[0]!.replace(/[1-4]$/, ''), w, h);
    return { name: n, w: w * k, h: h * k };
  });

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

describe('how big a building is drawn', () => {
  it('has every building in the atlas', () => {
    // 7 pictures (castle, four barracks, mine, tower) per side
    expect(CAST.length).toBe(14);
  });

  it('keeps every ordinary building clear of the card one row up', () => {
    for (const b of CAST) {
      if (b.name.startsWith('base')) continue;
      // the picture's top, view units from its own tile centre (negative: above)
      expect(TILE_FOOT - b.h).toBeGreaterThanOrEqual(-ROW + PLQ_BOTTOM);
    }
  });

  it('leaves a lane of ground between two buildings side by side', () => {
    // neighbours sit 1.73 apart; a building wider than that reaches into the next one
    for (const b of CAST) expect(b.w).toBeLessThan(1.732 - 0.35);
  });

  it('draws the castle as the biggest thing on the board', () => {
    // what the old per-picture box fit broke: fitting by total height punished the one picture
    // that carries a flag, so the castle came out narrower than a one-room hut
    for (const b of CAST) {
      if (b.name.startsWith('base')) continue;
      const castle = CAST.find((c) => c.name === `base_${b.name.split('_')[1]}`)!;
      expect(castle.w).toBeGreaterThan(b.w);
      expect(castle.h).toBeGreaterThan(b.h);
    }
  });
});
