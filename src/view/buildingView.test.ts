import { describe, expect, it } from 'vitest';
import { installCanvas } from '../test/canvasFakes';
import atlasJson from '../assets/atlas.json';
import { PPU, TILE_FOOT } from './art';
import { BADGE_R, badgeSpot, bldScale, BLD_BOX } from './buildingView';
import { CARD_BOX } from './offers';

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
/** How far apart two rows of hexes are, and the lane of bare ground to leave between two
 *  buildings. Where the card on a tile one row up reaches to comes from offers.ts itself
 *  (CARD_BOX), so these tests cannot drift from the card they are measuring against. */
const ROW = 1.5, LANE = 0.35;
/** A frame's size in view units as the renderer sees it. artW/artH read Texture.width, which Pixi
 *  takes from `orig` -- the untrimmed canvas it restores from sourceSize -- while frame.w/h is the
 *  opaque box pack.py cropped to. 301 of the 315 frames are trimmed, so reading frame.w here would
 *  measure a box bldScale is never handed; the buildings only happen to be packed tight today. */
function box(f: { frame: { w: number; h: number }; sourceSize?: { w: number; h: number } }) {
  const s = f.sourceSize ?? f.frame;
  return { w: s.w / PPU, h: s.h / PPU };
}
/** The buildings in the atlas, by their drawn size in view units (tools/art3d packs them at PPU). */
const CAST = Object.entries(atlasJson.frames)
  .filter(([n]) => /^(base|barracks[1-4]|mine|tower)_(blue|red)$/.test(n))
  .map(([n, f]) => {
    const { w, h } = box(f);
    const k = bldScale(n.split('_')[0]!.replace(/[1-4]$/, ''), w, h);
    return { name: n, base: n.startsWith('base'), w: w * k, h: h * k };
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
    // The rule is on the constant, not on whatever the cast measures today: a picture of height H
    // tops out at TILE_FOOT - H, and the card one row up reaches down to -ROW + CARD_BOX.bottom.
    expect(TILE_FOOT - BLD_BOX.h).toBeGreaterThanOrEqual(-ROW + CARD_BOX.bottom);
    // What the art can still break is the clamp: four of the seven pictures are tall enough that
    // bldScale clips them to exactly BLD_H, so checking their own tops against the line above
    // would only compare BLD_H with itself -- on five frames it lands on it to the last bit.
    for (const b of CAST) if (!b.base) expect(b.h, b.name).toBeLessThanOrEqual(BLD_BOX.h + 1e-9);
  });

  it("lets the castle stand into the card's margin but never over its face", () => {
    // The castle is the one picture that breaks the rule above, because at this model's
    // proportions nothing shorter than 1.87 still comes out the widest building on its side. It
    // goes 0.50 behind the card's bottom edge, on 0.31 of its width (the two up-diagonal
    // neighbours sit at +/-0.866). What it may not reach is the face: the symbol row, and the
    // price -- which is only safe because offers.ts lifts a price row into offers.tags, over the
    // buildings (renderer.ts), whenever anything stands on the tile below it (coveredBelow). That
    // is the one thing this test depends on and cannot see: offers.test.ts pins it.
    for (const b of CAST) {
      if (!b.base) continue;
      expect(TILE_FOOT - b.h, b.name).toBeGreaterThanOrEqual(-ROW + CARD_BOX.glyphY);
    }
    expect(TILE_FOOT - BLD_BOX.baseH).toBeGreaterThanOrEqual(-ROW + CARD_BOX.glyphY);
  });

  it('leaves a lane of ground between two buildings side by side', () => {
    // neighbours sit 1.73 apart; a building wider than that reaches into the next one
    expect(BLD_BOX.w).toBeLessThanOrEqual(1.732 - LANE);
    expect(BLD_BOX.baseW).toBeLessThanOrEqual(1.732 - LANE);
    for (const b of CAST) expect(b.w, b.name).toBeLessThan(1.732 - LANE);
  });

  it('draws the castle as the biggest thing on the board', () => {
    // what the old per-picture box fit broke: fitting by total height punished the one picture
    // that carries a flag, so the castle came out narrower than a one-room hut
    for (const b of CAST) {
      if (b.base) continue;
      const castle = CAST.find((c) => c.name === `base_${b.name.split('_')[1]}`)!;
      expect(castle.w, b.name).toBeGreaterThan(b.w);
      expect(castle.h, b.name).toBeGreaterThan(b.h);
    }
  });
});
