// UI strings (view side only: the sim never formats text). One table per language in lang/.
//
// Only English is bundled with the game: it is the fallback for any key a table lacks, and the
// other twelve tables are separate chunks the boot fetches for the one language the player gets
// (`loadLang`, alongside the atlas and the font). Shipping all thirteen put about 40 KB gzipped of
// strings nobody reads into every first load. i18n.test.ts imports them all and holds them to the
// English table's keys and placeholders, so a lazy table is never a surprise.

import en from './lang/en';

export type Table = Record<string, string>;

/** The twelve tables that are fetched; English is already here. */
const LOADERS: Record<string, () => Promise<{ default: Table }>> = {
  zh: () => import('./lang/zh'),
  ru: () => import('./lang/ru'),
  es: () => import('./lang/es'),
  pt: () => import('./lang/pt'),
  de: () => import('./lang/de'),
  fr: () => import('./lang/fr'),
  tr: () => import('./lang/tr'),
  ja: () => import('./lang/ja'),
  ko: () => import('./lang/ko'),
  it: () => import('./lang/it'),
  pl: () => import('./lang/pl'),
  id: () => import('./lang/id'),
};
export const LANGS = ['en', ...Object.keys(LOADERS)] as const;
export type Lang = (typeof LANGS)[number];
export let LANG: Lang = 'en';
/** The table in use: English until `loadLang` has the player's. */
let table: Table = en;

/** Picks a table by an ISO 639-1 code; anything unknown falls back to English. The strings only
 *  change once `loadLang` resolves. */
export function setLang(code: string): void {
  LANG = (LANGS as readonly string[]).includes(code) ? (code as Lang) : 'en';
}
/** Fetches the chosen language's chunk. A chunk that never arrives leaves the game in English,
 *  which is a worse first screen than the player's own language but still a playable one. */
export async function loadLang(): Promise<void> {
  const load = LOADERS[LANG];
  if (!load) {
    table = en;
    return;
  }
  try {
    table = (await load()).default;
  } catch {
    table = en;
  }
}

/** Lilita One (public/fonts) has no CJK, no Hangul, no Cyrillic and lacks Turkish's ş ğ İ and
 *  Polish's ą ć ę ł ń ś ź ż: those languages draw in the system font at a real heavy weight, rather
 *  than mixing two fonts in one word. */
const SYSTEM_FONT: readonly string[] = ['zh', 'ja', 'ko', 'ru', 'tr', 'pl'];
export const systemFont = (): boolean => SYSTEM_FONT.includes(LANG);

/** The string for key in the current language, with {name} placeholders filled in. */
export function T(key: string, vars?: Record<string, string | number>): string {
  let s = table[key] ?? en[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace('{' + k + '}', String(vars[k]));
  return s;
}
