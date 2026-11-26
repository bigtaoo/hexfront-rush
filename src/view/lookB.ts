// The cleaned-up screen (the reference is art/ref/screen_gen_b.png). It is the game's look since
// 2026-11-10 (the owner's call: players who click and find the first screen cheap leave, so the
// opening frame's finish comes first); ?looka in the URL brings back the old look for comparison.
// A cluttered battle read as one grey mush: units the size of a third of a hex, blue troops on blue
// ground, the same dark outline on every cactus and the same white stamp on every free tile. The
// mockup tries the reference's fixes side by side with the shipped look:
// - a closer camera (fewer hexes on screen, so every unit is bigger and groups have room), centred
//   on the own buildings rather than on the castle alone;
// - a team-coloured base under every troop, so its side does not depend on the ground under it;
// - a quieter ground (pale washes for the teams' land, a bolder border) and muted decoration;
// - smaller, lower-contrast offer stamps;
// - a lighter base: one paved yard instead of a stone
//   wall round every tile, a smaller badge;
// - one light for the whole scene: every picture throws the same shadow down and to the right,
//   the screen falls off from a lit upper left into a slightly darker lower right, and the ground
//   carries a faint large-scale grain -- both NEUTRAL grey, because the reference's own light costs
//   it no hue corner to corner (light.ts D99).
// ?only3 also draws every troop and building with the three Tripo models only (the
// guard, the ogre, the mine), to judge one consistent style; it is a look test, not playable.

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const LOOK_B = !q?.has('looka');
export const ONLY3 = LOOK_B && !!q?.has('only3');

/** The play zoom: about this many hexes across and rows down (viewConst VIEW_HEXES / VIEW_ROWS). */
export const LOOKB_VIEW = { hexes: 7.2, rows: 8.5 };

/** Troops are drawn this much bigger than their hit size (the sim is untouched).
 *
 *  MEASURED, in logical px and as a share of the cell's WIDTH -- the one yardstick both boards
 *  share, since the reference's cell is 60.0 logical wide and ours 58.3 (D127: the reference's
 *  screenshots are dpr 3 and ours dpr 2, so device px cannot be compared). Off D:/new/ref,
 *  IMG_3728 and IMG_3717, whose lattice pitch comes out at 134 source px both times -- a flat-top
 *  column pitch of 0.75 W, so W = 179 source = 60 logical:
 *
 *    reference, a house on its tile   34.0 x 48.0 logical   0.57 w  0.80 h
 *    reference, a figure on its tile  24.0 x 37.3 logical   0.40 w  0.62 h
 *    ours, the castle                 38   x 56     "       0.65 w  0.96 h
 *    ours, a militia at K 1.3         35   x 54     "       0.60 w  0.93 h
 *
 *  So the cast hierarchy was inverted: the reference's building stands 1.29x its own figure, and
 *  ours stood 1.04 -- a castle exactly as tall as the footsoldier walking past it, and SHORTER
 *  than a guard (59). The castle cannot grow: its box is already within 4% of the geometry limit
 *  (buildingView BASE_H, the card one row up), and our ordinary buildings already come out
 *  SMALLER than the reference's (mine 0.70, barracks 0.58-0.67 against its 0.80). The one piece
 *  out of line is the troop, so the troop is what moves. 1.3 -> 1.05 puts a militia at 43.6
 *  logical, 0.75 of a cell, and the castle at 1.28x it -- the reference's own ratio.
 *
 *  It does NOT go all the way down to the reference's 0.62: a troop is the thing that has to stay
 *  readable at a phone's zoom, and 1.05 still draws it 18% larger than the reference does, which
 *  is the trade this look was built on. See DECISIONS.md D128. */
export const LOOKB_UNIT_K = 1.05;

/** The cast shadow: the picture flattened onto the ground and leaned away from the light. */
// skew leans the flipped picture right as it goes down: drop = squash·cos(skew), lean = squash·sin(skew)
// the tint is near-black and a breath cool for the same reason the contact shadow is (bodies.ts D100):
// a warm brown cast shadow cost the ground it lay on five degrees of hue, and the reference's own dark
// end runs COOLER than its midtones, not warmer.
export const CAST = { squash: 0.55, skew: 0.85, alpha: 0.30, tint: 0x0e1416 };

/** What a PROP throws: the bottom of its picture, not all of it. D123.
 *
 *  A flattened copy of the whole picture can never be narrower than the picture, and that is the
 *  whole problem. Measured on the reference (D:/new/ref IMG_3700, the free-standing oak at
 *  150,1420-360,1640): its dark mass at the tree's foot is 20.3 x 13.0 logical px, 162 px2, against
 *  a crown 70.0 x 73.3 wide -- 0.29 of the crown's width and 3.2% of its area -- and the grass tile
 *  beside the tree is not darkened at all. Ours threw the crown: 39.2 x 20.2 logical px, 356 px2,
 *  leaning across the neighbouring tile. Over a board, the scenery's shadows alone (the 75 prop
 *  casts switched off and the frame diffed) covered 11.89% of everything you can see, at 0.126 of
 *  value down against the reference's 0.078. That is the haze on the grass, and it is also why the
 *  hex seams read as a smear: the shadows run under them.
 *
 *  Squashing it flatter does not fix the width. Swept live on the board at squash 0.35 / 0.25 /
 *  0.18 the cover fell 12.3% -> 10.8 -> 8.3 -> 6.3 but the width only went 48 -> 42 -> 41 -> 37,
 *  because it is the crown's own width and nothing below it. So the cast is cut to the bottom of
 *  the picture instead: a trunk throws a trunk. At the bottom 0.20 of its height an oak is 0.27 of
 *  its widest across -- the reference's own 0.29 -- and a rock 0.48; a pine's skirt reaches the
 *  ground, so a pine still throws 0.97 of a pine, which is what a cone standing on grass does.
 *
 *  Troops and buildings keep the whole silhouette (unitView, buildingView): a figure's shadow is
 *  how you read where it stands, and there are six of them on a board, not seventy-five. */
export const CAST_PROP = { band: 0.20, squash: 0.80, alpha: 0.20 };
