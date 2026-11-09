import { defineConfig } from 'vite';
import { buildDefine } from './scripts/buildId.mjs';
import { WATCH_IGNORED } from './scripts/devWatch.mjs';
import { CHUNK_WARN_KB, preloadPixi } from './scripts/pixiPreload.mjs';

// The Playgama build: `npm run build:playgama` writes dist-playgama/ and zips it into
// ../dist/hexfront-playgama.zip (scripts/pack_playgama.py), index.html at the archive's root.
// After Potion Siege's vite.playgama.config.js:
//  1. base './': the portal serves the upload from a path of its choosing;
//  2. the entry is src/main.playgama.ts instead of src/main.ts;
//  3. the Bridge SDK <script> (Playgama's CDN, its current stable v2) goes right ahead of the
//     entry, so the page paints while the tag downloads;
//  4. playgama-bridge-config.json sits next to index.html, where Bridge reads it from;
//  5. solo replays go nowhere unless the build names a collector (REPLAY_URL): then the menu's share
//     switch and privacy link appear, and finished solo matches go there for players who share them.
// The build fails if the HTML was never rewritten, rather than ship a game without the SDK.

/** Where the build sends replays: VITE_REPLAY_URL, e.g. the hosted collector
 *  (`VITE_REPLAY_URL=https://hf.gamestao.com/r`, server/deploy/README.md) or a local one while
 *  testing the build. Unset: nowhere, the share switch hidden. Off for now: the sandbox stage may
 *  not reach our own server, and a dead privacy link is worse than none. */
export const REPLAY_URL = process.env.VITE_REPLAY_URL || '';

const SDK_TAG = '<script src="https://bridge.playgama.com/v2/stable/playgama-bridge.js"></script>';
const DEFAULT_ENTRY = '/src/main.ts';
const PORTAL_ENTRY = '/src/main.playgama.ts';

/** One interstitial placement, after a match, no closer than a minute to the last. */
export const BRIDGE_CONFIG = {
  advertisement: {
    interstitial: { placementFallback: 'match_end', placements: [{ id: 'match_end' }], minimumDelayBetweenInterstitial: 60 },
  },
};

export function rewritePlaygamaHtml(html) {
  let out = html;
  if (out.includes(DEFAULT_ENTRY)) out = out.replace(DEFAULT_ENTRY, PORTAL_ENTRY);
  if (!out.includes('bridge.playgama.com')) out = out.replace('<script type="module"', `${SDK_TAG}\n    <script type="module"`);
  return out;
}

const playgama = () => {
  let applied = false;
  const apply = (html) => {
    const out = rewritePlaygamaHtml(html);
    if (out.includes(PORTAL_ENTRY) && out.includes('bridge.playgama.com')) applied = true;
    return out;
  };
  return {
    name: 'playgama-html',
    enforce: 'pre',
    // a build reaches the html through transform, dev through transformIndexHtml
    transform(code, id) {
      return id.endsWith('.html') ? apply(code) : null;
    },
    transformIndexHtml: apply,
    configureServer(server) {
      server.middlewares.use('/playgama-bridge-config.json', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(BRIDGE_CONFIG));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'playgama-bridge-config.json', source: JSON.stringify(BRIDGE_CONFIG, null, 2) });
    },
    closeBundle() {
      if (!applied) throw new Error('vite.playgama.config.js: index.html was never rewritten for Playgama');
    },
  };
};

export default defineConfig({
  base: './',
  define: { ...buildDefine(), 'import.meta.env.VITE_REPLAY_URL': JSON.stringify(REPLAY_URL) },
  plugins: [playgama(), preloadPixi()],
  server: { port: 5208, strictPort: true, host: true, watch: { ignored: WATCH_IGNORED } },
  build: { target: 'es2020', outDir: 'dist-playgama', emptyOutDir: true, chunkSizeWarningLimit: CHUNK_WARN_KB },
});
