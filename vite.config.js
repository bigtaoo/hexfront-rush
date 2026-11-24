import { defineConfig } from 'vite';
import { buildDefine } from './scripts/buildId.mjs';
import { WATCH_IGNORED } from './scripts/devWatch.mjs';
import { CHUNK_WARN_KB, preloadPixi } from './scripts/pixiPreload.mjs';

// The web build and the dev server (npm run dev). The relay (server/relay.ts) serves dist/ and
// takes the WebSocket on the same port; in dev the game talks to it on 8787 (src/net/netClient.ts).
// Fonts, music and sound effects sit in public/ and are copied as they are.
export default defineConfig({
  define: buildDefine(),
  plugins: [preloadPixi()],
  server: { port: 5207, strictPort: true, host: true, watch: { ignored: WATCH_IGNORED } },
  build: { target: 'es2020', outDir: 'dist', chunkSizeWarningLimit: CHUNK_WARN_KB },
  // 5 s is vitest's default; the long sim runs (whole matches, replays) want more under load.
  // 30 s is for everything else: it is the hang guard, not an allowance, so the five tests that
  // genuinely replay or play whole matches carry their own (ai, golden, collect, collector).
  // A CI runner's two cores stretch a sim run well past its time here, so anything measuring
  // over ~5 s locally belongs in that list rather than on this number.
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'], testTimeout: 30_000 },
});
