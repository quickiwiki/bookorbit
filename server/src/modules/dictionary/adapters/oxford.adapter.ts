import type { DictionaryDefinition, DictionaryEntry, OxfordEnvironment } from '@bookorbit/types';

export const OXFORD_BASE_URLS: Record<OxfordEnvironment, string> = {
  sandbox: 'https://od-api-sandbox.oxforddictionaries.com/api/v2',
  production: 'https://od-api.oxforddictionaries.com/api/v2',
};

const REQUEST_TIMEOUT_MS = 8000;
const MAX_DEFINITIONS_PER_ENTRY = 8;

export interface OxfordCredentials {
  appId: string;
  appKey: string;
}

export interface OxfordLookupInput {
  environment: OxfordEnvironment;
  credentials: OxfordCredentials;
  word: string;
  sourceLang: string;
  targetLang: string | null;
}

export interface OxfordLookupResult {
  word: string;
  phonetic: string | null;
  audioUrl: string | null;
  entries: DictionaryEntry[];
}

export class OxfordRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OxfordRequestError';
  }
}

type Json = Record<string, unknown>;

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === 'object') as Json[]) : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function senseDefinitions(sense: Json, translating: boolean): DictionaryDefinition[] {
  const example = asString(asArray(sense['examples'])[0]?.['text']);
  const texts = translating
    ? asArray(sense['translations'])
        .map((t) => asString(t['text']))
        .filter((t): t is string => t !== null)
    : (Array.isArray(sense['definitions']) ? (sense['definitions'] as unknown[]) : []).map(asString).filter((t): t is string => t !== null);

  const own = texts.length > 0 ? [{ definition: texts.join(', '), example }] : [];
  const nested = asArray(sense['subsenses']).flatMap((sub) => senseDefinitions(sub, translating));
  return [...own, ...nested];
}

/** Maps an Oxford Dictionaries API v2 `entries` or `translations` payload to reader senses. */
export function parseOxfordPayload(data: unknown, fallbackWord: string, translating: boolean): OxfordLookupResult | null {
  if (!data || typeof data !== 'object') return null;
  const results = asArray((data as Json)['results']);
  const entries: DictionaryEntry[] = [];
  let phonetic: string | null = null;
  let audioUrl: string | null = null;
  let word = fallbackWord;

  for (const result of results) {
    word = asString(result['word']) ?? word;
    for (const lexical of asArray(result['lexicalEntries'])) {
      const partOfSpeech = asString((lexical['lexicalCategory'] as Json | undefined)?.['text']) ?? '';
      const definitions: DictionaryDefinition[] = [];
      for (const entry of asArray(lexical['entries'])) {
        for (const pronunciation of asArray(entry['pronunciations'])) {
          phonetic ??= asString(pronunciation['phoneticSpelling']);
          audioUrl ??= asString(pronunciation['audioFile']);
        }
        for (const sense of asArray(entry['senses'])) definitions.push(...senseDefinitions(sense, translating));
      }
      if (definitions.length > 0) {
        entries.push({ partOfSpeech, definitions: definitions.slice(0, MAX_DEFINITIONS_PER_ENTRY), sourceWord: word });
      }
    }
  }

  return entries.length > 0 ? { word, phonetic, audioUrl, entries } : null;
}

export async function lookupOxford(input: OxfordLookupInput, fetchImpl: typeof fetch = fetch): Promise<OxfordLookupResult | null> {
  const base = OXFORD_BASE_URLS[input.environment];
  const wordId = encodeURIComponent(input.word.trim().toLowerCase());
  const translating = input.targetLang !== null && input.targetLang !== input.sourceLang;
  const path = translating
    ? `/translations/${encodeURIComponent(input.sourceLang)}/${encodeURIComponent(input.targetLang!)}/${wordId}`
    : `/entries/${encodeURIComponent(input.sourceLang)}/${wordId}`;

  const response = await fetchImpl(`${base}${path}?strictMatch=false`, {
    headers: { Accept: 'application/json', app_id: input.credentials.appId, app_key: input.credentials.appKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) throw new OxfordRequestError('Oxford rejected the app id or key', response.status);
  if (!response.ok) throw new OxfordRequestError(`Oxford API answered ${response.status}`, response.status);

  return parseOxfordPayload(await response.json(), input.word, translating);
}
