import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The small screens are given their own rules in @media blocks, and a block that sits above the
// rule it means to override does nothing at all: the two selectors are the same, so they weigh the
// same, and the later one wins however narrow the screen is. Four declarations of the short-screen
// block were dead that way -- the result card's score size, its chip width and padding, and the
// star size -- because `.score`, `.chip` and `.stars b` are written further down the stylesheet. On
// a 320x480 phone the card therefore kept its 26 px score and its 90 px chips: the two chips drew
// 266 px inside a 254 px card, both their rims and the Menu button's were cut off by the card's
// edge, and a scrollbar was drawn across the card. Nothing about it looked wrong in the stylesheet,
// which is why this is a test and not a comment: it reads index.html's CSS and holds every
// declaration made for a screen size to the promise that nothing below undoes it.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

interface Decl {
  sel: string;
  prop: string;
  /** Where the rule starts in the stylesheet: later is stronger between equal selectors. */
  at: number;
  media: boolean;
}

/** Every declaration in index.html's stylesheet, by selector, flattened out of its rules. */
let blocks = 0;

function declarations(): Decl[] {
  const html = readFileSync(`${ROOT}index.html`, 'utf8');
  // comments go first: one of them holds a brace, and a parser that counts it loses track of which
  // block it is in -- that alone hid five of the eight @media blocks from an earlier draft of this
  const css = html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Decl[] = [];
  let i = 0;
  let depth = 0;
  let media = 0;
  let head = '';
  while (i < css.length) {
    const c = css[i]!;
    if (c === '}') {
      if (depth > 0) {
        depth--;
        if (media > 0) media--;
      }
      head = '';
      i++;
      continue;
    }
    if (c !== '{') {
      head += c;
      i++;
      continue;
    }
    const sels = head.trim();
    head = '';
    if (sels.startsWith('@')) {
      depth++;
      if (sels.startsWith('@media')) {
        media++;
        blocks++;
      }
      i++;
      continue;
    }
    // a plain rule: take its body whole, braces inside it and all
    let j = i + 1;
    let d = 1;
    let body = '';
    for (; j < css.length; j++) {
      if (css[j] === '{') d++;
      else if (css[j] === '}' && --d === 0) break;
      body += css[j];
    }
    for (const sel of sels.split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
      for (const decl of body.split(';')) {
        const k = decl.indexOf(':');
        if (k < 0) continue;
        const prop = decl.slice(0, k).trim();
        if (!/^[-a-z]+$/.test(prop)) continue;
        out.push({ sel, prop, at: i, media: media > 0 });
      }
    }
    i = j + 1;
  }
  return out;
}

describe('a rule written for a screen size is not undone by the one below it', () => {
  const decls = declarations();

  it('reads the whole stylesheet, inside the media blocks and out', () => {
    expect(decls.length).toBeGreaterThan(900);
    expect(decls.some((d) => d.media)).toBe(true);
    expect(decls.some((d) => !d.media)).toBe(true);
    // the short-screen block's own override of the result card, as the parser sees it
    expect(decls.some((d) => d.media && d.sel === '.chip' && d.prop === 'min-width')).toBe(true);
    // and every @media block in the file was walked into, not just the ones before the first brace
    // written inside a comment
    const html = readFileSync(`${ROOT}index.html`, 'utf8');
    expect(blocks).toBe((html.slice(0, html.indexOf('</style>')).match(/@media/g) ?? []).length);
  });

  it('leaves no @media declaration with a plain rule of the same selector below it', () => {
    const dead = decls
      .filter((m) => m.media)
      .flatMap((m) => decls.filter((b) => !b.media && b.sel === m.sel && b.prop === m.prop && b.at > m.at)
        .map((b) => `${m.sel} { ${m.prop} } is written for a screen size at ${m.at} and undone by the plain rule at ${b.at}`));
    expect(dead).toEqual([]);
  });
});
