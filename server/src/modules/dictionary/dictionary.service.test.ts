import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { RequestUser } from '../../common/types/request-user';
import type { DictionarySourceRow } from '../../db/schema';
import { DictionaryRepository } from './dictionary.repository';
import { DictionarySecretsService } from './dictionary-secrets.service';
import { DictionaryService, lookupCandidates, primaryLanguage, rankCards } from './dictionary.service';

const user = { id: 7, isSuperuser: false } as RequestUser;
const now = new Date('2026-11-14T10:00:00Z');

function source(overrides: Partial<DictionarySourceRow> = {}): DictionarySourceRow {
  return {
    id: 1,
    userId: 7,
    kind: 'dsl',
    name: 'Test',
    enabled: true,
    shared: false,
    sourceLang: 'en',
    targetLang: 'ru',
    status: 'ready',
    entryCount: 0,
    error: null,
    oxfordEnvironment: null,
    encryptedCredentials: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const DSL = [
  '#NAME\t"Mini"',
  '#INDEX_LANGUAGE\t"English"',
  '#CONTENTS_LANGUAGE\t"Russian"',
  'cat',
  '\t[m1][trn]кошка[/trn][/m]',
  'dog',
  '\t[m1]собака[/m]',
].join('\n');

function upload(text: string, filename: string, truncated = false, langs: { sourceLang?: string; targetLang?: string } = {}) {
  return { file: Readable.from([Buffer.from(text, 'utf8')]), filename, isTruncated: () => truncated, ...langs };
}

const TURKISH_TSV = [
  'ışık|ışığı|ışıkta\t<i>noun</i><br><ol><li>light</li><li>lamp</li></ol>',
  'İstanbul\t<i>name</i><br><ol><li>Istanbul</li></ol>',
].join('\n');

describe('DictionaryService', () => {
  let service: DictionaryService;
  let repo: { [K in keyof DictionaryRepository]: Mock<DictionaryRepository[K]> };
  let secrets: { encrypt: ReturnType<typeof vi.fn>; decrypt: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repo = {
      listVisibleSources: vi.fn().mockResolvedValue([]),
      findSource: vi.fn(),
      createSource: vi.fn().mockImplementation((data) => Promise.resolve(source({ ...data, id: 5 }))),
      updateSource: vi.fn().mockImplementation((id, data) => Promise.resolve(source({ id, ...data }))),
      deleteSource: vi.fn(),
      insertEntries: vi.fn(),
      deleteEntries: vi.fn(),
      failInterruptedImports: vi.fn().mockResolvedValue(0),
      enabledReadySources: vi.fn().mockResolvedValue([]),
      findEntries: vi.fn().mockResolvedValue([]),
    };
    secrets = { encrypt: vi.fn().mockReturnValue('cipher'), decrypt: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [DictionaryService, { provide: DictionaryRepository, useValue: repo }, { provide: DictionarySecretsService, useValue: secrets }],
    }).compile();
    service = moduleRef.get(DictionaryService);
  });

  describe('importDsl', () => {
    it('streams entries into the database and adopts the header name and languages', async () => {
      const result = await service.importFile(user, upload(DSL, 'mini.dsl'));

      expect(repo.createSource).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, kind: 'dsl', name: 'mini', status: 'importing' }));
      const inserted = repo.insertEntries.mock.calls.flatMap(([, cards]) => cards);
      expect(repo.insertEntries.mock.calls.every(([id]) => id === 5)).toBe(true);
      expect(inserted).toEqual([
        { headword: 'cat', body: '[m1][trn]кошка[/trn][/m]', forms: ['cat'] },
        { headword: 'dog', body: '[m1]собака[/m]', forms: ['dog'] },
      ]);
      expect(result).toMatchObject({ status: 'ready', entryCount: 2, name: 'Mini', sourceLang: 'en', targetLang: 'ru' });
    });

    it('marks the source failed and removes partial entries when nothing is parsed', async () => {
      await expect(service.importFile(user, upload('not a dictionary', 'x.dsl'))).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.deleteEntries).toHaveBeenCalledWith(5);
      expect(repo.updateSource).toHaveBeenLastCalledWith(5, expect.objectContaining({ status: 'failed', entryCount: 0 }));
    });

    it('fails a truncated upload', async () => {
      await expect(service.importFile(user, upload(DSL, 'x.dsl', true))).rejects.toThrow(/upload limit/);
      expect(repo.updateSource).toHaveBeenLastCalledWith(5, expect.objectContaining({ status: 'failed' }));
    });

    it('imports a Wiktionary tabfile with Turkish-aware keys and languages from the file name', async () => {
      const result = await service.importFile(user, upload(TURKISH_TSV, 'Turkish-English Wiktionary dictionary.tsv'));

      expect(repo.createSource).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tabfile', sourceLang: 'tr', targetLang: 'en' }));
      const cards = repo.insertEntries.mock.calls.flatMap(([, c]) => c);
      expect(cards.map((c: { forms: string[] }) => c.forms)).toEqual([['ışık', 'ışığı', 'ışıkta'], ['istanbul']]);
      expect(result).toMatchObject({ status: 'ready', entryCount: 2, name: 'Turkish-English Wiktionary dictionary' });
    });

    it('lets explicit languages override the file name', async () => {
      await service.importFile(user, upload(TURKISH_TSV, 'words.tsv', false, { sourceLang: 'TR', targetLang: 'ru' }));
      expect(repo.createSource).toHaveBeenCalledWith(expect.objectContaining({ sourceLang: 'tr', targetLang: 'ru' }));
    });

    it('rejects unknown file types before creating a source', async () => {
      await expect(service.importFile(user, upload('x', 'notes.pdf'))).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.createSource).not.toHaveBeenCalled();
    });
  });

  describe('lookup', () => {
    it('only asks sources matching the book language and renders DSL cards', async () => {
      repo.enabledReadySources.mockResolvedValue([
        source({ id: 1, sourceLang: 'en' }),
        source({ id: 2, sourceLang: 'de' }),
        source({ id: 3, sourceLang: null }),
      ]);
      repo.findEntries.mockImplementation((id: number) =>
        Promise.resolve(id === 1 ? [{ headword: 'cat', body: '[m1][trn]кошка[/trn][/m]', rank: 1 }] : []),
      );

      const results = await service.lookup(user, 'Cats', 'en-GB');

      expect(repo.findEntries.mock.calls.map(([id]) => id)).toEqual([1, 3]);
      expect(repo.findEntries).toHaveBeenCalledWith(1, ['cats', 'cat']);
      expect(results).toEqual([
        {
          sourceId: 1,
          sourceName: 'Test',
          targetLang: 'ru',
          provider: 'dsl',
          word: 'cat',
          phonetic: null,
          audioUrl: null,
          entries: [{ partOfSpeech: '', definitions: [{ definition: 'кошка', example: null }], sourceWord: 'cat' }],
        },
      ]);
    });

    it('looks Turkish words up with Turkish casing and renders tabfile cards', async () => {
      repo.enabledReadySources.mockResolvedValue([source({ id: 9, kind: 'tabfile', sourceLang: 'tr', targetLang: 'en' })]);
      repo.findEntries.mockResolvedValue([{ headword: 'ışık', body: '<i>noun</i><br><ol><li>light</li></ol>', rank: 0 }]);

      const [result] = await service.lookup(user, 'IŞIK', 'tr');

      expect(repo.findEntries).toHaveBeenCalledWith(9, ['ışık']);
      expect(result?.entries).toEqual([{ partOfSpeech: 'noun', definitions: [{ definition: 'light', example: null }], sourceWord: 'ışık' }]);
    });

    it('skips an Oxford source whose credentials cannot be decrypted', async () => {
      repo.enabledReadySources.mockResolvedValue([source({ kind: 'oxford', oxfordEnvironment: 'sandbox', encryptedCredentials: 'x' })]);
      secrets.decrypt.mockReturnValue(null);
      await expect(service.lookup(user, 'cat', 'en')).resolves.toEqual([]);
    });

    it('swallows a failing source instead of failing the whole lookup', async () => {
      repo.enabledReadySources.mockResolvedValue([source()]);
      repo.findEntries.mockRejectedValue(new Error('db down'));
      await expect(service.lookup(user, 'cat', 'en')).resolves.toEqual([]);
    });
  });

  it('refuses to change the word language of an imported dictionary', async () => {
    repo.findSource.mockResolvedValue(source({ kind: 'tabfile', sourceLang: 'tr' }));
    await expect(service.updateSource(user, 1, { sourceLang: 'ru' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateSource(user, 1, { sourceLang: 'tr', targetLang: 'ru' })).resolves.toMatchObject({ targetLang: 'ru' });
  });

  it("refuses to change another user's dictionary", async () => {
    repo.findSource.mockResolvedValue(source({ userId: 99 }));
    await expect(service.updateSource(user, 1, { enabled: false })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deleteSource(user, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('sharing', () => {
    it('shares a ready file dictionary', async () => {
      repo.findSource.mockResolvedValue(source({ kind: 'tabfile' }));
      await expect(service.setShared(user, 1, true)).resolves.toMatchObject({ shared: true, owned: true, ownerName: null });
      expect(repo.updateSource).toHaveBeenCalledWith(1, { shared: true });
    });

    it('keeps Oxford sources and unfinished imports private', async () => {
      repo.findSource.mockResolvedValue(source({ kind: 'oxford' }));
      await expect(service.setShared(user, 1, true)).rejects.toBeInstanceOf(BadRequestException);
      repo.findSource.mockResolvedValue(source({ status: 'importing' }));
      await expect(service.setShared(user, 1, true)).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.updateSource).not.toHaveBeenCalled();
    });

    it("refuses to share another user's dictionary", async () => {
      repo.findSource.mockResolvedValue(source({ userId: 99 }));
      await expect(service.setShared(user, 1, true)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lists shared dictionaries of others as read-only, naming who shared them', async () => {
      repo.listVisibleSources.mockResolvedValue([
        { source: source({ id: 1 }), ownerName: 'Me' },
        { source: source({ id: 2, userId: 99, shared: true }), ownerName: 'Admin' },
      ]);
      const listed = await service.listSources(user);
      expect(listed.map((s) => [s.id, s.owned, s.shared, s.ownerName])).toEqual([
        [1, true, false, null],
        [2, false, true, 'Admin'],
      ]);
    });

    it("lets a user look words up in someone else's shared dictionary but not change it", async () => {
      const shared = source({ id: 2, userId: 99, shared: true, kind: 'tabfile', sourceLang: 'tr', targetLang: 'en' });
      repo.enabledReadySources.mockResolvedValue([shared]);
      repo.findEntries.mockResolvedValue([{ headword: 'ışık', body: '<i>noun</i><br><ol><li>light</li></ol>', rank: 0 }]);
      await expect(service.lookup(user, 'ışık', 'tr')).resolves.toHaveLength(1);
      repo.findSource.mockResolvedValue(shared);
      await expect(service.updateSource(user, 2, { enabled: false })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.deleteSource(user, 2)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('encrypts Oxford credentials and never returns them', async () => {
    const created = await service.createOxfordSource(user, {
      name: 'Oxford',
      appId: ' id ',
      appKey: ' key ',
      environment: 'sandbox',
      sourceLang: 'EN',
    });
    expect(secrets.encrypt).toHaveBeenCalledWith({ appId: 'id', appKey: 'key' });
    expect(created).toMatchObject({ hasCredentials: true, sourceLang: 'en' });
    expect(JSON.stringify(created)).not.toContain('key');
  });
});

describe('helpers', () => {
  it('reduces language tags to their primary subtag', () => {
    expect(primaryLanguage('en-US')).toBe('en');
    expect(primaryLanguage('pt_BR')).toBe('pt');
    expect(primaryLanguage('  ')).toBeNull();
  });

  it('builds naive base-form candidates, exact form first', () => {
    expect(lookupCandidates('Studies')).toEqual(['studies', 'study', 'studi', 'studie']);
    expect(lookupCandidates('running')).toEqual(['running', 'runn', 'run', 'runne']);
    expect(lookupCandidates('making')).toEqual(['making', 'mak', 'make']);
    expect(lookupCandidates('go')).toEqual(['go']);
    expect(lookupCandidates('кошки', 'ru')).toEqual(['кошки']);
  });

  it('puts the card titled with the looked-up form ahead of cards that only list it', () => {
    const cards = [
      { headword: 'rin', rank: 0 },
      { headword: 'run', rank: 0 },
      { headword: 'Running', rank: 0 },
      { headword: 'runn', rank: 1 },
    ];
    expect(rankCards(cards, ['running', 'runn'], 'en').map((c) => c.headword)).toEqual(['Running', 'rin', 'run', 'runn']);
  });

  it('prefers the card spelled like the looked-up word, then the lowercase one', () => {
    const cards = [
      { headword: 'Stick', rank: 0 },
      { headword: 'stick', rank: 0 },
    ];
    expect(rankCards(cards, ['stick'], 'en', 'stick').map((c) => c.headword)).toEqual(['stick', 'Stick']);
    expect(rankCards(cards, ['stick'], 'en', 'Stick').map((c) => c.headword)).toEqual(['Stick', 'stick']);
    expect(rankCards(cards, ['stick'], null).map((c) => c.headword)).toEqual(['stick', 'Stick']);
  });

  it('reads a word in capitals as the ordinary word, not an abbreviation', () => {
    const cards = [
      { headword: 'ASK', rank: 0 },
      { headword: 'ask', rank: 0 },
    ];
    expect(rankCards(cards, ['ask'], 'en', 'ASK').map((c) => c.headword)).toEqual(['ask', 'ASK']);
  });

  it('keeps at most five cards', () => {
    const cards = Array.from({ length: 8 }, (_, i) => ({ headword: `w${i}`, rank: 0 }));
    expect(rankCards(cards, ['x'], 'en')).toHaveLength(5);
  });
});
