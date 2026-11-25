// The small marks drawn in code around the pictures (art.ts): ground shadows, coins, coin timers
// and hp bars, drawn through a Pen at the origin. Still ones go into shared contexts (sharedCtx);
// timers and bars are drawn into per-view Graphics when they change.

import type { GraphicsContext } from 'pixi.js';
import { Pen, sharedCtx } from './pen';

/** Three passes: a wide soft halo, the body of the shadow, and a tight dark core right under the
 *  foot. One flat ellipse let everything hover a few millimetres above the board.
 *
 *  THE SHADOW IS NEAR-BLACK AND A BREATH COOL, not the warm brown it was (D100). Brown 'rgba(40,24,8)'
 *  at 26% over the meadow's #347c72 lands on hue 165.9 saturation 0.501 -- five degrees warm of the
 *  ground it lies on and eight hundredths flatter -- and there is a contact shadow under every troop,
 *  building and obstacle on the board, so it was the warm cast's last big surface after D99. What the
 *  reference (D:/new/ref) does is the opposite: band its ground pixels by value and the dark end goes
 *  COOLER and MORE SATURATED -- IMG_3717 reads hue 170.4 S0.530 in the middle band, 174.2 S0.723 in
 *  the 8-20% band and 181.8 S0.781 in the darkest 8%, and IMG_3707 the same walk, 170.1 to 176.0.
 *  A black shadow is the only one that is theme-agnostic: value scales, so pure black holds hue and
 *  saturation EXACTLY on sand, snow and meadow alike, where any tinted shadow trades one board's
 *  colour for another's (the cool dark that lands at 175 on teal pulls sand from 36 to 43 and flattens
 *  it a tenth). So this is black with just enough blue to pick up the reference's couple of degrees:
 *  on #347c72 it lands hue 172.4 S0.572 V0.376 against the ground's 170.8 S0.581 V0.486. The alphas
 *  are up three to four hundredths with it, because our board's dark end sits 0.05 short of the
 *  reference's (p5 0.318 against 0.271) and the contact shadow is where a board gets its black.
 *
 *  AND IT GOES UNDER A THING THAT MOVES, NOT UNDER A THING THAT STANDS (D114). The reference
 *  (D:/new/ref) draws NO ground shadow under its scenery at all. Zoomed in on IMG_3660 its house,
 *  its two shrines, its gold pile, its pyramid, its rocks and its cacti all sit straight on the
 *  flat territory colour, and on IMG_3717 its stump sits in the middle of its hex with the grid
 *  lines running right under it. It is measurable as well as visible: 40 to 80 device px below
 *  that house -- a third to two thirds of a hex height -- the ground reads a 5th percentile of
 *  0.906 against its own modal 0.933, a 0.027 dip, which is anti-aliasing and not a shadow. What
 *  stands a piece off the board there is the hard dark OUTLINE on the sprite, and our own art has
 *  exactly that (sprite.py OUTLINE_PX, a 4 px dilation in dark ink under every frame) plus, under
 *  lookB, a cast shadow of the picture itself leaning away from the light. So the contact ellipse
 *  under a building (rx 0.7: a 92 device px body and a 110 px halo across a 113 px hex -- it
 *  covered the tile) and under an obstacle (rx 0.5) was a third grounding device doing a job two
 *  others already do, and it paid for it in the one place the reference keeps clean: the open
 *  ground between the pieces.
 *
 *  What still gets one is what the outline cannot explain: a map event, which BOBS a few
 *  hundredths above its tile and has to be seen hovering, and a troop or a guard, which moves
 *  across the board and would skate over it otherwise (and under lookB a troop takes a
 *  team-coloured base instead, unitView.ts). Scenery stands still and keeps its outline. */
export function shadow(p: Pen, x: number, y: number, rx: number): void {
  p.ellipse(x, y + rx * 0.05, rx * 1.2, rx * 0.44, 'rgba(10,16,18,0.12)');
  p.ellipse(x, y, rx, rx * 0.36, 'rgba(10,16,18,0.30)');
  p.ellipse(x, y - rx * 0.03, rx * 0.56, rx * 0.19, 'rgba(6,12,14,0.26)');
}

export function shadowCtx(rx: number): GraphicsContext {
  return sharedCtx(`shadow|${rx.toFixed(3)}`, (p) => shadow(p, 0, 0, rx));
}

export function coin(p: Pen, x: number, y: number, r: number): void {
  p.circle(x, y, r, '#fbbf24', '#92400e', r * 0.18);
  p.circle(x, y, r * 0.55, null, '#d97706', r * 0.12);
}

/** An hp bar centred on x, its top at y: green for the local side, red for the rival. */
export function hpBar(p: Pen, x: number, y: number, w: number, k: number, own: boolean): void {
  p.rrect(x - w / 2 - 0.04, y - 0.04, w + 0.08, 0.18, 0.06, 'rgba(24,16,8,0.75)');
  if (k > 0) p.rrect(x - w / 2, y, Math.max(0.06, w * k), 0.1, 0.04, own ? '#4ade80' : '#f87171');
}
