import { Readable } from 'stream';
import { gzipSync } from 'zlib';
import { describe, expect, it } from 'vitest';

import { dictionaryKey } from './dictionary-key';
import type { DslEntry } from './dsl-parser';
import { languagesFromFilename, parseTabfile, renderTabfileBody } from './tabfile';

async function collect(text: Buffer) {
  const out: DslEntry[] = [];
  for await (const entry of parseTabfile(Readable.from([text]))) out.push(entry);
  return out;
}

describe('parseTabfile', () => {
  const tsv = 'кошка|ко́шки|ко́шкой\t<i>noun</i><br><ol><li>cat</li></ol>\nno tab here\n\t<i>x</i>\nдом\tplain text\n';

  it('splits headword forms and skips malformed lines', async () => {
    expect(await collect(Buffer.from(tsv))).toEqual([
      { headwords: ['кошка', 'ко́шки', 'ко́шкой'], body: '<i>noun</i><br><ol><li>cat</li></ol>' },
      { headwords: ['дом'], body: 'plain text' },
    ]);
  });

  it('reads gzipped files', async () => {
    expect(await collect(gzipSync(Buffer.from(tsv)))).toHaveLength(2);
  });
});

describe('renderTabfileBody', () => {
  it('maps Wiktionary sense blocks and decodes entities', () => {
    const body =
      '<i>noun</i><br><ol><li>the blood type AB</li></ol><br><i>name</i><br><ol><li>(politics) Initialism of <b>Avrupa</b> Birliği &amp; co</li></ol>';
    expect(renderTabfileBody('AB', body)).toEqual([
      { partOfSpeech: 'noun', definitions: [{ definition: 'the blood type AB', example: null }], sourceWord: 'AB' },
      { partOfSpeech: 'name', definitions: [{ definition: '(politics) Initialism of Avrupa Birliği & co', example: null }], sourceWord: 'AB' },
    ]);
  });

  it('treats plain text as one definition', () => {
    expect(renderTabfileBody('дом', 'house; home')).toEqual([
      { partOfSpeech: '', definitions: [{ definition: 'house; home', example: null }], sourceWord: 'дом' },
    ]);
  });
});

describe('languagesFromFilename', () => {
  it('reads the pair from Wiktionary export names', () => {
    expect(languagesFromFilename('Russian-English Wiktionary dictionary.tsv')).toEqual({ sourceLang: 'ru', targetLang: 'en' });
    expect(languagesFromFilename('English-English Wiktionary dictionary.tsv')).toEqual({ sourceLang: 'en', targetLang: 'en' });
    expect(languagesFromFilename('words.tsv')).toEqual({ sourceLang: null, targetLang: null });
  });
});

describe('dictionaryKey', () => {
  it('strips Russian stress marks and folds ё', () => {
    expect(dictionaryKey('Ко́шки', 'ru')).toBe('кошки');
    expect(dictionaryKey('Ёлка', 'ru')).toBe('елка');
    expect(dictionaryKey('йод', 'ru')).toBe('йод');
  });

  it('lowercases Turkish dotted and dotless I correctly', () => {
    expect(dictionaryKey('IŞIK', 'tr')).toBe('ışık');
    expect(dictionaryKey('İstanbul', 'tr')).toBe('istanbul');
    expect(dictionaryKey('Işık', 'tr')).toBe(dictionaryKey('ışık', 'tr'));
  });

  it('keeps accents outside Cyrillic and uses plain lowercasing elsewhere', () => {
    expect(dictionaryKey('Café', 'fr')).toBe('café');
    expect(dictionaryKey('INFO', 'en')).toBe('info');
  });
});
