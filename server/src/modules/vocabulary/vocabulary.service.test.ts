import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { RequestUser } from '../../common/types/request-user';
import type { VocabularyListRow, VocabularyWordRow } from '../../db/schema';
import { BookService } from '../book/book.service';
import { DEFAULT_VOCABULARY_LIST_NAME, VocabularyService } from './vocabulary.service';
import { VocabularyRepository } from './vocabulary.repository';

const user = { id: 7, isSuperuser: false } as RequestUser;
const now = new Date('2026-11-14T10:00:00Z');

function list(overrides: Partial<VocabularyListRow> = {}): VocabularyListRow {
  return { id: 1, userId: 7, name: DEFAULT_VOCABULARY_LIST_NAME, isDefault: true, createdAt: now, updatedAt: now, ...overrides };
}

function word(overrides: Partial<VocabularyWordRow> = {}): VocabularyWordRow {
  return {
    id: 10,
    userId: 7,
    listId: 1,
    word: 'Ephemeral',
    normalizedWord: 'ephemeral',
    definition: null,
    context: null,
    bookId: null,
    bookFileId: null,
    bookFormat: null,
    bookTitle: null,
    cfi: null,
    pageno: null,
    language: null,
    learned: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('VocabularyService', () => {
  let service: VocabularyService;
  let repo: { [K in keyof VocabularyRepository]: Mock<VocabularyRepository[K]> };
  let books: { verifyBookAccess: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    repo = {
      listsWithCounts: vi.fn().mockResolvedValue([]),
      findList: vi.fn(),
      findListByName: vi.fn(),
      ensureDefaultList: vi.fn().mockResolvedValue(list()),
      createList: vi.fn(),
      renameList: vi.fn(),
      deleteList: vi.fn(),
      findWord: vi.fn(),
      findWordInList: vi.fn(),
      insertWord: vi.fn(),
      updateWord: vi.fn(),
      deleteWord: vi.fn(),
      wordPage: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      wordsByNormalized: vi.fn().mockResolvedValue([]),
    };
    books = { verifyBookAccess: vi.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [VocabularyService, { provide: VocabularyRepository, useValue: repo }, { provide: BookService, useValue: books }],
    }).compile();
    service = moduleRef.get(VocabularyService);
  });

  describe('addWord', () => {
    it('saves to the default list with normalized key, trimmed context and book location', async () => {
      repo.insertWord.mockImplementation((data) => Promise.resolve(word({ ...data, id: 11 })));

      const result = await service.addWord(user, {
        word: '  Ephemeral ',
        context: '  An ephemeral joy. ',
        definition: '   ',
        bookId: 5,
        bookFileId: 9,
        bookFormat: 'epub',
        cfi: 'epubcfi(/6/4)',
        language: 'en-GB',
      });

      expect(books.verifyBookAccess).toHaveBeenCalledWith(5, user);
      expect(repo.insertWord).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 7,
          listId: 1,
          word: 'Ephemeral',
          normalizedWord: 'ephemeral',
          context: 'An ephemeral joy.',
          definition: null,
          bookId: 5,
          bookFileId: 9,
          cfi: 'epubcfi(/6/4)',
          language: 'en',
        }),
      );
      expect(result).toMatchObject({ created: true, listName: DEFAULT_VOCABULARY_LIST_NAME, word: { id: 11 } });
    });

    it('drops location fields when no book is given', async () => {
      repo.insertWord.mockImplementation((data) => Promise.resolve(word(data)));
      await service.addWord(user, { word: 'x', bookFileId: 9, cfi: 'epubcfi(/6/4)', pageno: 3 });
      expect(books.verifyBookAccess).not.toHaveBeenCalled();
      expect(repo.insertWord).toHaveBeenCalledWith(expect.objectContaining({ bookId: null, bookFileId: null, cfi: null, pageno: null }));
    });

    it('returns the existing row when the word is already in the list', async () => {
      repo.insertWord.mockResolvedValue(null);
      repo.findWordInList.mockResolvedValue(word({ id: 3 }));
      const result = await service.addWord(user, { word: 'EPHEMERAL' });
      expect(repo.findWordInList).toHaveBeenCalledWith(1, 'ephemeral');
      expect(result).toMatchObject({ created: false, word: { id: 3 } });
    });

    it("refuses another user's list", async () => {
      repo.findList.mockResolvedValue(list({ id: 2, userId: 99, isDefault: false }));
      await expect(service.addWord(user, { word: 'x', listId: 2 })).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.insertWord).not.toHaveBeenCalled();
    });

    it('propagates a book access failure', async () => {
      books.verifyBookAccess.mockRejectedValue(new NotFoundException());
      await expect(service.addWord(user, { word: 'x', bookId: 5 })).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.insertWord).not.toHaveBeenCalled();
    });
  });

  it('drops punctuation picked up with the selection but keeps inner apostrophes', async () => {
    repo.insertWord.mockImplementation((data) => Promise.resolve(word(data)));
    await service.addWord(user, { word: '“Diffidence.”' });
    expect(repo.insertWord).toHaveBeenLastCalledWith(expect.objectContaining({ word: 'Diffidence', normalizedWord: 'diffidence' }));
    await service.addWord(user, { word: "İstanbul'da," });
    expect(repo.insertWord).toHaveBeenLastCalledWith(expect.objectContaining({ word: "İstanbul'da" }));
    await expect(service.addWord(user, { word: '...' })).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('lists', () => {
    it('creates the default list before listing', async () => {
      await service.getLists(user);
      expect(repo.ensureDefaultList).toHaveBeenCalledWith(7, DEFAULT_VOCABULARY_LIST_NAME);
    });

    it('refuses to delete the default list', async () => {
      repo.findList.mockResolvedValue(list());
      await expect(service.deleteList(user, 1)).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.deleteList).not.toHaveBeenCalled();
    });

    it('maps a duplicate name to a conflict', async () => {
      repo.createList.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
      await expect(service.createList(user, 'French')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('words', () => {
    it("refuses to change another user's word", async () => {
      repo.findWord.mockResolvedValue(word({ userId: 99 }));
      await expect(service.updateWord(user, 10, { learned: true })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.deleteWord(user, 10)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to move a word into a list that already has it', async () => {
      repo.findWord.mockResolvedValue(word());
      repo.findList.mockResolvedValue(list({ id: 2, isDefault: false, name: 'French' }));
      repo.findWordInList.mockResolvedValue(word({ id: 44, listId: 2 }));
      await expect(service.updateWord(user, 10, { listId: 2 })).rejects.toBeInstanceOf(ConflictException);
    });

    it('pages with a normalized search and only the requested filters', async () => {
      repo.findList.mockResolvedValue(list());
      await service.getWords(user, { listId: 1, q: '  EPH ', learned: 'learning', page: 3, pageSize: 20 });
      expect(repo.wordPage).toHaveBeenCalledWith(7, {
        listId: 1,
        normalizedQuery: 'eph',
        learned: 'learning',
        sort: 'newest',
        limit: 20,
        offset: 40,
      });
    });

    it('passes the requested sort order through', async () => {
      await service.getWords(user, { sort: 'az' });
      expect(repo.wordPage).toHaveBeenCalledWith(7, expect.objectContaining({ sort: 'az' }));
    });
  });

  describe('matchWords', () => {
    it('matches page words the way saving normalizes them', async () => {
      await service.matchWords(user, ['Tall,', 'tall', '  “Kedi” ', '...']);
      expect(repo.wordsByNormalized).toHaveBeenCalledWith(user.id, ['tall', 'kedi']);
    });

    it('skips the query when no word is left', async () => {
      await expect(service.matchWords(user, ['--', ''])).resolves.toEqual([]);
      expect(repo.wordsByNormalized).not.toHaveBeenCalled();
    });
  });
});
