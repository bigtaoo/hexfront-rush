import { describe, expect, it } from 'vitest';
import { boxesTouch } from './dom';

// The menu is the one panel that keeps the sound and the music switch on the screen, and the
// menu's own bottom row -- the difficulty, the medals, the gear -- ends in the same corner the two
// wooden tokens sit in. On a tall phone they are far apart; on a short one they are not, and the
// tokens are fixed over the row, so the gear's own taps went to the music switch instead. dom.ts
// tuckCorners takes the two switches off the screen where they would touch the row, and this is
// the arithmetic it decides by, run over the boxes measured in Chrome on the screens it was found
// on. The look at the menu stays a live one; what this guards is that the rule still reads those
// boxes the same way.

/** A box as the browser hands it over (left, top, right, bottom), in that order. */
const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

/** The six pixels tuckCorners keeps clear around the row, so a token that merely grazes it goes
 *  too: touching, the gear and the switch read as one smudged knob. */
const near = (b: ReturnType<typeof box>) => box(b.left - 6, b.top - 6, b.right + 6, b.bottom + 6);

describe('the menu’s corner switches against the menu’s own bottom row', () => {
  // the gear and the two tokens as Chrome measured them on each screen, Japanese, at boot
  const gear640 = box(493, 298, 547, 348), music640 = box(522, 298, 572, 348);
  const gear320 = box(263, 388, 308, 438), mute320 = box(260, 418, 310, 468);
  const gear640tall = box(307, 468, 352, 518), mute640tall = box(300, 578, 350, 628);

  it('sees the switch that lies over the gear on a short landscape phone', () => {
    // 640x360: the music switch covered the right half of the gear, both at the same height
    expect(boxesTouch(near(gear640), music640)).toBe(true);
  });

  it('sees the switch that covers only the foot of the gear', () => {
    // 320x480: thirty of the gear's fifty pixels were still its own, and the other twenty muted
    expect(boxesTouch(near(gear320), mute320)).toBe(true);
  });

  it('leaves the switches where the screen has the room for both', () => {
    // 360x640: sixty pixels between them, and the switches stay on the menu as they are meant to
    expect(boxesTouch(near(gear640tall), mute640tall)).toBe(false);
  });

  it('counts a touch along one edge, and not a miss by a hair', () => {
    const a = box(0, 0, 50, 50);
    expect(boxesTouch(a, box(50, 0, 100, 50))).toBe(false);
    expect(boxesTouch(a, box(49, 0, 100, 50))).toBe(true);
    expect(boxesTouch(a, box(0, 50, 50, 100))).toBe(false);
    expect(boxesTouch(a, box(0, 49, 50, 100))).toBe(true);
  });
});
