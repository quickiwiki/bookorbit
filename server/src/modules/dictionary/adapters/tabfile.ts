import type { Readable } from 'stream';
import type { DictionaryDefinition, DictionaryEntry } from '@bookorbit/types';

import { decodedLines, languageCode, type DslEntry } from './dsl-parser';

const MAX_DEFINITIONS = 30;

/**
 * Streams a tab-separated dictionary (StarDict "tabfile", as Wiktionary exports ship it):
 * `headword|form|form<TAB>definition`. The first headword is the card title; the rest are
 * inflected forms that should also find it.
 */
export async function* parseTabfile(input: Readable): AsyncGenerator<DslEntry> {
  for await (const line of decodedLines(input)) {
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const headwords = line
      .slice(0, tab)
      .split('|')
      .map((h) => h.trim())
      .filter(Boolean);
    const body = line.slice(tab + 1).trim();
    if (headwords.length > 0 && body) yield { headwords, body };
  }
}

/** `Turkish-English Wiktionary dictionary.tsv` names its language pair. */
export function languagesFromFilename(filename: string): { sourceLang: string | null; targetLang: string | null } {
  const match = /^([A-Za-z]+)-([A-Za-z]+)\b/.exec(filename.trim());
  return { sourceLang: languageCode(match?.[1] ?? null), targetLang: languageCode(match?.[2] ?? null) };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const n = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wiktionary exports format each sense block as `<i>pos</i><br><ol><li>…</li></ol>`; other
 * tabfiles may be plain text. Plain text becomes a single definition.
 */
export function renderTabfileBody(headword: string, body: string): DictionaryEntry[] {
  const entries: DictionaryEntry[] = [];
  let total = 0;
  const blocks = [...body.matchAll(/(?:<i>([\s\S]*?)<\/i>\s*(?:<br\s*\/?>)?\s*)?<ol>([\s\S]*?)<\/ol>/gi)];

  for (const block of blocks) {
    const definitions: DictionaryDefinition[] = [];
    for (const item of (block[2] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/gi)) {
      if (total >= MAX_DEFINITIONS) break;
      const text = htmlToText(item[1] ?? '');
      if (!text) continue;
      definitions.push({ definition: text, example: null });
      total += 1;
    }
    if (definitions.length > 0) entries.push({ partOfSpeech: htmlToText(block[1] ?? ''), definitions, sourceWord: headword });
  }

  if (entries.length === 0) {
    const text = htmlToText(body);
    if (text) entries.push({ partOfSpeech: '', definitions: [{ definition: text, example: null }], sourceWord: headword });
  }
  return entries;
}
