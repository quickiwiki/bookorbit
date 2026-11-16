import type { BookDetail } from '@bookorbit/types'
import { api } from '@/lib/api'

export interface VocabularyBookInfo {
  title: string | null
  language: string | null
}

const cache = new Map<number, Promise<VocabularyBookInfo>>()

/**
 * Title and language for words saved from readers that do not load book details themselves
 * (PDF). Fetched once per book; a failure just leaves both unknown.
 */
export function vocabularyBookInfo(bookId: number): Promise<VocabularyBookInfo> {
  let pending = cache.get(bookId)
  if (!pending) {
    pending = api(`/api/v1/books/${bookId}`)
      .then((r) => (r.ok ? (r.json() as Promise<BookDetail>) : null))
      .then((b) => ({ title: b?.title ?? null, language: b?.language ?? null }))
      .catch(() => ({ title: null, language: null }))
    cache.set(bookId, pending)
  }
  return pending
}
