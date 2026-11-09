// The build id the game shows and sends with its hashes: the package version and the commit it
// was built from, e.g. 0.4.0+61b33eb, `-dirty` when tracked files had uncommitted changes.
// After Potion Siege's scripts/buildId.mjs. Without git (a tarball) it is the version alone.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const git = (args) => {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};

const packageVersion = () => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

/** `run` answers a git command with its trimmed output, '' when git fails; the tests fake both. */
export function buildId(run = git, version = packageVersion()) {
  const sha = run('rev-parse --short=7 HEAD');
  if (!sha) return version;
  return `${version}+${sha}${run('status --porcelain --untracked-files=no') ? '-dirty' : ''}`;
}

/** Vite's `define` for it: `__HF_BUILD__` in the client. */
export const buildDefine = () => ({ __HF_BUILD__: JSON.stringify(buildId()) });
