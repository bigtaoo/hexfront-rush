// Numbers drawn from pictures (src/assets/digits.webp, tools/art/digits.py): a live Text drawn
// small and scaled with the board came out soft, and these match the art's sticker style (a white
// face with a hard cel shadow, a thick dark outline and a drop shadow). The face is white, so a
// sprite tint colours a number (gold, red) and its outline stays dark.
//
// A glyph set comes in a few heights; a number takes the smallest that is at least as tall as it
// is drawn in device pixels, so the texture (no mipmaps) is only ever shrunk a little.

import { Assets, Container, Sprite, Spritesheet, Texture, type SpritesheetData } from 'pixi.js';
import digitsJson from '../assets/digits.json';
import digitsUrl from '../assets/digits.webp?url';

/** Glyph heights in the sheet, texture pixels (tools/art/digits.py SIZES). */
const SIZES = [28, 40, 56, 80, 112] as const;
const NAMES: Record<string, string> = { '+': 'plus', '-': 'minus', ':': 'colon', '/': 'slash', '%': 'pct', x: 'x' };
for (let d = 0; d <= 9; d++) NAMES[String(d)] = String(d);
/** What a number may hold; other text stays a Text. */
export const NUM_TEXT = /^[0-9+\-:/%x]+$/;

/** How much of a glyph's height its neighbours cover, so their outlines merge into one rim. */
const OVERLAP = 0.09;
/** The middle of a digit, as a share of the glyph's height (outline above, outline and drop shadow below). */
const MID_Y = 0.44;

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

/** The smallest sheet height at least `px` device pixels tall (the largest past it). */
export function digitSize(px: number): number {
  return SIZES.find((s) => s >= px) ?? SIZES[SIZES.length - 1];
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
  private key = '';

  constructor(text = '', o?: NumOpts) {
    super();
    if (o) this.set(text, o);
  }

  set(text: string, o: NumOpts): void {
    const size = digitSize(o.h * (o.screen ?? 1) * density);
    const align = o.align ?? 'center';
    const key = `${text}|${o.h.toFixed(3)}|${size}|${align}`;
    if (o.tint !== undefined) for (const g of this.glyphs) g.tint = o.tint;
    if (key === this.key) return;
    this.key = key;
    const k = o.h / size;
    let x = 0;
    let n = 0;
    for (const ch of text) {
      if (!NAMES[ch]) continue;
      let s = this.glyphs[n];
      if (!s) {
        s = new Sprite();
        s.anchor.set(0, MID_Y);
        this.glyphs.push(s);
        this.addChild(s);
      }
      s.texture = glyph(size, ch);
      s.visible = true;
      s.scale.set(k);
      if (o.tint !== undefined) s.tint = o.tint;
      s.x = x;
      x += s.texture.width * k - size * OVERLAP * k;
      n++;
    }
    for (let i = n; i < this.glyphs.length; i++) this.glyphs[i]!.visible = false;
    const w = n ? x + size * OVERLAP * k : 0;
    const x0 = align === 'left' ? 0 : align === 'right' ? -w : -w / 2;
    for (let i = 0; i < n; i++) this.glyphs[i]!.x += x0;
    this.numW = w;
  }

  /** The number's width in its parent's units, as last set. */
  numW = 0;
}
