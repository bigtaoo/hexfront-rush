// Lets plain Node (with its built-in type stripping) run src/ code directly:
//   node --import ./scripts/tsResolve.mjs scripts/balance.ts
// src/ imports are extensionless, as Vite and tsc ("bundler" resolution) expect; Node's ESM
// resolver wants the file name, so a relative specifier that fails is retried with ".ts".
import { registerHooks } from 'node:module';

registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (err) {
      if (/^\.\.?\//.test(spec) && !/\.[cm]?[jt]s$|\.json$/.test(spec)) return next(spec + '.ts', ctx);
      throw err;
    }
  },
});
