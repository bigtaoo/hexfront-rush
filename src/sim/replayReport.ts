// replayStats.ts as the text `npm run replays` prints.

import type { KindStats, ReplayStats, SideStats } from './replayStats';

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '-');
/** n / of to a tenth (or a whole), with integers only, as the rest of src/sim is held to. */
const avg = (n: number, of: number, digits = 1) => {
  if (!of) return '-';
  if (!digits) return String(Math.round(n / of));
  const t = Math.round((10 * n) / of);
  return `${Math.floor(t / 10)}.${t % 10}`;
};
const sorted = <K>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1]);
const sum = <K>(m: Map<K, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const RARITY = ['common', 'rare', 'epic', 'legendary'];
const KIND_ORDER = ['solo', 'online', 'ai'];

function sideLines(name: string, s: SideStats): string[] {
  if (!s.seats) return [];
  const built = sum(s.built);
  const mystery = s.mysteryWin + s.mysteryNothing;
  const rarity = s.rarity.reduce((a, b) => a + b, 0);
  const trained = sum(s.trained);
  return [
    `  ${name} (${s.seats} seats): won ${pct(s.won, s.seats)}, lost ${pct(s.lost, s.seats)}`,
    `    flips ${avg(s.flips, s.seats)}/match, ${pct(s.needGold, s.flips)} without the gold; first flip after ${avg(s.firstFlipSecs, s.firstFlips)} s`,
    `    built ${avg(built, s.seats)}/match: ${sorted(s.built).map(([k, n]) => `${k} ${pct(n, built)}`).join(', ') || '-'}`,
    `    mystery cards ${mystery}: ${pct(s.mysteryWin, mystery)} lucky`,
    `    barracks by rarity: ${RARITY.map((r, i) => `${r} ${pct(s.rarity[i]!, rarity)}`).join(', ')}`,
    `    trained ${avg(trained, s.seats)}/match: ${sorted(s.trained).map(([u, n]) => `${u} ${pct(n, trained)}`).join(', ') || '-'}`,
    `    map events ${avg(s.events, s.seats)}, quests ${avg(s.quests, s.seats)}, tiles at the end ${avg(s.tiles, s.seats, 0)}, gold left ${avg(s.goldLeft, s.seats, 0)}, most troops ${avg(s.peakUnits, s.seats)}`,
  ];
}

function kindLines(name: string, k: KindStats): string[] {
  const reasons = sorted(k.reasons).map(([r, n]) => `${r} ${pct(n, k.ended)}`).join(', ') || '-';
  const minutes = [...k.minutes].sort((a, b) => a[0] - b[0]).map(([m, n]) => `${m}m×${n}`).join(' ') || '-';
  return [
    `${name}: ${k.matches} matches, ${k.ended} played to the end (${pct(k.ended, k.matches)})`,
    `  blue won ${pct(k.blueWins, k.ended)}, red ${pct(k.redWins, k.ended)}, drawn ${pct(k.draws, k.ended)}; ended by ${reasons}`,
    `  length ${minutes}`,
    ...sideLines('players', k.player),
    ...sideLines('AI', k.ai),
  ];
}

export function formatReport(s: ReplayStats): string {
  const out = [`replays played ${s.played}, other engine version ${s.oldVersion}, desynced ${s.desynced}`];
  const kinds = [...s.kinds.keys()].sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));
  for (const k of kinds) out.push('', ...kindLines(k, s.kinds.get(k)!));
  return out.join('\n');
}
