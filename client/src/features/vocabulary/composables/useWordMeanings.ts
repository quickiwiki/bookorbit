import { ref } from 'vue'
import type { DictionaryEntry } from '@bookorbit/types'
import { normalizeLang, useDictionary } from '@/features/reader/epub/composables/useDictionary'
import { dictionaryApi } from './vocabularyApi'

export interface WordMeaning {
  key: string
  /** Language the explanation is written in, when known. */
  language: string | null
  sourceName: string
  headword: string
  entries: DictionaryEntry[]
}

/**
 * Every dictionary's answer for one word, so a reader can switch between, say, the English
 * explanation and the Russian translation. The built-in free dictionary only fills in when the
 * user's own and shared dictionaries know nothing.
 */
export function useWordMeanings() {
  const { lookup: builtInLookup } = useDictionary()
  const meanings = ref<WordMeaning[]>([])
  const loading = ref(false)
  let requestId = 0

  async function load(word: string, language: string | null | undefined) {
    const id = ++requestId
    const lang = language ? normalizeLang(language) : ''
    loading.value = true
    try {
      const found: WordMeaning[] = []
      try {
        for (const result of await dictionaryApi.lookup(word, lang)) {
          if (result.entries.length === 0) continue
          found.push({
            key: `source-${result.sourceId}`,
            language: result.targetLang,
            sourceName: result.sourceName,
            headword: result.word,
            entries: result.entries,
          })
        }
      } catch {
        // The built-in dictionary below still answers.
      }
      if (found.length === 0) {
        try {
          const builtIn = await builtInLookup(word, lang || 'en')
          if (builtIn && builtIn.entries.length > 0) {
            found.push({ key: 'built-in', language: lang || 'en', sourceName: builtIn.provider, headword: builtIn.word, entries: builtIn.entries })
          }
        } catch {
          // Nothing else to try.
        }
      }
      if (id === requestId) meanings.value = found
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  return { meanings, loading, load }
}
