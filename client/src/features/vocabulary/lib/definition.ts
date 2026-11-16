import type { DictionaryEntry } from '@bookorbit/types'
import { VOCABULARY_DEFINITION_MAX_LENGTH } from '@bookorbit/types'
import { normalizeLang, useDictionary } from '@/features/reader/epub/composables/useDictionary'
import { dictionaryApi } from '../composables/vocabularyApi'

/** Mirrors the server: "tall," is saved and looked up as "tall". */
export function cleanSelectedWord(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '')
}

const MAX_BLOCKS = 3
const MAX_SENSES_PER_BLOCK = 3

/**
 * A short, readable meaning for a vocabulary card: up to three part-of-speech blocks, each
 * with its first few senses, e.g. `(noun) light; lamp`. When the senses came from a base form
 * ("кошкой" -> "кошка"), that form leads so the card shows what was actually defined.
 */
export function formatDefinition(word: string, entries: DictionaryEntry[]): string | null {
  const lines: string[] = []
  for (const entry of entries.slice(0, MAX_BLOCKS)) {
    const senses = entry.definitions
      .slice(0, MAX_SENSES_PER_BLOCK)
      .map((d) => d.definition.trim())
      .filter(Boolean)
    if (senses.length === 0) continue
    const lemma = entry.sourceWord && entry.sourceWord.toLowerCase() !== word.trim().toLowerCase() ? `${entry.sourceWord} ` : ''
    const pos = entry.partOfSpeech ? `(${entry.partOfSpeech}) ` : ''
    lines.push(`${lemma}${pos}${senses.join('; ')}`)
  }
  const text = lines.join('\n').trim()
  if (!text) return null
  return text.length > VOCABULARY_DEFINITION_MAX_LENGTH ? `${text.slice(0, VOCABULARY_DEFINITION_MAX_LENGTH - 1)}…` : text
}

/**
 * Looks a word's meaning up the way the reader's Define popup does: the user's own
 * dictionaries first, then the built-in free ones. Null when nothing knows the word.
 */
export function useDefinitionLookup() {
  const { lookup: builtInLookup } = useDictionary()

  async function resolve(word: string, language: string | null | undefined): Promise<string | null> {
    const lang = language ? normalizeLang(language) : ''
    try {
      const external = await dictionaryApi.lookup(word, lang)
      for (const result of external) {
        const text = formatDefinition(word, result.entries)
        if (text) return text
      }
    } catch {
      // A failing user dictionary must not stop the built-in fallback.
    }
    try {
      const builtIn = await builtInLookup(word, lang || 'en')
      return builtIn ? formatDefinition(word, builtIn.entries) : null
    } catch {
      return null
    }
  }

  return { resolve }
}
