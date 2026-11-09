// Types for buildId.mjs, for the tests.

export function git(args: string): string;
export function buildId(run?: (args: string) => string, version?: string): string;
export function buildDefine(): { __HF_BUILD__: string };
