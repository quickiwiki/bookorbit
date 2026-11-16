import { Readable } from 'stream';
import { gzipSync } from 'zlib';
import { describe, expect, it } from 'vitest';

import { displayHeadword, languageCode, indexHeadword, parseDsl, type DslEntry, type DslHeader } from './dsl-parser';

const SAMPLE = [
  '#NAME\t"Test En-Ru"',
  '#INDEX_LANGUAGE\t"English"',
  '#CONTENTS_LANGUAGE\t"Russian"',
  '',
  'cat',
  '\t[m1][p]n[/p][/m]',
  '\t[m1][trn]кошка[/trn][/m]',
  'dog',
  'hound',
  '\t[m1][trn]собака[/trn] {{a comment}}[/m]',
  '{(}to {)}run',
  '\t[m1][trn]бежать[/trn][/m]',
].join('\r\n');

function utf16le(text: string, bom = true): Buffer {
  const body = Buffer.from(text, 'utf16le');
  return bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body;
}

/** Splits into small chunks so multi-byte characters and lines straddle chunk boundaries. */
function chunked(buffer: Buffer, size = 7): Readable {
  const parts: Buffer[] = [];
  for (let i = 0; i < buffer.length; i += size) parts.push(buffer.subarray(i, i + size));
  return Readable.from(parts);
}

async function collect(input: Readable) {
  let header: DslHeader | null = null;
  const entries: DslEntry[] = [];
  for await (const entry of parseDsl(input, (h) => (header = h))) entries.push(entry);
  return { header: header as DslHeader | null, entries };
}

describe('parseDsl', () => {
  it('reads UTF-16LE with a BOM, split across arbitrary chunk boundaries', async () => {
    const { header, entries } = await collect(chunked(utf16le(SAMPLE)));

    expect(header).toEqual({ name: 'Test En-Ru', indexLanguage: 'English', contentsLanguage: 'Russian' });
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ headwords: ['cat'], body: '[m1][p]n[/p][/m]\n[m1][trn]кошка[/trn][/m]' });
    expect(entries[1]!.headwords).toEqual(['dog', 'hound']);
    expect(entries[1]!.body).not.toContain('comment');
    expect(entries[2]!.headwords).toEqual(['{(}to {)}run']);
  });

  it('detects BOM-less UTF-16LE', async () => {
    const { entries } = await collect(chunked(utf16le(SAMPLE, false)));
    expect(entries.map((e) => e.headwords[0])).toEqual(['cat', 'dog', '{(}to {)}run']);
  });

  it('reads UTF-8 with a BOM', async () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SAMPLE, 'utf8')]);
    const { header, entries } = await collect(chunked(buffer));
    expect(header?.name).toBe('Test En-Ru');
    expect(entries).toHaveLength(3);
  });

  it('gunzips .dsl.dz files', async () => {
    const { entries } = await collect(chunked(gzipSync(utf16le(SAMPLE)), 13));
    expect(entries).toHaveLength(3);
    expect(entries[0]!.body).toContain('кошка');
  });

  it('yields nothing for an empty stream', async () => {
    const { entries } = await collect(Readable.from([]));
    expect(entries).toEqual([]);
  });
});

describe('headword helpers', () => {
  it('keeps unsorted text for display but drops it for the index', () => {
    expect(displayHeadword('{(}to {)}run')).toBe('(to )run');
    expect(indexHeadword('{(}to {)}run')).toBe('to run');
    expect(indexHeadword('(to) run')).toBe('run');
  });

  it('drops optional parenthesised parts from the index and unescapes', () => {
    expect(indexHeadword('give (up)')).toBe('give');
    expect(displayHeadword('a\\{b\\}')).toBe('a{b}');
  });

  it('maps Lingvo language names to codes', () => {
    expect(languageCode('English')).toBe('en');
    expect(languageCode('Russian')).toBe('ru');
    expect(languageCode('de')).toBe('de');
    expect(languageCode('Klingon')).toBeNull();
    expect(languageCode(null)).toBeNull();
  });
});
