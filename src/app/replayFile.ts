// A replay from a file: what Hexfront.replay() gives on the console (saved as .json), or one of the
// relay's shelf files (`<id>.json.gz`, server/replayShelf.ts), dropped onto the page on a local
// host to watch it (boot.ts). Both are checked by parseReplay before the engine sees them.

import type { Replay } from '../sim/replay';
import { parseReplay } from '../sim/replayShape';

/** The replay in a parsed JSON value: a bare replay, or a shelf document holding one. */
export function replayFromJson(x: unknown): Replay | null {
  const bare = parseReplay(x);
  if (bare) return bare;
  if (x && typeof x === 'object' && 'replay' in x) return parseReplay((x as { replay: unknown }).replay);
  return null;
}

/** The replay in a dropped file (.json, or gzipped .json.gz), null when it holds none. */
export async function readReplayFile(file: Blob & { name: string }): Promise<Replay | null> {
  try {
    const text = file.name.endsWith('.gz')
      ? await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text()
      : await file.text();
    return replayFromJson(JSON.parse(text));
  } catch {
    return null;
  }
}
