import { Readable } from 'stream';
import { createGunzip } from 'zlib';

export interface DslHeader {
  name: string | null;
  indexLanguage: string | null;
  contentsLanguage: string | null;
}

export interface DslEntry {
  headwords: string[];
  body: string;
}

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;
const PEEK_BYTES = 4;

/** ABBYY Lingvo headers and Wiktionary export file names use language names, not codes. */
const LANGUAGE_NAME_CODES: Record<string, string> = {
  english: 'en',
  russian: 'ru',
  german: 'de',
  french: 'fr',
  spanish: 'es',
  italian: 'it',
  portuguese: 'pt',
  ukrainian: 'uk',
  polish: 'pl',
  czech: 'cs',
  dutch: 'nl',
  swedish: 'sv',
  norwegian: 'no',
  danish: 'da',
  finnish: 'fi',
  greek: 'el',
  turkish: 'tr',
  chinese: 'zh',
  japanese: 'ja',
  korean: 'ko',
  latin: 'la',
  hungarian: 'hu',
  tatar: 'tt',
  kazakh: 'kk',
  belarusian: 'be',
  hebrew: 'he',
  arabic: 'ar',
};

export function languageCode(name: string | null): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(key)) return key;
  return LANGUAGE_NAME_CODES[key] ?? null;
}

function decoderFor(firstBytes: Buffer): TextDecoder {
  if (firstBytes[0] === 0xff && firstBytes[1] === 0xfe) return new TextDecoder('utf-16le');
  if (firstBytes[0] === 0xfe && firstBytes[1] === 0xff) return new TextDecoder('utf-16be');
  if (firstBytes[0] === 0xef && firstBytes[1] === 0xbb && firstBytes[2] === 0xbf) return new TextDecoder('utf-8');
  // Lingvo's default is BOM-less UTF-16LE: ASCII text then shows a zero in every odd byte.
  if (firstBytes.length >= 2 && firstBytes[1] === 0 && firstBytes[0] !== 0) return new TextDecoder('utf-16le');
  return new TextDecoder('utf-8');
}

async function* prependedBytes(head: Buffer, rest: AsyncIterator<Buffer>): AsyncGenerator<Buffer> {
  if (head.length > 0) yield head;
  for (;;) {
    const next = await rest.next();
    if (next.done) return;
    yield next.value;
  }
}

async function peek(iterator: AsyncIterator<Buffer>): Promise<Buffer> {
  let head = Buffer.alloc(0);
  while (head.length < PEEK_BYTES) {
    const next = await iterator.next();
    if (next.done) break;
    head = Buffer.concat([head, next.value]);
  }
  return head;
}

/** Decodes a DSL byte stream, transparently gunzipping `.dsl.dz` (dictzip is gzip-compatible). */
async function* decodedChunks(input: Readable): AsyncGenerator<string> {
  let iterator = input[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  let head = await peek(iterator);
  if (head.length === 0) return;

  if (head[0] === GZIP_MAGIC_0 && head[1] === GZIP_MAGIC_1) {
    const compressed = Readable.from(prependedBytes(head, iterator));
    const gunzip = createGunzip();
    compressed.on('error', (error) => gunzip.destroy(error));
    compressed.pipe(gunzip);
    iterator = gunzip[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
    head = await peek(iterator);
  }

  const decoder = decoderFor(head);
  for await (const chunk of prependedBytes(head, iterator)) {
    const text = decoder.decode(chunk, { stream: true });
    if (text) yield text;
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

/** Decoded text lines of a dictionary file, whatever its compression and encoding. */
export async function* decodedLines(input: Readable): AsyncGenerator<string> {
  let pending = '';
  let first = true;
  for await (const chunk of decodedChunks(input)) {
    pending += chunk;
    if (first) {
      pending = pending.replace(/^\uFEFF/, '');
      first = false;
    }
    let newline = pending.indexOf('\n');
    while (newline !== -1) {
      yield pending.slice(0, newline).replace(/\r$/, '');
      pending = pending.slice(newline + 1);
      newline = pending.indexOf('\n');
    }
  }
  if (pending) yield pending.replace(/\r$/, '');
}

function headerValue(line: string): string {
  return line
    .replace(/^#\S+\s*/, '')
    .trim()
    .replace(/^"(.*)"$/, '$1');
}

function stripComments(line: string): string {
  return line.replace(/\{\{.*?\}\}/g, '');
}

/**
 * Streams a Lingvo DSL file as entries. The header arrives through `onHeader` before the first
 * entry. Memory stays bounded to one entry, so multi-hundred-megabyte dictionaries are fine.
 */
export async function* parseDsl(input: Readable, onHeader: (header: DslHeader) => void): AsyncGenerator<DslEntry> {
  const header: DslHeader = { name: null, indexLanguage: null, contentsLanguage: null };
  let headerSent = false;
  let headwords: string[] = [];
  let body: string[] = [];

  const sendHeader = () => {
    if (headerSent) return;
    headerSent = true;
    onHeader(header);
  };

  for await (const rawLine of decodedLines(input)) {
    if (!headerSent && rawLine.startsWith('#')) {
      const key = rawLine.slice(1).split(/\s/, 1)[0]?.toUpperCase();
      if (key === 'NAME') header.name = headerValue(rawLine);
      else if (key === 'INDEX_LANGUAGE') header.indexLanguage = headerValue(rawLine);
      else if (key === 'CONTENTS_LANGUAGE') header.contentsLanguage = headerValue(rawLine);
      continue;
    }

    const line = stripComments(rawLine);
    if (line.trim() === '') continue;

    if (/^[ \t]/.test(line)) {
      if (headwords.length > 0) body.push(line.trim());
      continue;
    }

    sendHeader();
    if (body.length > 0) {
      yield { headwords, body: body.join('\n') };
      headwords = [];
      body = [];
    }
    headwords.push(line.trim());
  }

  sendHeader();
  if (headwords.length > 0 && body.length > 0) yield { headwords, body: body.join('\n') };
}

function unescapeDsl(text: string): string {
  return text.replace(/\\(.)/g, '$1');
}

/** The headword as Lingvo shows it: `{unsorted}` braces dropped but their text kept. */
export function displayHeadword(raw: string): string {
  return unescapeDsl(raw.replace(/(?<!\\)[{}]/g, '')).trim();
}

/** The form a lookup matches: unsorted `{...}` parts and optional `(...)` parts removed. */
export function indexHeadword(raw: string): string {
  return unescapeDsl(raw.replace(/(?<!\\)\{[^}]*\}/g, '').replace(/(?<!\\)\([^)]*\)/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}
