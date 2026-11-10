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
//   the screen falls off from a lit upper left into a darker lower right, the far (top) edge hazes
//   and the sand carries a faint large-scale grain.
// ?only3 also draws every troop and building with the three Tripo models only (the
// guard, the ogre, the mine), to judge one consistent style; it is a look test, not playable.

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const LOOK_B = !q?.has('looka');
export const ONLY3 = LOOK_B && !!q?.has('only3');

/** The play zoom: about this many hexes across and rows down (viewConst VIEW_HEXES / VIEW_ROWS). */
export const LOOKB_VIEW = { hexes: 7.2, rows: 8.5 };

/** Troops are drawn this much bigger than their hit size (the sim is untouched). */
export const LOOKB_UNIT_K = 1.3;

/** The cast shadow: the picture flattened onto the ground and leaned away from the light. */
// skew leans the flipped picture right as it goes down: drop = squash·cos(skew), lean = squash·sin(skew)
export const CAST = { squash: 0.55, skew: 0.85, alpha: 0.28, tint: 0x2a1c10 };
