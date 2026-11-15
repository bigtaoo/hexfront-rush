// Numbers drawn from pictures (src/assets/digits.webp, tools/art/digits.py): a live Text drawn
// small and scaled with the board came out soft, and these match the art's sticker style (a white
// face with a hard cel shadow, a thick dark outline and a drop shadow). The face is white, so a
// sprite tint colours a number (gold, red) and its outline stays dark.
//
// A glyph set comes in twenty-four heights, each at most 1.149x the one under it; a number takes the
// smallest that is at least as tall as it is drawn in device pixels, so the texture (no mipmaps)
// is never shrunk past 0.87. Mipmaps would stop the shrinking from biting, but at 0.87 the GPU
// blends a fifth of the half-size mip into every texel and the 2 px outline this style lives on
// goes soft, which is the very thing the pictures are here for.
//
// A hard edge only stays hard if it lands on the device pixel grid, so a number in screen space
// (the HUD, damage numbers) is drawn texel for texel: it takes the nearest glyph size, is drawn at
// exactly that size, and every glyph's x and y land on a whole device pixel. A number that rides
// the camera (`screen` given: tile prices, floating gold) cannot be, as its parent's origin moves
// with the camera; its glyphs are still spaced on whole device pixels, so they all share one
// offset instead of each landing somewhere else inside a pixel.

import { Assets, Container, Sprite, Spritesheet, Texture, type SpritesheetData } from 'pixi.js';
import digitsJson from '../assets/digits.json';
import digitsUrl from '../assets/digits.webp?url';

/** What tools/art/digits.py wrote about the glyphs it drew, next to the frames themselves. */
interface DigitsMeta {
  /** Glyph heights in the sheet, texture pixels (digits.py SIZES), ascending. */
  sizes: number[];
  /** Per size: the middle of a digit's face, as a share of the glyph's height (where a number is
   *  anchored). It is not the same at every size: under about 25 px the outline and the drop
   *  shadow keep their 2 and 1 pixels and the face gives way instead. */
  mids: number[];
  /** Per size: how much of a glyph's height its neighbours cover, so their outlines merge into one rim. */
  overlaps: number[];
}
const META = (digitsJson as unknown as { meta: DigitsMeta }).meta;
const SIZES = META.sizes;

const NAMES: Record<string, string> = { '+': 'plus', '-': 'minus', ':': 'colon', '/': 'slash', '%': 'pct', x: 'x' };
for (let d = 0; d <= 9; d++) NAMES[String(d)] = String(d);
/** What a number may hold; other text stays a Text. */
export const NUM_TEXT = /^[0-9+\-:/%x]+$/;

let frames: Record<string, Texture> | null = null;
/** Device pixels per screen pixel (the renderer's resolution), set each frame by the renderer. */
let density = 1;

export async function loadDigits(): Promise<void> {
  if (frames) return;
  const tex = await Assets.load<Texture>({ src: digitsUrl, data: { autoGenerateMipmaps: false } });
  frames = await new Spritesheet(tex, digitsJson as unknown as SpritesheetData).parse();
}

export function setDigitDensity(d: number): void {
  density = d;
}

/** The index of the smallest sheet height at least `px` device pixels tall (the largest past it). */
function tier(px: number): number {
  for (let i = 0; i < SIZES.length; i++) if (SIZES[i]! >= px) return i;
  return SIZES.length - 1;
}

/** The sheet height a number `px` device pixels tall is drawn from. */
export function digitSize(px: number): number {
  return SIZES[tier(px)]!;
}

/** A screen coordinate moved to the nearest whole device pixel, so what is drawn there keeps its
 *  hard edges instead of being spread over two pixels. For screen-space numbers (hud.ts,
 *  overlays.ts); a number on the board moves with the camera and cannot be pinned to the grid. */
export function snapPx(v: number): number {
  return Math.round(v * density) / density;
}

function glyph(size: number, ch: string): Texture {
  return frames?.[`d${size}_${NAMES[ch]}`] ?? Texture.EMPTY;
}

export interface NumOpts {
  /** The number's height in its parent's units (about a Text's font size). */
  h: number;
  tint?: string;
  align?: 'left' | 'center' | 'right';
  /** Screen pixels per parent unit: the camera's scale for a number on the board, 1 on the HUD. */
  screen?: number;
}

/** A number as a row of glyph sprites, anchored at its left, centre or right middle like a label. */
export class Num extends Container {
  private glyphs: Sprite[] = [];
  /** What the row of glyphs was last laid out for, field by field: this runs over every number on
   *  screen every frame, and a string key meant building one (and a toFixed) each time. */
  private kText = '';
  private kSize = 0;
  private kH = 0;
  private kDev = 0;
  private kAlign = '';
  /** The colour the glyphs carry now: Pixi parses a CSS colour string on every tint write, and
   *  this ran over every glyph of every number on screen, every frame. */
  private lastTint: string | undefined;

  constructor(text = '', o?: NumOpts) {
    super();
    if (o) this.set(text, o);
  }

  set(text: string, o: NumOpts): void {
    // device pixels per unit of the parent this number sits in
    const dev = (o.screen ?? 1) * density;
    const need = o.h * dev;
    let ti = tier(need);
    let h = o.h;
    // A number in screen space is drawn texel for texel: it takes the nearest size instead of the
    // next one up and is then drawn at exactly that size, so one texel of the sheet is one device
    // pixel and the outline stays as hard as it was painted. The price is a height up to 7% off
    // the one asked for, which nothing on the HUD is laid out tightly enough to notice.
    // A number that rides the camera cannot have that: its height has to stay a smooth function
    // of the zoom, or it would jump a size at a time while the board moves under it.
    if (o.screen === undefined) {
      if (ti > 0 && need * need < SIZES[ti]! * SIZES[ti - 1]!) ti--;
      h = SIZES[ti]! / dev;
    }
    const size = SIZES[ti]!;
    const align = o.align ?? 'center';
    if (o.tint !== undefined && o.tint !== this.lastTint) {
      this.lastTint = o.tint;
      for (const g of this.glyphs) g.tint = o.tint;
    }
    if (text === this.kText && size === this.kSize && h === this.kH && dev === this.kDev && align === this.kAlign) return;
    this.kText = text;
    this.kSize = size;
    this.kH = h;
    this.kDev = dev;
    this.kAlign = align;
    const k = h / size;
    const overlap = META.overlaps[ti]! * size * k;
    const y = -META.mids[ti]! * size * k;
    let x = 0;
    let n = 0;
    for (const ch of text) {
      if (!NAMES[ch]) continue;
      let s = this.glyphs[n];
      if (!s) {
        s = new Sprite();
        this.glyphs.push(s);
        this.addChild(s);
      }
      s.texture = glyph(size, ch);
      s.visible = true;
      s.scale.set(k);
      if (o.tint !== undefined) s.tint = o.tint;
      s.x = x;
      s.y = Math.round(y * dev) / dev;
      x += s.texture.width * k - overlap;
      n++;
    }
    for (let i = n; i < this.glyphs.length; i++) this.glyphs[i]!.visible = false;
    const w = n ? x + overlap : 0;
    const x0 = align === 'left' ? 0 : align === 'right' ? -w : -w / 2;
    // every glyph starts on a whole device pixel: off the grid a 2 px outline is spread over
    // three, which is what made the numbers look soft
    for (let i = 0; i < n; i++) {
      const s = this.glyphs[i]!;
      s.x = Math.round((s.x + x0) * dev) / dev;
    }
    this.numW = w;
  }

  /** The number's width in its parent's units, as last set. */
  numW = 0;
}
