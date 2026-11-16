import { computed, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { toast } from 'vue-sonner'
import type { VocabularyLearnedFilter, VocabularyList, VocabularyWord, VocabularyWordSort } from '@bookorbit/types'
import { VOCABULARY_WORD_SORTS } from '@bookorbit/types'
import { storage } from '@/services/storage'
import { errorMessage } from '@/lib/api-json'
import { cleanSelectedWord, useDefinitionLookup } from '../lib/definition'
import { vocabularyApi } from './vocabularyApi'

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 250
const LOOKUP_CONCURRENCY = 3
const SORT_KEY = 'vocabularySort'

function storedSort(): VocabularyWordSort {
  const value = storage.get<unknown>(SORT_KEY, 'newest')
  return (VOCABULARY_WORD_SORTS as readonly unknown[]).includes(value) ? (value as VocabularyWordSort) : 'newest'
}

export function useVocabulary() {
  const lists = ref<VocabularyList[]>([])
  const activeListId = ref<number | null>(null)
  const search = ref('')
  const learned = ref<VocabularyLearnedFilter>('all')
  const sort = ref<VocabularyWordSort>(storedSort())
  const page = ref(1)

  const words = ref<VocabularyWord[]>([])
  const total = ref(0)
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  let requestId = 0

  const { resolve } = useDefinitionLookup()
  /** Words being looked up now, and words no dictionary knew, so neither is retried on every page load. */
  const lookingUp = ref(new Set<number>())
  const noMeaningFound = ref(new Set<number>())
  const attempted = new Set<number>()

  const totalAll = computed(() => lists.value.reduce((sum, list) => sum + list.wordCount, 0))
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
  const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * PAGE_SIZE + 1))
  const rangeEnd = computed(() => Math.min(total.value, page.value * PAGE_SIZE))

  async function loadLists() {
    try {
      lists.value = await vocabularyApi.lists()
    } catch (error) {
      loadError.value = errorMessage(error, 'vocabulary.errors.load')
    }
  }

  async function loadWords() {
    const id = ++requestId
    loading.value = true
    loadError.value = null
    try {
      const result = await vocabularyApi.words({
        listId: activeListId.value,
        q: search.value,
        learned: learned.value,
        sort: sort.value,
        page: page.value,
        pageSize: PAGE_SIZE,
      })
      if (id !== requestId) return
      words.value = result.items
      total.value = result.total
      void fillMissingMeanings(result.items)
    } catch (error) {
      if (id === requestId) loadError.value = errorMessage(error, 'vocabulary.errors.load')
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  async function fillOne(word: VocabularyWord) {
    lookingUp.value = new Set(lookingUp.value).add(word.id)
    try {
      const definition = await resolve(cleanSelectedWord(word.word), word.language)
      if (!definition) {
        noMeaningFound.value = new Set(noMeaningFound.value).add(word.id)
        return
      }
      replaceWord(await vocabularyApi.updateWord(word.id, { definition }))
    } catch {
      noMeaningFound.value = new Set(noMeaningFound.value).add(word.id)
    } finally {
      const next = new Set(lookingUp.value)
      next.delete(word.id)
      lookingUp.value = next
    }
  }

  /** Words saved without a meaning get one from the user's dictionaries, then the built-in ones. */
  async function fillMissingMeanings(items: VocabularyWord[]) {
    const queue = items.filter((w) => !w.definition && !attempted.has(w.id))
    queue.forEach((w) => attempted.add(w.id))
    const workers = Array.from({ length: Math.min(LOOKUP_CONCURRENCY, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await fillOne(next)
    })
    await Promise.all(workers)
  }

  const debouncedReload = useDebounceFn(() => {
    page.value = 1
    void loadWords()
  }, SEARCH_DEBOUNCE_MS)

  watch(search, () => void debouncedReload())
  watch(sort, (value) => storage.set(SORT_KEY, value))
  watch([activeListId, learned, sort], () => {
    page.value = 1
    void loadWords()
  })
  watch(page, () => void loadWords())

  function adjustCount(listId: number, delta: number) {
    const list = lists.value.find((l) => l.id === listId)
    if (list) list.wordCount = Math.max(0, list.wordCount + delta)
  }

  async function run<T>(action: () => Promise<T>, fallbackKey: string): Promise<T | null> {
    try {
      return await action()
    } catch (error) {
      toast.error(errorMessage(error, fallbackKey))
      return null
    }
  }

  async function createList(name: string) {
    const list = await run(() => vocabularyApi.createList(name), 'vocabulary.errors.saveList')
    if (!list) return false
    await loadLists()
    activeListId.value = list.id
    return true
  }

  async function renameList(id: number, name: string) {
    const ok = await run(() => vocabularyApi.renameList(id, name).then(() => true), 'vocabulary.errors.saveList')
    if (ok) await loadLists()
    return ok === true
  }

  async function deleteList(id: number) {
    const ok = await run(() => vocabularyApi.deleteList(id).then(() => true), 'vocabulary.errors.deleteList')
    if (!ok) return
    if (activeListId.value === id) activeListId.value = null
    await loadLists()
    await loadWords()
  }

  function replaceWord(updated: VocabularyWord) {
    const index = words.value.findIndex((w) => w.id === updated.id)
    if (index !== -1) words.value[index] = updated
  }

  async function toggleLearned(word: VocabularyWord) {
    const updated = await run(() => vocabularyApi.updateWord(word.id, { learned: !word.learned }), 'vocabulary.errors.saveWord')
    if (!updated) return
    if (learned.value !== 'all') await loadWords()
    else replaceWord(updated)
  }

  async function updateDefinition(word: VocabularyWord, definition: string) {
    const updated = await run(() => vocabularyApi.updateWord(word.id, { definition }), 'vocabulary.errors.saveWord')
    if (updated) {
      replaceWord(updated)
      const next = new Set(noMeaningFound.value)
      next.delete(word.id)
      noMeaningFound.value = next
    }
    return updated !== null
  }

  async function moveWord(word: VocabularyWord, listId: number) {
    if (listId === word.listId) return
    const updated = await run(() => vocabularyApi.updateWord(word.id, { listId }), 'vocabulary.errors.saveWord')
    if (!updated) return
    adjustCount(word.listId, -1)
    adjustCount(listId, 1)
    if (activeListId.value !== null) await loadWords()
    else replaceWord(updated)
  }

  async function deleteWord(word: VocabularyWord) {
    const ok = await run(() => vocabularyApi.deleteWord(word.id).then(() => true), 'vocabulary.errors.deleteWord')
    if (!ok) return
    adjustCount(word.listId, -1)
    await loadWords()
  }

  async function init() {
    await loadLists()
    await loadWords()
  }

  return {
    lists,
    activeListId,
    search,
    learned,
    sort,
    page,
    pageCount,
    rangeStart,
    rangeEnd,
    words,
    total,
    totalAll,
    loading,
    loadError,
    lookingUp,
    noMeaningFound,
    init,
    loadLists,
    loadWords,
    createList,
    renameList,
    deleteList,
    toggleLearned,
    updateDefinition,
    moveWord,
    deleteWord,
  }
}
