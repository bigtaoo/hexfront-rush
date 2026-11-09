// Types for fileLength.mjs, for the tests.

export const MAX_LINES: number;
export function countLines(text: string): number;
export function lengthErrors(counts: Iterable<[string, number]>, baseline: Record<string, number>, max?: number): string[];
