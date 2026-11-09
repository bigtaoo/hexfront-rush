// Pixi imports its WebGL renderer and its browser extensions only once Application.init runs,
// after the whole main chunk has come in and run: one more round trip (over half a second on a
// slow phone line) before the first frame. Every build's page (vite.*.config.js) asks for them up
// front instead, next to the main chunk.
/** The dynamic chunks Pixi loads on its way to the first frame on a WebGL page. */
const PIXI_START = ['WebGLRenderer', 'browserAll', 'webworkerAll'];

/** The chunks a page should ask for at once: `starts` and what they import, by file. */
export function startChunks(bundle, starts = PIXI_START) {
  const byName = new Map();
  for (const c of Object.values(bundle)) if (c.type === 'chunk' && c.isDynamicEntry) byName.set(c.name, c);
  const out = new Set();
  const add = (file) => {
    if (out.has(file)) return;
    out.add(file);
    for (const dep of bundle[file]?.imports ?? []) add(dep);
  };
  for (const name of starts) {
    const c = byName.get(name);
    if (c) add(c.fileName);
  }
  // the entry and what it imports statically are fetched by the page already
  for (const c of Object.values(bundle)) {
    if (c.type === 'chunk' && c.isEntry) {
      out.delete(c.fileName);
      for (const dep of c.imports) out.delete(dep);
    }
  }
  return [...out].sort();
}

/** A plugin adding a modulepreload link per start chunk to the built page. */
export function preloadPixi() {
  return {
    name: 'preload-pixi',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        return addPreloads(html, startChunks(ctx.bundle), Object.values(ctx.bundle).find((c) => c.type === 'chunk' && c.isEntry)?.fileName);
      },
    },
  };
}

/** `html` with a modulepreload link per file before </head>, each written with the same base as
 *  the page's own script tag for `entry` (`/assets/…` or `./assets/…`). */
export function addPreloads(html, files, entry) {
  const at = entry ? html.match(new RegExp(`src="([^"]*)${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)) : null;
  if (!at || !files.length) return html;
  const links = files.map((f) => `<link rel="modulepreload" crossorigin href="${at[1]}${f}">`);
  return html.replace('</head>', `  ${links.join('\n    ')}\n  </head>`);
}

/** Vite's 500 kB chunk warning, raised: the main chunk (Pixi's core and the game, ~700 kB before
 *  gzip) is all code the first frame runs, so splitting it would only add round trips. The warning
 *  still comes once it grows past this. */
export const CHUNK_WARN_KB = 800;
