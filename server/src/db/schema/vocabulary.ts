import { sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, check, index, integer, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { DictionarySourceKind, DictionarySourceStatus, OxfordEnvironment } from '@bookorbit/types';

import { users } from './auth';
import { bookFiles, books } from './books';

export const vocabularyLists = pgTable(
  'vocabulary_lists',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('vocabulary_lists_user_name_uidx').on(t.userId, sql`lower(${t.name})`),
    uniqueIndex('vocabulary_lists_user_default_uidx')
      .on(t.userId)
      .where(sql`${t.isDefault}`),
  ],
);

export type VocabularyListRow = typeof vocabularyLists.$inferSelect;
export type NewVocabularyList = typeof vocabularyLists.$inferInsert;

export const vocabularyWords = pgTable(
  'vocabulary_words',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listId: integer('list_id')
      .notNull()
      .references(() => vocabularyLists.id, { onDelete: 'cascade' }),
    word: varchar('word', { length: 200 }).notNull(),
    normalizedWord: varchar('normalized_word', { length: 200 }).notNull(),
    definition: text('definition'),
    context: text('context'),
    bookId: integer('book_id').references(() => books.id, { onDelete: 'set null' }),
    bookFileId: integer('book_file_id').references(() => bookFiles.id, { onDelete: 'set null' }),
    bookFormat: varchar('book_format', { length: 20 }),
    // Snapshot so the list stays readable after the book is removed.
    bookTitle: varchar('book_title', { length: 500 }),
    cfi: varchar('cfi', { length: 2000 }),
    pageno: integer('pageno'),
    language: varchar('language', { length: 16 }),
    learned: boolean('learned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('vocabulary_words_list_normalized_uidx').on(t.listId, t.normalizedWord),
    index('vocabulary_words_user_list_created_idx').on(t.userId, t.listId, t.createdAt.desc(), t.id.desc()),
    index('vocabulary_words_user_word_idx').on(t.userId, t.normalizedWord, t.id),
    index('vocabulary_words_normalized_trgm_idx').using('gin', t.normalizedWord.op('gin_trgm_ops')),
  ],
);

export type VocabularyWordRow = typeof vocabularyWords.$inferSelect;
export type NewVocabularyWord = typeof vocabularyWords.$inferInsert;

export const dictionarySources = pgTable(
  'dictionary_sources',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 20 }).$type<DictionarySourceKind>().notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    // Set by an administrator: every user's lookups use this dictionary, read-only for them.
    shared: boolean('shared').notNull().default(false),
    sourceLang: varchar('source_lang', { length: 16 }),
    targetLang: varchar('target_lang', { length: 16 }),
    status: varchar('status', { length: 20 }).$type<DictionarySourceStatus>().notNull().default('ready'),
    entryCount: integer('entry_count').notNull().default(0),
    error: varchar('error', { length: 500 }),
    oxfordEnvironment: varchar('oxford_environment', { length: 20 }).$type<OxfordEnvironment>(),
    // AES-GCM encrypted JSON `{ appId, appKey }`, keyed by BOOK_REQUEST_ENCRYPTION_KEY.
    encryptedCredentials: text('encrypted_credentials'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index('dictionary_sources_user_idx').on(t.userId),
    index('dictionary_sources_shared_idx')
      .on(t.id)
      .where(sql`${t.shared}`),
    check('dictionary_sources_kind_chk', sql`${t.kind} in ('oxford', 'dsl', 'tabfile')`),
    check('dictionary_sources_status_chk', sql`${t.status} in ('ready', 'importing', 'failed')`),
    check('dictionary_sources_oxford_env_chk', sql`${t.oxfordEnvironment} is null or ${t.oxfordEnvironment} in ('sandbox', 'production')`),
  ],
);

export type DictionarySourceRow = typeof dictionarySources.$inferSelect;
export type NewDictionarySource = typeof dictionarySources.$inferInsert;

export const dictionaryEntries = pgTable(
  'dictionary_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sourceId: integer('source_id')
      .notNull()
      .references(() => dictionarySources.id, { onDelete: 'cascade' }),
    headword: varchar('headword', { length: 500 }).notNull(),
    body: text('body').notNull(),
  },
  (t) => [index('dictionary_entries_source_idx').on(t.sourceId)],
);

export type DictionaryEntryRow = typeof dictionaryEntries.$inferSelect;
export type NewDictionaryEntry = typeof dictionaryEntries.$inferInsert;

/**
 * Every spelling that should find an entry: its headwords plus, for Wiktionary exports, each
 * inflected form. Kept apart from the entry so a card with thirty forms is stored once.
 */
export const dictionaryForms = pgTable(
  'dictionary_forms',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sourceId: integer('source_id')
      .notNull()
      .references(() => dictionarySources.id, { onDelete: 'cascade' }),
    entryId: bigint('entry_id', { mode: 'number' })
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: 'cascade' }),
    normalizedForm: varchar('normalized_form', { length: 500 }).notNull(),
  },
  (t) => [index('dictionary_forms_source_form_idx').on(t.sourceId, t.normalizedForm), index('dictionary_forms_entry_idx').on(t.entryId)],
);

export type NewDictionaryForm = typeof dictionaryForms.$inferInsert;
