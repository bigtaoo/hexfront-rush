// The replays the relay keeps, for the operator to play again (`npm run replays`): the solo
// matches the game posts (POST /r, src/app/replayUpload.ts) and the online matches the relay
// records itself (server/collector.ts onlineDoc). One gzipped `<id>.json.gz` per match in the
// shelf's directory; a later upload of the same match (its end after the one sent when the page
// was hidden) replaces the earlier. Each is dropped KEEP_DAYS after it came, or the oldest first
// once the shelf is full. Ported from Potion Siege's shelf (D:\fang scripts/replayShelf.mjs).
//
// Nothing here says who played: a solo upload carries a random id made for that one match (the
// game stores none), an online one its room code. Node runs this file as is (type stripping).

import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Replay } from '../src/sim/replay.ts';
import type { Desync } from '../src/sim/replayDesync.ts';
import { parseReplay } from '../src/sim/replayShape.ts';

/** Days a replay is kept, and the most the shelf holds by default (REPLAY_BYTES overrides). */
export const KEEP_DAYS = 15;
export const MAX_BYTES = 1024 ** 3;
const KEEP_MS = KEEP_DAYS * 24 * 3600_000;
const SUFFIX = '.json.gz';

/** How a solo upload ends: its result, left for the menu, or the page hidden mid-match. */
export const SOLO_ENDS = ['won', 'lost', 'drawn', 'quit', 'hidden'] as const;
/** How the relay closes an online record: both seats reported the end, a seat left, or they desynced. */
export const ONLINE_ENDS = ['over', 'left', 'desync'] as const;

export interface ShelfDoc {
  /** The file's name: `s-<random>` for a solo upload, `o-<room>-<seed>` for an online match. */
  id: string;
  kind: 'solo' | 'online';
  end: string;
  /** When it came (ms since the epoch). */
  at: number;
  build?: string;
  platform?: string;
  replay: Replay;
  /** Online: the first checkpoint the seats disagreed on, their two hashes, and the commands
   *  from the replay's end up to it (the replay stops at the last checkpoint they agreed on), so
   *  `npm run replays` can play on to it and say whose hash the engine agrees with. */
  desync?: Desync;
}

const short = (max: number) => (v: unknown): v is string => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(v);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** What the relay keeps of a solo match the game posted, or null when it is not one. Only solo
 *  matches come this way (online ones the relay records itself), and only finished ticks. */
export function cleanUpload(body: unknown, at: number): ShelfDoc | null {
  if (!obj(body) || typeof body.id !== 'string' || !/^[\w-]{8,64}$/.test(body.id)) return null;
  if (!(SOLO_ENDS as readonly unknown[]).includes(body.end)) return null;
  const replay = parseReplay(body.replay);
  if (!replay || replay.config.aiBlue === replay.config.aiRed || replay.endTick === 0) return null;
  const doc: ShelfDoc = { id: `s-${body.id}`, kind: 'solo', end: body.end as string, at, replay };
  if (short(40)(body.build)) doc.build = body.build;
  if (short(20)(body.platform)) doc.platform = body.platform;
  return doc;
}

/** One file per replay in `dir`; their sizes and times are kept in memory to cap and prune them. */
export class ReplayShelf {
  private readonly files = new Map<string, { at: number; bytes: number }>();
  readonly dir: string;
  private readonly maxBytes: number;
  private readonly log: (...a: unknown[]) => void;

  // fields set by hand, not as parameter properties: Node strips types but runs nothing else
  constructor(dir: string, maxBytes = MAX_BYTES, log: (...a: unknown[]) => void = console.log) {
    this.dir = dir;
    this.maxBytes = maxBytes;
    this.log = log;
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(SUFFIX)) continue;
      try {
        const s = statSync(join(dir, f));
        this.files.set(f.slice(0, -SUFFIX.length), { at: s.mtimeMs, bytes: s.size });
      } catch {
        // gone since the listing
      }
    }
  }

  get count(): number {
    return this.files.size;
  }

  get bytes(): number {
    let n = 0;
    for (const f of this.files.values()) n += f.bytes;
    return n;
  }

  /** Keeps `doc` as `<id>`, over an earlier one of that name; false when it alone is too big. */
  put(doc: ShelfDoc): boolean {
    const zip = gzipSync(JSON.stringify(doc));
    if (zip.length > this.maxBytes) return false;
    this.makeRoom(doc.id, zip.length);
    // written aside and renamed, so a reader never sees half a file; dated `at`, as a restart reads it
    const path = join(this.dir, doc.id + SUFFIX);
    writeFileSync(`${path}.tmp`, zip);
    utimesSync(`${path}.tmp`, doc.at / 1000, doc.at / 1000);
    renameSync(`${path}.tmp`, path);
    this.files.set(doc.id, { at: doc.at, bytes: zip.length });
    return true;
  }

  /** Drops the oldest replays (never `name`'s own) until `bytes` more fit beside the rest. */
  private makeRoom(name: string, bytes: number): void {
    let used = this.bytes - (this.files.get(name)?.bytes ?? 0);
    if (used + bytes <= this.maxBytes) return;
    const oldest = [...this.files].filter(([n]) => n !== name).sort((a, b) => a[1].at - b[1].at);
    let dropped = 0;
    for (const [n, f] of oldest) {
      if (used + bytes <= this.maxBytes) break;
      this.drop(n);
      used -= f.bytes;
      dropped++;
    }
    this.log(`replays: shelf full, dropped the ${dropped} oldest`);
  }

  private drop(name: string): void {
    try {
      unlinkSync(join(this.dir, name + SUFFIX));
    } catch {
      // already gone
    }
    this.files.delete(name);
  }

  /** Drops the replays older than KEEP_DAYS; how many went. */
  prune(now: number): number {
    let n = 0;
    for (const [name, f] of this.files) {
      if (f.at >= now - KEEP_MS) continue;
      this.drop(name);
      n++;
    }
    if (n) this.log(`replays: deleted ${n} older than ${KEEP_DAYS} days`);
    return n;
  }
}

/** A shelf file's document, as put() wrote it. */
export const unzipDoc = (zip: Uint8Array): ShelfDoc => JSON.parse(gunzipSync(zip).toString('utf8')) as ShelfDoc;

/** Every replay kept in `dir`, oldest first: the shelf's `.json.gz` files, and plain `.json`
 *  files of a document or a bare replay (Hexfront.replay() saved from the console). A file that
 *  does not read is skipped. */
export function readShelf(dir: string, log: (s: string) => void = console.log): ShelfDoc[] {
  const docs: ShelfDoc[] = [];
  for (const f of readdirSync(dir)) {
    try {
      if (f.endsWith(SUFFIX)) docs.push(unzipDoc(readFileSync(join(dir, f))));
      else if (f.endsWith('.json')) {
        const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown;
        const bare = parseReplay(raw);
        if (bare) docs.push({ id: f.slice(0, -5), kind: bare.config.aiBlue || bare.config.aiRed ? 'solo' : 'online', end: 'file', at: statSync(join(dir, f)).mtimeMs, replay: bare });
        else if (obj(raw) && parseReplay(raw.replay)) docs.push(raw as unknown as ShelfDoc);
        else throw new Error('not a replay');
      }
    } catch (e) {
      log(`replays: skipped ${f}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return docs.sort((a, b) => a.at - b.at);
}
