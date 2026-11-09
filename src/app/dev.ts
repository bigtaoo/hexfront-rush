// Dev switches, read from the URL on local hosts only (a portal page never gets them):
//   ?autoplay  the blue side plays itself (no tutorial)
//   ?speed=4   the simulation runs 4x (at most 16x)
//   ?seed=123  every match uses this map/AI seed
//   ?upload    solo matches send their replays to the dev relay (replayUpload.ts), as a build does

export interface DevSwitches {
  autoplay: boolean;
  speed: number;
  seed: number | null;
  upload: boolean;
}

export const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export function devSwitches(hostname: string, search: string): DevSwitches {
  const d: DevSwitches = { autoplay: false, speed: 1, seed: null, upload: false };
  if (!LOCAL_HOST.test(hostname)) return d;
  const q = new URLSearchParams(search);
  d.autoplay = q.has('autoplay');
  d.upload = q.has('upload');
  const sp = parseFloat(q.get('speed') ?? '');
  if (sp > 0) d.speed = Math.min(16, sp);
  const sd = parseInt(q.get('seed') ?? '', 10);
  if (Number.isFinite(sd)) d.seed = sd;
  return d;
}
