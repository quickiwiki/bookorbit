import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  normalizeLanguage,
  type CreateVocabularyWordResponse,
  type VocabularyList,
  type VocabularyWord,
  type VocabularyWordPage,
} from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import { cleanWord, normalizeWord } from '../../common/utils/normalize-word';
import type { VocabularyListRow, VocabularyWordRow } from '../../db/schema';
import { BookService } from '../book/book.service';
import { CreateVocabularyWordDto, UpdateVocabularyWordDto, VocabularyWordQueryDto } from './dto/vocabulary.dto';
import { VocabularyRepository } from './vocabulary.repository';

export const DEFAULT_VOCABULARY_LIST_NAME = 'My words';
const DEFAULT_PAGE_SIZE = 50;

/** `en-US`, `EN` and `eng` all mean `en`; anything that is not a language code is dropped. */
function primaryLanguage(lang: string | null | undefined): string | null {
  const primary = lang?.trim().toLowerCase().split(/[-_]/)[0];
  return primary && /^[a-z]{2,3}$/.test(primary) ? normalizeLanguage(primary) : null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toWord(row: VocabularyWordRow): VocabularyWord {
  return {
    id: row.id,
    listId: row.listId,
    word: row.word,
    definition: row.definition,
    context: row.context,
    bookId: row.bookId,
    bookFileId: row.bookFileId,
    bookFormat: row.bookFormat,
    bookTitle: row.bookTitle,
    cfi: row.cfi,
    pageno: row.pageno,
    language: row.language,
    learned: row.learned,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause ?? error;
  return (cause as { code?: string })?.code === '23505';
}

@Injectable()
export class VocabularyService {
  constructor(
    private readonly repository: VocabularyRepository,
    private readonly bookService: BookService,
  ) {}

  async getLists(user: RequestUser): Promise<VocabularyList[]> {
    await this.repository.ensureDefaultList(user.id, DEFAULT_VOCABULARY_LIST_NAME);
    const rows = await this.repository.listsWithCounts(user.id);
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async createList(user: RequestUser, name: string): Promise<VocabularyList> {
    try {
      const row = await this.repository.createList(user.id, name);
      return { id: row.id, name: row.name, isDefault: row.isDefault, wordCount: 0, createdAt: row.createdAt.toISOString() };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A vocabulary list with this name already exists');
      throw error;
    }
  }

  async renameList(user: RequestUser, listId: number, name: string): Promise<void> {
    await this.ownedList(user, listId);
    try {
      await this.repository.renameList(listId, name);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A vocabulary list with this name already exists');
      throw error;
    }
  }

  async deleteList(user: RequestUser, listId: number): Promise<void> {
    const list = await this.ownedList(user, listId);
    if (list.isDefault) throw new BadRequestException('The default vocabulary list cannot be deleted');
    await this.repository.deleteList(listId);
  }

  async getWords(user: RequestUser, query: VocabularyWordQueryDto): Promise<VocabularyWordPage> {
    if (query.listId != null) await this.ownedList(user, query.listId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { items, total } = await this.repository.wordPage(user.id, {
      listId: query.listId,
      normalizedQuery: query.q ? normalizeWord(query.q) : undefined,
      learned: query.learned ?? 'all',
      sort: query.sort ?? 'newest',
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { items: items.map(toWord), total, page, pageSize };
  }

  /** The user's saved words among those on a reader page, matched the way saving dedupes them. */
  async matchWords(user: RequestUser, words: string[]): Promise<VocabularyWord[]> {
    const keys = [...new Set(words.map((w) => normalizeWord(cleanWord(w))).filter(Boolean))];
    if (keys.length === 0) return [];
    return (await this.repository.wordsByNormalized(user.id, keys)).map(toWord);
  }

  async addWord(user: RequestUser, dto: CreateVocabularyWordDto): Promise<CreateVocabularyWordResponse> {
    const list =
      dto.listId != null ? await this.ownedList(user, dto.listId) : await this.repository.ensureDefaultList(user.id, DEFAULT_VOCABULARY_LIST_NAME);
    const bookId = dto.bookId ?? null;
    if (bookId != null) await this.bookService.verifyBookAccess(bookId, user);

    const cleaned = cleanWord(dto.word);
    if (!cleaned) throw new BadRequestException('Select a word to add');
    const normalizedWord = normalizeWord(cleaned);
    const inserted = await this.repository.insertWord({
      userId: user.id,
      listId: list.id,
      word: cleaned,
      normalizedWord,
      definition: blankToNull(dto.definition),
      context: blankToNull(dto.context),
      bookId,
      bookFileId: bookId != null ? (dto.bookFileId ?? null) : null,
      bookFormat: bookId != null ? blankToNull(dto.bookFormat) : null,
      bookTitle: blankToNull(dto.bookTitle),
      cfi: bookId != null ? blankToNull(dto.cfi) : null,
      pageno: bookId != null ? (dto.pageno ?? null) : null,
      language: primaryLanguage(dto.language),
    });
    if (inserted) return { word: toWord(inserted), created: true, listName: list.name };

    const existing = await this.repository.findWordInList(list.id, normalizedWord);
    if (!existing) throw new ConflictException('Word could not be saved, try again');
    return { word: toWord(existing), created: false, listName: list.name };
  }

  async updateWord(user: RequestUser, wordId: number, dto: UpdateVocabularyWordDto): Promise<VocabularyWord> {
    const word = await this.ownedWord(user, wordId);
    if (dto.listId != null && dto.listId !== word.listId) {
      await this.ownedList(user, dto.listId);
      if (await this.repository.findWordInList(dto.listId, word.normalizedWord)) {
        throw new ConflictException('That list already contains this word');
      }
    }
    const row = await this.repository.updateWord(wordId, {
      ...(dto.listId != null ? { listId: dto.listId } : {}),
      ...(dto.definition !== undefined ? { definition: blankToNull(dto.definition) } : {}),
      ...(dto.context !== undefined ? { context: blankToNull(dto.context) } : {}),
      ...(dto.learned !== undefined ? { learned: dto.learned } : {}),
    });
    return toWord(row);
  }

  async deleteWord(user: RequestUser, wordId: number): Promise<void> {
    await this.ownedWord(user, wordId);
    await this.repository.deleteWord(wordId);
  }

  private async ownedList(user: RequestUser, listId: number): Promise<VocabularyListRow> {
    const list = await this.repository.findList(listId);
    if (!list) throw new NotFoundException('Vocabulary list not found');
    if (list.userId !== user.id) throw new ForbiddenException('No access to this vocabulary list');
    return list;
  }

  private async ownedWord(user: RequestUser, wordId: number): Promise<VocabularyWordRow> {
    const word = await this.repository.findWord(wordId);
    if (!word) throw new NotFoundException('Vocabulary word not found');
    if (word.userId !== user.id) throw new ForbiddenException('No access to this vocabulary word');
    return word;
  }
}
