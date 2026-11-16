import type { DictionaryResult } from "./dictionary";

export const VOCABULARY_WORD_MAX_LENGTH = 200;
export const VOCABULARY_CONTEXT_MAX_LENGTH = 1000;
export const VOCABULARY_DEFINITION_MAX_LENGTH = 4000;
export const VOCABULARY_LIST_NAME_MAX_LENGTH = 120;
export const VOCABULARY_PAGE_SIZE_MAX = 100;

export interface VocabularyList {
  id: number;
  name: string;
  isDefault: boolean;
  wordCount: number;
  createdAt: string;
}

export interface VocabularyWord {
  id: number;
  listId: number;
  word: string;
  definition: string | null;
  context: string | null;
  bookId: number | null;
  bookFileId: number | null;
  bookFormat: string | null;
  bookTitle: string | null;
  cfi: string | null;
  pageno: number | null;
  /** Language of the book the word came from, used to look its meaning up later. */
  language: string | null;
  learned: boolean;
  createdAt: string;
}

export interface VocabularyWordPage {
  items: VocabularyWord[];
  total: number;
  page: number;
  pageSize: number;
}

export type VocabularyLearnedFilter = "all" | "learning" | "learned";

/** Most distinct words a reader page can ask about at once. */
export const VOCABULARY_MATCH_MAX_WORDS = 2000;

export interface MatchVocabularyWordsRequest {
  words: string[];
}

export type VocabularyWordSort = "newest" | "oldest" | "az" | "za";
export const VOCABULARY_WORD_SORTS: readonly VocabularyWordSort[] = ["newest", "oldest", "az", "za"];

export interface CreateVocabularyWordRequest {
  /** Omit to add to the user's default list, which is created on first use. */
  listId?: number;
  word: string;
  definition?: string | null;
  context?: string | null;
  bookId?: number | null;
  bookFileId?: number | null;
  bookFormat?: string | null;
  bookTitle?: string | null;
  cfi?: string | null;
  pageno?: number | null;
  language?: string | null;
}

export interface CreateVocabularyWordResponse {
  word: VocabularyWord;
  /** False when the word was already in the list; the existing row is returned unchanged. */
  created: boolean;
  listName: string;
}

export type DictionarySourceKind = "oxford" | "dsl" | "tabfile";
export type DictionarySourceStatus = "ready" | "importing" | "failed";
export type OxfordEnvironment = "sandbox" | "production";

export interface DictionarySource {
  id: number;
  kind: DictionarySourceKind;
  name: string;
  enabled: boolean;
  sourceLang: string | null;
  targetLang: string | null;
  status: DictionarySourceStatus;
  entryCount: number;
  error: string | null;
  /** Oxford only: whether an app id/key pair is stored. Secrets are never returned. */
  hasCredentials: boolean;
  oxfordEnvironment: OxfordEnvironment | null;
  /** Used by every user's lookups. Only file dictionaries can be shared, by an administrator. */
  shared: boolean;
  /** False for a dictionary another user shared: it can be used but not changed. */
  owned: boolean;
  /** Who shared it, for dictionaries the viewer does not own. */
  ownerName: string | null;
  createdAt: string;
}

export interface CreateOxfordSourceRequest {
  name: string;
  appId: string;
  appKey: string;
  environment: OxfordEnvironment;
  sourceLang: string;
  targetLang?: string | null;
}

export interface ShareDictionarySourceRequest {
  shared: boolean;
}

export interface UpdateDictionarySourceRequest {
  name?: string;
  enabled?: boolean;
  sourceLang?: string | null;
  targetLang?: string | null;
}

export interface ExternalDictionaryResult extends Omit<DictionaryResult, "provider"> {
  provider: DictionarySourceKind;
  sourceId: number;
  sourceName: string;
  /** The language the meanings are written in; null when the dictionary explains in the word's own language or is unknown. */
  targetLang: string | null;
}
