import type { CreateVocabularyWordRequest } from '@bookorbit/types'

/** A word, with inner apostrophes and hyphens ("İstanbul'da", "well-known") kept. */
const WORD = /\p{L}[\p{L}\p{M}]*(?:['’-][\p{L}\p{M}]+)*/gu

export interface PageWord {
  /** Matches the server's saved-word key: NFC, lower case. */
  key: string
  /** How the word reads on the page; lower case unless it only ever appears capitalized. */
  text: string
  count: number
  /** Where it first appears, for page order and for finding its sentence. */
  firstIndex: number
}

export function pageWordKey(word: string): string {
  return word.normalize('NFC').toLowerCase()
}

/** The distinct words of a page's text, in the order they first appear. */
export function pageWords(text: string, max = 2000): PageWord[] {
  const byKey = new Map<string, PageWord>()
  for (const match of text.normalize('NFC').matchAll(WORD)) {
    const word = match[0]
    if (word.length < 2) continue
    const key = pageWordKey(word)
    const seen = byKey.get(key)
    if (seen) {
      seen.count += 1
      if (word === key) seen.text = key
      continue
    }
    if (byKey.size >= max) continue
    byKey.set(key, { key, text: word === key ? key : word, count: 1, firstIndex: match.index ?? 0 })
  }
  return [...byKey.values()]
}

/** Where words added from a reader page came from: the book, and the spot on the page. */
export type PageWordsSaveContext = Omit<CreateVocabularyWordRequest, 'word' | 'definition' | 'context' | 'listId'>
