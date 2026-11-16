import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { VocabularyLearnedFilter, VocabularyWordSort } from '@bookorbit/types';

import { DB } from '../../db';
import * as schema from '../../db/schema';
import { vocabularyLists, vocabularyWords, type NewVocabularyWord, type VocabularyListRow, type VocabularyWordRow } from '../../db/schema';

type Db = NodePgDatabase<typeof schema>;

export interface WordPageFilter {
  listId?: number;
  normalizedQuery?: string;
  learned: VocabularyLearnedFilter;
  sort: VocabularyWordSort;
  limit: number;
  offset: number;
}

function wordOrder(sort: VocabularyWordSort): SQL[] {
  switch (sort) {
    case 'oldest':
      return [asc(vocabularyWords.createdAt), asc(vocabularyWords.id)];
    case 'az':
      return [asc(vocabularyWords.normalizedWord), asc(vocabularyWords.id)];
    case 'za':
      return [desc(vocabularyWords.normalizedWord), desc(vocabularyWords.id)];
    default:
      return [desc(vocabularyWords.createdAt), desc(vocabularyWords.id)];
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

@Injectable()
export class VocabularyRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listsWithCounts(userId: number) {
    return this.db
      .select({
        id: vocabularyLists.id,
        name: vocabularyLists.name,
        isDefault: vocabularyLists.isDefault,
        createdAt: vocabularyLists.createdAt,
        wordCount: sql<number>`count(${vocabularyWords.id})::int`,
      })
      .from(vocabularyLists)
      .leftJoin(vocabularyWords, eq(vocabularyWords.listId, vocabularyLists.id))
      .where(eq(vocabularyLists.userId, userId))
      .groupBy(vocabularyLists.id)
      .orderBy(desc(vocabularyLists.isDefault), asc(sql`lower(${vocabularyLists.name})`));
  }

  async findList(listId: number): Promise<VocabularyListRow | null> {
    const [row] = await this.db.select().from(vocabularyLists).where(eq(vocabularyLists.id, listId)).limit(1);
    return row ?? null;
  }

  async findListByName(userId: number, name: string): Promise<VocabularyListRow | null> {
    const [row] = await this.db
      .select()
      .from(vocabularyLists)
      .where(and(eq(vocabularyLists.userId, userId), sql`lower(${vocabularyLists.name}) = lower(${name})`))
      .limit(1);
    return row ?? null;
  }

  /** Concurrent first saves race to create the default list; the partial unique index picks one winner. */
  async ensureDefaultList(userId: number, name: string): Promise<VocabularyListRow> {
    const [existing] = await this.db
      .select()
      .from(vocabularyLists)
      .where(and(eq(vocabularyLists.userId, userId), eq(vocabularyLists.isDefault, true)))
      .limit(1);
    if (existing) return existing;

    await this.db.insert(vocabularyLists).values({ userId, name, isDefault: true }).onConflictDoNothing();
    const [row] = await this.db
      .select()
      .from(vocabularyLists)
      .where(and(eq(vocabularyLists.userId, userId), eq(vocabularyLists.isDefault, true)))
      .limit(1);
    return row!;
  }

  async createList(userId: number, name: string): Promise<VocabularyListRow> {
    const [row] = await this.db.insert(vocabularyLists).values({ userId, name }).returning();
    return row!;
  }

  async renameList(listId: number, name: string): Promise<VocabularyListRow> {
    const [row] = await this.db.update(vocabularyLists).set({ name }).where(eq(vocabularyLists.id, listId)).returning();
    return row!;
  }

  async deleteList(listId: number): Promise<void> {
    await this.db.delete(vocabularyLists).where(eq(vocabularyLists.id, listId));
  }

  async findWord(wordId: number): Promise<VocabularyWordRow | null> {
    const [row] = await this.db.select().from(vocabularyWords).where(eq(vocabularyWords.id, wordId)).limit(1);
    return row ?? null;
  }

  async findWordInList(listId: number, normalizedWord: string): Promise<VocabularyWordRow | null> {
    const [row] = await this.db
      .select()
      .from(vocabularyWords)
      .where(and(eq(vocabularyWords.listId, listId), eq(vocabularyWords.normalizedWord, normalizedWord)))
      .limit(1);
    return row ?? null;
  }

  /** Returns null when the word is already in the list. */
  async insertWord(data: NewVocabularyWord): Promise<VocabularyWordRow | null> {
    const [row] = await this.db.insert(vocabularyWords).values(data).onConflictDoNothing().returning();
    return row ?? null;
  }

  async updateWord(wordId: number, data: Partial<Pick<NewVocabularyWord, 'listId' | 'definition' | 'context' | 'learned'>>) {
    const [row] = await this.db.update(vocabularyWords).set(data).where(eq(vocabularyWords.id, wordId)).returning();
    return row!;
  }

  async deleteWord(wordId: number): Promise<void> {
    await this.db.delete(vocabularyWords).where(eq(vocabularyWords.id, wordId));
  }

  async wordsByNormalized(userId: number, normalizedWords: string[]): Promise<VocabularyWordRow[]> {
    return this.db
      .select()
      .from(vocabularyWords)
      .where(and(eq(vocabularyWords.userId, userId), inArray(vocabularyWords.normalizedWord, normalizedWords)))
      .orderBy(asc(vocabularyWords.normalizedWord), desc(vocabularyWords.createdAt));
  }

  async wordPage(userId: number, filter: WordPageFilter) {
    const conditions: SQL[] = [eq(vocabularyWords.userId, userId)];
    if (filter.listId != null) conditions.push(eq(vocabularyWords.listId, filter.listId));
    if (filter.normalizedQuery) conditions.push(ilike(vocabularyWords.normalizedWord, `%${escapeLike(filter.normalizedQuery)}%`));
    if (filter.learned === 'learned') conditions.push(eq(vocabularyWords.learned, true));
    if (filter.learned === 'learning') conditions.push(eq(vocabularyWords.learned, false));
    const where = and(...conditions);

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(vocabularyWords)
        .where(where)
        .orderBy(...wordOrder(filter.sort))
        .limit(filter.limit)
        .offset(filter.offset),
      this.db.select({ total: count() }).from(vocabularyWords).where(where),
    ]);

    return { items, total: totalRow?.total ?? 0 };
  }
}
