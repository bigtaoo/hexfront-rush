// The rules behind scripts/checkFileLength.mjs, apart from the walk over the disk so the tests can
// run them: how lines are counted, and what a set of counts says against MAX_LINES and a baseline.

export const MAX_LINES = 500;

// as an editor numbers them: a final newline does not start another line
export const countLines = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

/**
 * The complaints for `counts` ([path, lines] pairs, paths with forward slashes): a file over `max`
 * that the baseline does not hold, and a held file that grew past its cap, shrank (its cap should
 * follow it down), fell to `max` or under (it should leave the list) or is gone. Empty when all is well.
 */
export function lengthErrors(counts, baseline, max = MAX_LINES) {
  const errors = [];
  const seen = new Set();
  for (const [path, lines] of counts) {
    const cap = baseline[path];
    if (cap === undefined) {
      if (lines > max) errors.push(`${path}: ${lines} lines, over ${max}`);
      continue;
    }
    seen.add(path);
    if (lines > cap) errors.push(`${path}: ${lines} lines, grew past its ${cap}; move the new code to its own file`);
    else if (lines <= max) errors.push(`${path}: down to ${lines} lines; take it out of BASELINE in scripts/checkFileLength.mjs`);
    else if (lines < cap) errors.push(`${path}: down to ${lines} lines; lower its BASELINE entry in scripts/checkFileLength.mjs from ${cap} to ${lines}`);
  }
  for (const path of Object.keys(baseline)) {
    if (!seen.has(path)) errors.push(`${path}: gone; take it out of BASELINE in scripts/checkFileLength.mjs`);
  }
  return errors;
}
