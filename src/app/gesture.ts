// The arithmetic behind the gestures on the canvas: how far a press may slip and still count as a
// tap, how far one turn of the wheel moves the map, when a pinch has closed or opened enough to
// change the zoom, and which way the held keys point. None of it needs a browser, so none of it
// lives in controls.ts: that file listens and this one decides.

/** A press that moves further than this is a drag, not a tap (CSS px). A finger rolls as it
 *  presses and lifts, far more than a mouse ever slips, so a touch gets more room: a tap meant for
 *  a card used to come out as a pan of a few pixels and the card stayed face down. */
export const DRAG_PX = 10;
export const DRAG_PX_TOUCH = 18;
/** Keyboard pan speed, CSS px per second. */
export const KEY_PAN = 700;
/** A pinch that closes (or opens) the fingers' distance by this factor zooms out (or in). */
export const PINCH = 1.25;

/** How far this press may move and still be a tap. */
export const dragSlop = (pointerType: string): number => (pointerType === 'touch' ? DRAG_PX_TOUCH : DRAG_PX);

/** One text line in CSS pixels: what a browser that counts the wheel in lines means by one. */
const LINE_PX = 16;

/** What a wheel event asks for, in CSS pixels, whatever unit the browser counted it in.
 *
 *  A wheel delta is not pixels unless `deltaMode` says so. Chrome counts a mouse notch in pixels
 *  (about 100), Firefox counts the same notch in lines (deltaMode 1, three of them), and a browser
 *  may count in screenfuls (deltaMode 2). Taken as pixels, a Firefox notch moved the map three
 *  pixels and the wheel looked broken on half the desktops the game ships to.
 *
 *  `page` is the screen's length along this axis: it is what a screenful means, and the cap for a
 *  single event however it was counted, so no one notch can throw the map across the map. A screen
 *  reported as having no length at all still owes the wheel a pixel. */
export function wheelPx(delta: number, mode: number, page: number): number {
  if (!Number.isFinite(delta) || !delta) return 0;
  const cap = Math.max(1, page);
  const px = mode === 1 ? delta * LINE_PX : mode === 2 ? delta * cap : delta;
  return Math.max(-cap, Math.min(cap, px));
}

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}
/** The pan for one wheel event on a W x H canvas: the map follows the wheel, so the camera goes
 *  the other way. */
export function wheelPan(ev: WheelLike, W: number, H: number): { x: number; y: number } {
  return { x: -wheelPx(ev.deltaX, ev.deltaMode, W), y: -wheelPx(ev.deltaY, ev.deltaMode, H) };
}

/** What the pinch has done since it last changed anything: zoomed out to the whole map, back in to
 *  play zoom, or not far enough yet. `d0` is the fingers' distance at that last change, `d` their
 *  distance now; a pinch that is already where it would take us does nothing. */
export function pinchStep(d0: number, d: number, overview: boolean): 'out' | 'in' | null {
  if (!(d > 0) || !(d0 > 0)) return null;
  if (d < d0 / PINCH) return overview ? null : 'out';
  if (d > d0 * PINCH) return overview ? 'in' : null;
  return null;
}

const KEYMAP: Record<string, readonly [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
/** The screen direction this key pans in, or undefined if it is not one of ours. */
export const panKey = (code: string): readonly [number, number] | undefined => KEYMAP[code];

/** Where the held keys point, as a direction of length 1 (or no direction at all). Two keys at
 *  once used to pan 1.41 times as fast as one, since up and right were simply added together. */
export function panVector(keys: Iterable<string>): { x: number; y: number } {
  let x = 0, y = 0;
  for (const k of keys) {
    const v = KEYMAP[k];
    if (v) {
      x += v[0];
      y += v[1];
    }
  }
  const d = Math.hypot(x, y);
  return d ? { x: x / d, y: y / d } : { x: 0, y: 0 };
}
