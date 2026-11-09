// Plays the collected replays again and says what they show (src/sim/replayStats.ts), the way
// Potion Siege's `npm run replays` does (D:\fang scripts/replays.test.ts):
//   npm run replays                    the relay's shelf (data/replays)
//   npm run replays -- path/to/dir     another folder: shelf files, or replays saved as .json
//   DAYS=3 npm run replays             only the last 3 days
//   BUILD=0.4.0 npm run replays        only uploads from builds starting with that
// An online match that went out of sync is played on to the tick where the seats disagreed, and
// the line says whose hash this engine agrees with: the other seat's client is the odd one out.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readShelf } from '../server/replayShelf.ts';
import { desyncVerdict, formatVerdict } from '../src/sim/replayDesync';
import { formatReport } from '../src/sim/replayReport';
import { addReplay, kindOf, newStats } from '../src/sim/replayStats';

const dir = resolve(process.argv[2] ?? process.env.REPLAYS ?? 'data/replays');
const days = Number(process.env.DAYS) || 0;
const build = process.env.BUILD ?? '';

if (!existsSync(dir)) {
  console.log(`no replays at ${dir}`);
  process.exit(0);
}

const since = days ? Date.now() - days * 24 * 3600_000 : 0;
const docs = readShelf(dir).filter((d) => d.at >= since && (!build || (d.build ?? '').startsWith(build)));
const ends = new Map<string, number>();
for (const d of docs) ends.set(`${d.kind} ${d.end}`, (ends.get(`${d.kind} ${d.end}`) ?? 0) + 1);
console.log(`${docs.length} replays in ${dir}${days ? `, last ${days} days` : ''}${build ? `, build ${build}*` : ''}`);
console.log(`  ${[...ends].map(([k, n]) => `${k} ${n}`).join(', ') || '-'}`);

const stats = newStats();
const bad: string[] = [];
for (const d of docs) {
  const got = addReplay(stats, d.replay);
  if (got === 'desync') bad.push(`  ${d.id}: does not play back to its own hashes (${kindOf(d.replay)}, ${d.end})`);
}
console.log('');
console.log(formatReport(stats));

const desyncs = docs.filter((d) => d.desync);
if (desyncs.length) {
  console.log('\nonline matches that went out of sync:');
  for (const d of desyncs) console.log(`  ${d.id}: ${formatVerdict(desyncVerdict(d.replay, d.desync!), d.desync!)}`);
}
if (bad.length) console.log(['\nreplays that did not play back:', ...bad].join('\n'));
