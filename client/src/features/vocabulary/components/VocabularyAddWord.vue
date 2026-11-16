<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loader2, Plus } from '@lucide/vue'
import { VOCABULARY_WORD_MAX_LENGTH } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatLanguageName } from '@/i18n/formatters'
import { storage } from '@/services/storage'
import { useSaveVocabularyWord } from '../composables/useSaveVocabularyWord'
import { dictionaryApi } from '../composables/vocabularyApi'
import { guessLanguage } from '../lib/guess-language'

const AUTO = 'auto'
const LANGUAGE_KEY = 'vocabularyAddLanguage'

const props = defineProps<{ listId: number | null; listName: string | null }>()
const emit = defineEmits<{ added: [] }>()

const { t } = useI18n()
const { save, saving } = useSaveVocabularyWord()

const word = ref('')
const language = ref<string>(storage.get<string>(LANGUAGE_KEY, AUTO))
const available = ref<string[]>(['en'])

watch(language, (value) => storage.set(LANGUAGE_KEY, value))

onMounted(async () => {
  try {
    const sources = await dictionaryApi.sources()
    const langs = sources.filter((s) => s.enabled && s.status === 'ready' && s.sourceLang).map((s) => s.sourceLang as string)
    available.value = [...new Set(['en', ...langs])].sort()
  } catch {
    // English alone still works through the built-in dictionaries.
  }
  if (language.value !== AUTO && !available.value.includes(language.value)) language.value = AUTO
})

const options = computed(() => available.value.map((code) => ({ code, name: formatLanguageName(code) })))
const guessed = computed(() => (word.value.trim() ? guessLanguage(word.value, available.value) : null))
const autoLabel = computed(() =>
  guessed.value ? t('vocabulary.add.autoDetected', { language: formatLanguageName(guessed.value) }) : t('vocabulary.add.auto'),
)
const target = computed(() => t('vocabulary.add.hint', { list: props.listName ?? t('vocabulary.add.defaultList') }))

function handleLanguageChange(value: string | number) {
  language.value = String(value)
}

async function handleSubmit() {
  const text = word.value.trim()
  if (!text || saving.value) return
  const lang = language.value === AUTO ? guessed.value : language.value
  const saved = await save({ word: text, language: lang, ...(props.listId !== null ? { listId: props.listId } : {}) }, { viewAction: false })
  if (!saved) return
  word.value = ''
  emit('added')
}
</script>

<template>
  <form class="mb-6 rounded-lg border border-border bg-card p-3" data-testid="vocabulary-add-word" @submit.prevent="handleSubmit">
    <div class="flex flex-col gap-2 sm:flex-row">
      <Input
        v-model="word"
        class="h-9 flex-1"
        :placeholder="t('vocabulary.add.placeholder')"
        :aria-label="t('vocabulary.add.placeholder')"
        :maxlength="VOCABULARY_WORD_MAX_LENGTH"
        :disabled="saving"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
      <div class="flex gap-2">
        <Select
          class="h-9 flex-1 sm:w-44"
          :modelValue="language"
          :aria-label="t('vocabulary.add.language')"
          @update:modelValue="handleLanguageChange"
        >
          <option :value="AUTO">{{ autoLabel }}</option>
          <option v-for="option in options" :key="option.code" :value="option.code">{{ option.name }}</option>
        </Select>
        <Button type="submit" size="sm" class="h-9" :disabled="!word.trim() || saving">
          <Loader2 v-if="saving" :size="14" class="animate-spin" />
          <Plus v-else :size="14" />
          {{ t('vocabulary.add.submit') }}
        </Button>
      </div>
    </div>
    <p class="mt-1.5 text-xs text-muted-foreground">{{ target }}</p>
  </form>
</template>
