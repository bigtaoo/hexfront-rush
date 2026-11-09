'use strict';
// Deterministic state hash (after Holy Kicker's engine/core/hash): FNV-1a over a canonical walk.
// Object keys are visited sorted, so insertion order never matters. A non-integer number throws
// with its path: a float that sneaks into the sim state is a determinism bug and must be loud.

function hashState(root, skip) {
  let h = 0x811c9dc5;
  const word = (w) => {
    for (let k = 0; k < 4; k++) { h ^= (w >>> (k * 8)) & 0xff; h = Math.imul(h, 0x01000193); }
  };
  const num = (v, path) => {
    if (!Number.isSafeInteger(v)) throw new Error('hashState: non-integer ' + v + ' at ' + path);
    word(v >>> 0);
    word(Math.floor(v / 4294967296) >>> 0);
  };
  const str = (s) => { word(s.length); for (let i = 0; i < s.length; i++) word(s.charCodeAt(i)); };
  const walk = (v, path) => {
    if (v === null || v === undefined) { word(0xffffffff); return; }
    switch (typeof v) {
      case 'number': num(v, path); return;
      case 'boolean': word(v ? 1 : 0); return;
      case 'string': str(v); return;
      case 'object': break;
      default: throw new Error('hashState: unsupported ' + typeof v + ' at ' + path);
    }
    if (Array.isArray(v) || ArrayBuffer.isView(v)) {
      word(v.length);
      for (let i = 0; i < v.length; i++) walk(v[i], path + '[' + i + ']');
      return;
    }
    if (typeof v.peek === 'function') { num(v.peek(), path); return; }
    // determinism-lint: allow -- keys are sorted right here, the one place the order is fixed
    const keys = Object.keys(v).sort();
    for (const k of keys) {
      if (skip && skip.has(k)) continue;
      str(k);
      walk(v[k], path + '.' + k);
    }
  };
  walk(root, '$');
  return h >>> 0;
}
