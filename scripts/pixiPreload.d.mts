// Types for pixiPreload.mjs, for the tests.

export function startChunks(bundle: Record<string, unknown>, starts?: string[]): string[];
export function preloadPixi(): unknown;
export function addPreloads(html: string, files: string[], entry: string | undefined): string;
export const CHUNK_WARN_KB: number;
