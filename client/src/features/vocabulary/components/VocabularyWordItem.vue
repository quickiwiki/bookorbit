<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RouteLocationRaw } from 'vue-router'
import { BookOpen, Check, ChevronDown, Languages, Loader2, Pencil, Trash2 } from '@lucide/vue'
import type { VocabularyList, VocabularyWord } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cleanSelectedWord } from '../lib/definition'
import WordMeanings from './WordMeanings.vue'

const props = defineProps<{
  word: VocabularyWord
  lists: VocabularyList[]
  showList: boolean
  lookingUp?: boolean
  noMeaning?: boolean
}>()

const emit = defineEmits<{
  toggleLearned: [word: VocabularyWord]
  saveDefinition: [word: VocabularyWord, definition: string]
  move: [word: VocabularyWord, listId: number]
  remove: [word: VocabularyWord]
}>()

const { t } = useI18n()
const editing = ref(false)
const draft = ref('')
const showMeanings = ref(false)
const lookupWord = computed(() => cleanSelectedWord(props.word.word))

const listName = computed(() => props.lists.find((l) => l.id === props.word.listId)?.name ?? '')

const readerRoute = computed<RouteLocationRaw | null>(() => {
  const w = props.word
  if (!w.bookId || !w.bookFileId) return null
  const query: Record<string, string> = { format: w.bookFormat ?? 'epub' }
  if (w.cfi) query.cfi = w.cfi
  else if (w.pageno != null) query.page = String(w.pageno)
  return { name: 'reader', params: { bookId: w.bookId, fileId: w.bookFileId }, query }
})

const sourceLabel = computed(() => {
  const w = props.word
  const title = w.bookTitle ?? (w.bookId ? t('vocabulary.word.untitledBook') : null)
  if (!title) return null
  return w.pageno != null ? t('vocabulary.word.bookPage', { title, page: w.pageno }) : title
})

function handleToggleLearned() {
  emit('toggleLearned', props.word)
}

function handleEdit() {
  draft.value = props.word.definition ?? ''
  editing.value = true
}

function handleCancelEdit() {
  editing.value = false
}

function handleSave() {
  emit('saveDefinition', props.word, draft.value)
  editing.value = false
}

function handleToggleMeanings() {
  showMeanings.value = !showMeanings.value
}

function handleUseMeaning(definition: string) {
  emit('saveDefinition', props.word, definition)
}

function handleMove(value: string | number) {
  emit('move', props.word, Number(value))
}

function handleRemove() {
  emit('remove', props.word)
}
</script>

<template>
  <li
    class="group grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 py-3 border-b border-border last:border-b-0 sm:flex sm:gap-3"
    :data-testid="`vocabulary-word-${word.id}`"
  >
    <button
      class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors"
      :class="word.learned ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-transparent hover:text-muted-foreground'"
      :aria-label="word.learned ? t('vocabulary.word.markLearning') : t('vocabulary.word.markLearned')"
      :aria-pressed="word.learned"
      @click="handleToggleLearned"
    >
      <Check :size="13" />
    </button>

    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span class="font-semibold text-foreground" :class="word.learned ? 'line-through decoration-muted-foreground/60' : ''">{{ word.word }}</span>
        <span v-if="showList && listName" class="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{{ listName }}</span>
      </div>

      <div v-if="editing" class="space-y-2">
        <Textarea v-model="draft" rows="3" :placeholder="t('vocabulary.word.definitionPlaceholder')" />
        <div class="flex gap-2">
          <Button size="sm" @click="handleSave">{{ t('common.save') }}</Button>
          <Button size="sm" variant="ghost" @click="handleCancelEdit">{{ t('common.cancel') }}</Button>
        </div>
      </div>
      <p v-else-if="word.definition" class="text-sm text-foreground/90 whitespace-pre-line">{{ word.definition }}</p>
      <p v-else-if="lookingUp" class="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 :size="13" class="animate-spin" />
        {{ t('vocabulary.word.lookingUp') }}
      </p>
      <button v-else-if="noMeaning" class="text-sm text-muted-foreground hover:text-foreground hover:underline" @click="handleEdit">
        {{ t('vocabulary.word.noMeaning') }}
      </button>

      <button
        type="button"
        class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        :aria-expanded="showMeanings"
        :data-testid="`vocabulary-meanings-${word.id}`"
        @click="handleToggleMeanings"
      >
        <Languages :size="12" />
        {{ t('vocabulary.meanings.toggle') }}
        <ChevronDown :size="12" class="transition-transform" :class="showMeanings ? 'rotate-180' : ''" />
      </button>
      <WordMeanings v-if="showMeanings" :word="lookupWord" :language="word.language" :current="word.definition" @use="handleUseMeaning" />

      <p v-if="word.context" class="text-sm italic text-muted-foreground">“{{ word.context }}”</p>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <RouterLink v-if="readerRoute && sourceLabel" :to="readerRoute" class="inline-flex items-center gap-1 hover:text-foreground hover:underline">
          <BookOpen :size="12" />
          <span class="truncate max-w-[16rem]">{{ sourceLabel }}</span>
        </RouterLink>
        <span v-else-if="sourceLabel" class="truncate max-w-[16rem]">{{ sourceLabel }}</span>
      </div>
    </div>

    <div class="col-start-2 flex shrink-0 items-start gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
      <Select
        v-if="lists.length > 1"
        :modelValue="word.listId"
        class="h-8 w-28 text-xs"
        :aria-label="t('vocabulary.word.moveTo')"
        @update:modelValue="handleMove"
      >
        <option v-for="list in lists" :key="list.id" :value="list.id">{{ list.name }}</option>
      </Select>
      <Button variant="ghost" size="icon-sm" :aria-label="t('vocabulary.word.editDefinition')" @click="handleEdit">
        <Pencil :size="14" />
      </Button>
      <Button variant="destructive-ghost" size="icon-sm" :aria-label="t('vocabulary.word.delete')" @click="handleRemove">
        <Trash2 :size="14" />
      </Button>
    </div>
  </li>
</template>
