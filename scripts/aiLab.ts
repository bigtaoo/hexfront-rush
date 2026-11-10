// `npm run ailab -- '[130,60,90,180]' 50`: a standard AI (level 3) weighing mines, towers, barracks
// and mysteries by these percents, against the balanced one, over 50 seeds both colours. For
// tuning the AI's taste by trial (it borrows the last AI_STYLES slot). SEED0=n picks other seeds.

import { AI_STYLES } from '../src/sim/ai';
import { duel } from './ladder';

const w = JSON.parse(process.argv[2] ?? '[100,100,100,100]') as number[];
const slot = AI_STYLES.length - 1;
(AI_STYLES as number[][])[slot] = w;
const n = Number(process.argv[3] ?? 50);
const p = duel({ skill: 3, style: slot }, { skill: 3, style: 0 }, n, Number(process.env.SEED0 ?? 1000));
console.log(`${JSON.stringify(w).padEnd(24)} ${Math.round((100 * p.wins) / p.games)}% (${p.wins}/${p.games})`);
