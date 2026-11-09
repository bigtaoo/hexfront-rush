// `npm run pack:collector`: lays out the hosted replay collector in ../dist/hexfront-collector,
// ready to copy to the box (server/deploy/README.md):
//   Dockerfile, docker-compose.yml, env.example, README.md   from server/deploy/
//   app/package.json                                          {"type":"module"}
//   app/<path>                                                server/collect.ts and every module it
//                                                             loads, at the same relative paths
// The modules are found by following collect.ts's value imports (`import type` loads nothing at
// run time), so a new import is packed without editing this file. It refuses an import Node
// cannot load as is: a bare package (the image has no node_modules) or a path without `.ts`.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '..', 'dist', 'hexfront-collector');
const ENTRY = 'server/collect.ts';
const DEPLOY = ['Dockerfile', 'docker-compose.yml', 'env.example', 'README.md'];

/** The value imports of a module's source: [specifier], `import type` left out. */
export function valueImports(src) {
  const out = [];
  const re = /^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;
  for (const m of src.matchAll(re)) {
    if (m[5]) {
      out.push(m[5]);
      continue;
    }
    if (m[2]) continue;
    // `import { type A, type B } from` loads nothing either
    const names = m[3].replace(/^\{|\}$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    if (m[3].startsWith('{') && names.length && names.every((n) => n.startsWith('type '))) continue;
    out.push(m[4]);
  }
  return out;
}

/** Every module `entry` loads, itself included, as paths relative to ROOT. */
export function closure(entry, root = ROOT) {
  const seen = new Set();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of valueImports(readFileSync(join(root, file), 'utf8'))) {
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('.')) throw new Error(`${file}: imports the package "${spec}"; the collector image has none`);
      if (!spec.endsWith('.ts')) throw new Error(`${file}: imports "${spec}" without .ts; Node cannot load that as is`);
      const dep = relative(root, resolve(root, dirname(file), spec)).replace(/\\/g, '/');
      if (!existsSync(join(root, dep))) throw new Error(`${file}: "${spec}" is not there`);
      todo.push(dep);
    }
  }
  return [...seen].sort();
}

function main() {
  const files = closure(ENTRY);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'app'), { recursive: true });
  for (const f of files) cpSync(join(ROOT, f), join(OUT, 'app', f));
  writeFileSync(join(OUT, 'app', 'package.json'), `${JSON.stringify({ name: 'hexfront-collector', private: true, type: 'module' }, null, 2)}\n`);
  for (const f of DEPLOY) cpSync(join(ROOT, 'server', 'deploy', f), join(OUT, f));
  let bytes = 0;
  for (const f of files) bytes += statSync(join(ROOT, f)).size;
  console.log(`collector bundle in ${OUT}`);
  console.log(`  app: ${files.join(', ')} (${(bytes / 1024).toFixed(1)} KB)`);
  console.log(`  ${DEPLOY.join(', ')}`);
  console.log('next: server/deploy/README.md, "Deploy"');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
