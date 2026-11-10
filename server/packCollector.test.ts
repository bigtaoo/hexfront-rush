// The collector bundle (scripts/packCollector.mjs) packs what collect.ts loads at run time, and
// nothing Node could not load as is in an image without node_modules.

import { describe, expect, it } from 'vitest';
import { closure, valueImports } from '../scripts/packCollector.mjs';

describe('packCollector', () => {
  it('follows value imports only', () => {
    const src = [
      "import http from 'node:http';",
      "import type { A } from './a.ts';",
      "import { type B, type C } from './b.ts';",
      "import { d, type E } from './d.ts';",
      'import {\n  f,\n  g,\n} from "./f.ts";',
      "export { h } from './h.ts';",
      "export type { I } from './i.ts';",
      "import './side.ts';",
    ].join('\n');
    expect(valueImports(src)).toEqual(['node:http', './d.ts', './f.ts', './h.ts', './side.ts']);
  });

  it('packs collect.ts with the five modules it runs on, none of the engine', () => {
    expect(closure('server/collect.ts')).toEqual([
      'server/collect.ts',
      'server/collector.ts',
      'server/privacy.ts',
      'server/replayShelf.ts',
      'src/sim/replayShape.ts',
      'src/sim/setup.ts',
    ]);
  });

  it('refuses what the image could not load', () => {
    // the relay needs the ws package: not a collector
    expect(() => closure('server/relay.ts')).toThrow(/package "ws"/);
  });
});
