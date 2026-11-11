// The thirteen string tables have to agree: the same keys, and the same {placeholders} in each
// string. Only English is bundled (i18n.ts loads the rest as chunks), so a key missing from a
// translation shows an English line mid-sentence, and a placeholder typo prints "{n}" to a player
// in a language nobody here reads. This holds them all to the English table.

import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from './lang/en';
import zh from './lang/zh';
import ru from './lang/ru';
import es from './lang/es';
import pt from './lang/pt';
import de from './lang/de';
import fr from './lang/fr';
import tr from './lang/tr';
import ja from './lang/ja';
import ko from './lang/ko';
import it_ from './lang/it';
import pl from './lang/pl';
import id from './lang/id';

const TABLES: Record<string, Record<string, string>> = { en, zh, ru, es, pt, de, fr, tr, ja, ko, it: it_, pl, id };
const PLACEHOLDER = /\{(\w+)\}/g;
const marks = (s: string): string[] => [...s.matchAll(PLACEHOLDER)].map((m) => m[1]!).sort();

describe('i18n tables', () => {
  it('covers every file in lang/', () => {
    const files = readdirSync(new URL('./lang', import.meta.url)).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3));
    expect(files.sort()).toEqual(Object.keys(TABLES).sort());
  });

  for (const [code, table] of Object.entries(TABLES)) {
    if (code === 'en') continue;
    it(`${code} has English's keys, and no extras`, () => {
      expect(Object.keys(table).sort()).toEqual(Object.keys(en).sort());
    });
    it(`${code} keeps every {placeholder}`, () => {
      for (const key of Object.keys(en)) {
        const s = table[key];
        if (s === undefined) continue;
        expect([key, marks(s)]).toEqual([key, marks(en[key]!)]);
      }
    });
    it(`${code} says something in every string`, () => {
      for (const key of Object.keys(en)) expect([key, (table[key] ?? '').trim().length > 0]).toEqual([key, true]);
    });
  }
});
