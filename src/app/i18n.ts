// UI strings (view side only: the sim never formats text). One table per language in lang/;
// English is the default and fills any key a table lacks.

import de from './lang/de';
import en from './lang/en';
import es from './lang/es';
import fr from './lang/fr';
import pt from './lang/pt';
import ru from './lang/ru';
import tr from './lang/tr';
import zh from './lang/zh';

const STR = { en, zh, ru, es, pt, de, fr, tr };
export type Lang = keyof typeof STR;
export const LANGS = Object.keys(STR) as Lang[];
export let LANG: Lang = 'en';

/** Picks a table by an ISO 639-1 code; anything unknown falls back to English. */
export function setLang(code: string): void {
  LANG = (LANGS as string[]).includes(code) ? (code as Lang) : 'en';
}

/** Lilita One (public/fonts) has no CJK, no Cyrillic and lacks Turkish's ş ğ İ: those languages
 *  draw in the system font at a real heavy weight, rather than mixing two fonts in one word. */
export const systemFont = (): boolean => LANG === 'zh' || LANG === 'ru' || LANG === 'tr';

/** The string for key in the current language, with {name} placeholders filled in. */
export function T(key: string, vars?: Record<string, string | number>): string {
  let s = STR[LANG]?.[key] ?? STR.en![key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace('{' + k + '}', String(vars[k]));
  return s;
}
