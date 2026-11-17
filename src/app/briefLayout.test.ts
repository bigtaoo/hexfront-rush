import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A card whose whole body scrolls takes its buttons down with it. The stage brief was built that
// way: the rival, the twists, the goals, the tip and "Fight!" were all children of one scrolling
// card, and on a 568x320 phone held sideways every one of the 42 stages pushed the button row 24
// to 41 px below the card's bottom edge -- the player had to scroll a card with no visible handle
// to find the only way into the match. The fix is the how-to's: a scrolling body (.briefScroll)
// with the ad offer and the buttons pinned under it as the card's own children.
//
// Two things can quietly undo that, and neither shows up in a type check: moving an element into
// or out of the scrolling body in index.html, and a `#brief .card > x` rule that then points at
// nothing. This test reads index.html and holds both to the shape the layout needs.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const html = readFileSync(`${ROOT}index.html`, 'utf8');

interface Node {
  tag: string;
  id: string;
  cls: string[];
  parent: Node | null;
  kids: Node[];
}

/** The panel's markup as a tree; `<x ... />` closes itself, everything else is a pair. */
function tree(panelId: string): Node {
  const open = html.indexOf(`<div id="${panelId}"`);
  expect(open).toBeGreaterThan(0);
  const root: Node = { tag: 'div', id: panelId, cls: ['panel'], parent: null, kids: [] };
  let at: Node = root;
  let depth = 1;
  const tags = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
  tags.lastIndex = html.indexOf('>', open) + 1;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    const [, slash, tag, attrs, selfClose] = m as unknown as [string, string, string, string, string];
    if (slash) {
      depth -= 1;
      if (depth === 0) return root;
      at = at.parent ?? root;
      continue;
    }
    const node: Node = {
      tag,
      id: /\bid="([^"]*)"/.exec(attrs)?.[1] ?? '',
      cls: (/\bclass="([^"]*)"/.exec(attrs)?.[1] ?? '').split(/\s+/).filter(Boolean),
      parent: at,
      kids: [],
    };
    at.kids.push(node);
    if (selfClose) continue;
    depth += 1;
    at = node;
  }
  throw new Error(`#${panelId} is never closed`);
}

function walk(n: Node, out: Node[] = []): Node[] {
  out.push(n);
  n.kids.forEach((k) => walk(k, out));
  return out;
}

const brief = tree('brief');
const all = walk(brief);
const one = (test: (n: Node) => boolean, what: string): Node => {
  const hit = all.filter(test);
  expect(hit, what).toHaveLength(1);
  return hit[0]!;
};
const card = one((n) => n.cls.includes('card'), 'the brief has one card');
const scroll = one((n) => n.cls.includes('briefScroll'), 'the brief has one scrolling body');

/** Does one compound selector (`.a.b`, `#id`, `tag`, `*`) describe this node? */
function fits(n: Node, compound: string): boolean {
  if (compound === '*') return true;
  for (const part of compound.split(/(?=[.#])/)) {
    if (part.startsWith('.')) {
      if (!n.cls.includes(part.slice(1))) return false;
    } else if (part.startsWith('#')) {
      if (n.id !== part.slice(1)) return false;
    } else if (part !== n.tag) return false;
  }
  return true;
}

/** Whether `sel` (compounds joined by ' ' or '>') describes any node of the panel. */
function described(sel: string): boolean {
  const steps = sel.trim().split(/\s*(>)\s*|\s+/).filter(Boolean);
  const run = (n: Node, i: number): boolean => {
    if (!fits(n, steps[i]!)) return false;
    if (i === 0) return true;
    const combinator = steps[i - 1] === '>' ? '>' : ' ';
    const next = combinator === '>' ? i - 2 : i - 1;
    if (combinator === '>') return n.parent !== null && run(n.parent, next);
    for (let p = n.parent; p; p = p.parent) if (run(p, next)) return true;
    return false;
  };
  return all.some((n) => run(n, steps.length - 1));
}

/** Every selector in index.html's stylesheet, @media blocks included. */
function selectors(): string[] {
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const head = m[1]!.trim();
    if (head === '' || head.startsWith('@')) continue;
    out.push(...head.split(',').map((s) => s.trim()));
  }
  return out;
}

describe('the stage brief', () => {
  it('keeps the ad offer and the buttons out of the scrolling body', () => {
    const row = one((n) => n.cls.includes('row'), 'the brief has one button row');
    const boost = one((n) => n.id === 'boostBtn', 'the brief has one ad offer');
    for (const pinned of [row, boost]) {
      expect(pinned.parent).toBe(card);
      expect(walk(scroll)).not.toContain(pinned);
    }
    expect(walk(scroll).some((n) => n.id === 'briefGo')).toBe(false);
  });

  it('scrolls the rival, the twists, the goals and the tip', () => {
    for (const cls of ['rival', 'twists', 'goals', 'tip']) {
      const node = one((n) => n.cls.includes(cls), `the brief has one .${cls}`);
      expect(node.parent, `.${cls} is in the scrolling body`).toBe(scroll);
    }
  });

  it('lets the body shrink and scroll, or the buttons go off the card again', () => {
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const rule = /#brief \.briefScroll \{([^}]*)\}/.exec(css)?.[1] ?? '';
    // a flex item's min-height is auto: without the override it refuses to shrink below its
    // content and pushes the row out of the card instead of scrolling
    expect(rule).toMatch(/min-height:\s*0/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(css).toMatch(/#brief \.card \{[^}]*flex-direction:\s*column/);
  });

  it('has no rule left pointing at a child that moved', () => {
    const dead = selectors().filter((s) => s.startsWith('#brief') && s.includes('>') && !described(s));
    expect(dead).toEqual([]);
  });

  it('reads index.html, not a copy of it', () => {
    expect(described('#brief .card > .row .btn')).toBe(true);
    expect(described('#brief .briefScroll > .rival')).toBe(true);
    expect(described('#brief .card > .rival')).toBe(false);
    expect(described('#brief .briefScroll > .row')).toBe(false);
  });
});
