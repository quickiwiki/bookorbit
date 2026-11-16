<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDebounceFn } from '@vueuse/core'
import { Check, ChevronDown, Plus, Search } from '@lucide/vue'
import type { VocabularyWord } from '@bookorbit/types'
import { Input } from '@/components/ui/input'
import { storage } from '@/services/storage'
import { useSaveVocabularyWord } from '../composables/useSaveVocabularyWord'
import { vocabularyApi } from '../composables/vocabularyApi'
import { sentenceAround } from '../lib/context-sentence'
import { pageWordKey, pageWords, type PageWord, type PageWordsSaveContext } from '../lib/page-words'
import WordMeanings from './WordMeanings.vue'

type Order = 'page' | 'az'
const ORDER_KEY = 'readerPageWordsOrder'
const MATCH_DEBOUNCE_MS = 400

const props = defineProps<{ text: string; language: string | null; saveContext: PageWordsSaveContext }>()

const { t } = useI18n()
const { save, saving } = useSaveVocabularyWord()

const query = ref('')
const order = ref<Order>(storage.get<Order>(ORDER_KEY, 'page') === 'az' ? 'az' : 'page')
const openKey = ref<string | null>(null)
const saved = ref(new Map<string, VocabularyWord>())

watch(order, (value) => storage.set(ORDER_KEY, value))

const words = computed(() => pageWords(props.text))
const locale = computed(() => props.language ?? undefined)

const visible = computed(() => {
  const q = query.value.trim().toLocaleLowerCase(locale.value)
  const list = q ? words.value.filter((w) => w.key.includes(q)) : [...words.value]
  if (order.value === 'az') list.sort((a, b) => a.key.localeCompare(b.key, locale.value))
  return list
})
const savedWords = computed(() => visible.value.filter((w) => saved.value.has(w.key)))
const otherWords = computed(() => visible.value.filter((w) => !saved.value.has(w.key)))

async function refreshSaved() {
  const keys = words.value.map((w) => w.key)
  if (keys.length === 0) {
    saved.value = new Map()
    return
  }
  try {
    const found = await vocabularyApi.matchWords(keys)
    saved.value = new Map(found.map((w) => [pageWordKey(w.word), w]))
  } catch {
    // The list still works without the saved marks.
  }
}

const refreshSavedSoon = useDebounceFn(refreshSaved, MATCH_DEBOUNCE_MS)
watch(words, () => void refreshSavedSoon(), { immediate: true })
watch(
  () => props.text,
  () => {
    openKey.value = null
  },
)

function savedMeaning(word: PageWord) {
  return saved.value.get(word.key)?.definition?.split('\n')[0] ?? null
}

function handleToggle(word: PageWord) {
  openKey.value = openKey.value === word.key ? null : word.key
}

function handleOrderChange() {
  order.value = order.value === 'page' ? 'az' : 'page'
}

async function addWord(word: PageWord, definition: string | null) {
  const result = await save({
    ...props.saveContext,
    word: word.text,
    definition,
    context: sentenceAround(props.text, word.text, word.firstIndex),
  })
  if (result) saved.value = new Map(saved.value).set(word.key, result)
}

function handleQuickAdd(word: PageWord) {
  void addWord(word, null)
}

async function handleUse(word: PageWord, definition: string) {
  const existing = saved.value.get(word.key)
  if (!existing) return addWord(word, definition)
  try {
    const updated = await vocabularyApi.updateWord(existing.id, { definition })
    saved.value = new Map(saved.value).set(word.key, updated)
  } catch {
    // updateWord surfaces its own error message through the API helper's fallback key.
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col" data-testid="page-words-panel">
    <div class="flex items-center gap-2 px-3 pb-2">
      <div class="relative flex-1">
        <Search :size="13" class="absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          v-model="query"
          class="h-8 ps-7 text-sm"
          :placeholder="t('vocabulary.pageWords.filter')"
          :aria-label="t('vocabulary.pageWords.filter')"
        />
      </div>
      <button
        type="button"
        class="h-8 shrink-0 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
        :title="t('vocabulary.pageWords.orderHint')"
        @click="handleOrderChange"
      >
        {{ order === 'az' ? t('vocabulary.pageWords.orderAz') : t('vocabulary.pageWords.orderPage') }}
      </button>
    </div>

    <p v-if="words.length === 0" class="px-4 py-6 text-center text-sm text-muted-foreground">{{ t('vocabulary.pageWords.empty') }}</p>

    <div v-else class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      <template v-for="group in [savedWords, otherWords]" :key="group === savedWords ? 'saved' : 'other'">
        <p v-if="group.length > 0" class="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {{
            group === savedWords ? t('vocabulary.pageWords.saved', { count: group.length }) : t('vocabulary.pageWords.other', { count: group.length })
          }}
        </p>
        <ul>
          <li v-for="word in group" :key="word.key" class="rounded-md" :class="openKey === word.key ? 'bg-muted/50' : ''">
            <div class="group flex items-center gap-1">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-start hover:bg-muted"
                :aria-expanded="openKey === word.key"
                @click="handleToggle(word)"
              >
                <Check
                  v-if="saved.has(word.key)"
                  :size="13"
                  class="mt-1 shrink-0 text-primary"
                  :aria-label="t('vocabulary.pageWords.inVocabulary')"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-foreground">
                    {{ word.text }}
                    <span v-if="word.count > 1" class="ms-1 text-[11px] font-normal text-muted-foreground">×{{ word.count }}</span>
                  </span>
                  <span v-if="savedMeaning(word)" class="block truncate text-xs text-muted-foreground">{{ savedMeaning(word) }}</span>
                </span>
                <ChevronDown
                  :size="13"
                  class="mt-1 shrink-0 text-muted-foreground transition-transform"
                  :class="openKey === word.key ? 'rotate-180' : ''"
                />
              </button>
              <button
                v-if="!saved.has(word.key)"
                type="button"
                class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                :disabled="saving"
                :aria-label="t('vocabulary.pageWords.add', { word: word.text })"
                :title="t('vocabulary.pageWords.add', { word: word.text })"
                @click="handleQuickAdd(word)"
              >
                <Plus :size="14" />
              </button>
            </div>
            <div v-if="openKey === word.key" class="px-2 pb-2">
              <WordMeanings
                :word="word.text"
                :language="language"
                :current="saved.get(word.key)?.definition ?? null"
                :useLabel="saved.has(word.key) ? null : t('vocabulary.pageWords.addWithMeaning')"
                @use="handleUse(word, $event)"
              />
            </div>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
