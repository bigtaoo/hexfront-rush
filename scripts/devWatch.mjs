// What the dev servers (vite.config.js, vite.playgama.config.js) do not watch: the build outputs
// and the installed packages. On Windows a watch on a folder a build deletes and rewrites fires
// thousands of events a second and keeps an idle dev server at full CPU (Potion Siege's
// scripts/devWatch.mjs, after Holy Kicker's 8267b39). Anchored at the repo root.

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const WATCH_IGNORED = ['dist*', 'node_modules', '.git'].map((d) => join(root, d, '**').replaceAll('\\', '/'));
