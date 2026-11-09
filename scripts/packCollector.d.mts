/** The value imports of a module's source (`import type` left out). */
export function valueImports(src: string): string[];
/** Every module `entry` loads, itself included, as paths relative to `root`. */
export function closure(entry: string, root?: string): string[];
