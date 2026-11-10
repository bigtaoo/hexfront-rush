// `npm run hclab -- '{"income":120}' 40`: a level-3 side with this setup against a standard one.
import { duel } from './ladder';
const a = JSON.parse(process.argv[2] ?? '{}');
const b = JSON.parse(process.env.VS ?? '{}');
const n = Number(process.argv[3] ?? 40);
const p = duel({ skill: 3, ...a }, { skill: 3, ...b }, n, Number(process.env.SEED0 ?? 1000), process.env.SIEGE ? Number(process.env.SIEGE) : undefined);
const med = [...p.secs].sort((x, y) => x - y)[p.secs.length >> 1]!;
console.log(`${JSON.stringify(a).padEnd(40)} vs ${JSON.stringify(b).padEnd(24)} ${Math.round((100 * p.wins) / p.games)}% (${p.wins}/${p.games}) median ${Math.floor(med / 60)}:${String(med % 60).padStart(2, '0')}`);
