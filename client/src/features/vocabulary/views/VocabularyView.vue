<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookA, ChevronLeft, ChevronRight, Pencil, Plus, Search, Settings2, Trash2 } from '@lucide/vue'
import type { VocabularyLearnedFilter, VocabularyList, VocabularyWord, VocabularyWordSort } from '@bookorbit/types'
import { VOCABULARY_LIST_NAME_MAX_LENGTH } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import VocabularyAddWord from '../components/VocabularyAddWord.vue'
import VocabularyWordItem from '../components/VocabularyWordItem.vue'
import { useVocabulary } from '../composables/useVocabulary'

const { t } = useI18n()
const vocab = useVocabulary()

const newListName = ref('')
const showNewList = ref(false)
const renamingId = ref<number | null>(null)
const renameDraft = ref('')
const pendingDeleteList = ref<VocabularyList | null>(null)

const activeList = computed(() => vocab.lists.value.find((l) => l.id === vocab.activeListId.value) ?? null)
const targetList = computed(() => activeList.value ?? vocab.lists.value.find((l) => l.isDefault) ?? null)
const heading = computed(() => activeList.value?.name ?? t('vocabulary.allWords'))
const learnedOptions = computed<{ value: VocabularyLearnedFilter; label: string }[]>(() => [
  { value: 'all', label: t('vocabulary.filter.all') },
  { value: 'learning', label: t('vocabulary.filter.learning') },
  { value: 'learned', label: t('vocabulary.filter.learned') },
])
const sortOptions = computed<{ value: VocabularyWordSort; label: string }[]>(() => [
  { value: 'newest', label: t('vocabulary.sort.newest') },
  { value: 'oldest', label: t('vocabulary.sort.oldest') },
  { value: 'az', label: t('vocabulary.sort.az') },
  { value: 'za', label: t('vocabulary.sort.za') },
])
const isFiltered = computed(() => vocab.search.value.trim() !== '' || vocab.learned.value !== 'all')

onMounted(() => {
  void vocab.init()
})

function selectList(id: number | null) {
  vocab.activeListId.value = id
}

function handleSelectAll() {
  selectList(null)
}

function handleMobileListChange(value: string | number) {
  selectList(value === '' ? null : Number(value))
}

function handleLearnedChange(value: string | number) {
  vocab.learned.value = value as VocabularyLearnedFilter
}

function handleSortChange(value: string | number) {
  vocab.sort.value = value as VocabularyWordSort
}

function handleShowNewList() {
  showNewList.value = true
}

async function handleCreateList() {
  const name = newListName.value.trim()
  if (!name) return
  if (await vocab.createList(name)) {
    newListName.value = ''
    showNewList.value = false
  }
}

function handleCancelNewList() {
  newListName.value = ''
  showNewList.value = false
}

function startRename(list: VocabularyList) {
  renamingId.value = list.id
  renameDraft.value = list.name
}

async function handleRenameSubmit() {
  const id = renamingId.value
  const name = renameDraft.value.trim()
  if (id === null || !name) return
  if (await vocab.renameList(id, name)) renamingId.value = null
}

function handleRenameCancel() {
  renamingId.value = null
}

function askDeleteList(list: VocabularyList) {
  pendingDeleteList.value = list
}

async function handleConfirmDeleteList() {
  const list = pendingDeleteList.value
  pendingDeleteList.value = null
  if (list) await vocab.deleteList(list.id)
}

function handleCancelDeleteList() {
  pendingDeleteList.value = null
}

async function handleWordAdded() {
  await Promise.all([vocab.loadLists(), vocab.loadWords()])
}

function handleToggleLearned(word: VocabularyWord) {
  void vocab.toggleLearned(word)
}

function handleSaveDefinition(word: VocabularyWord, definition: string) {
  void vocab.updateDefinition(word, definition)
}

function handleMove(word: VocabularyWord, listId: number) {
  void vocab.moveWord(word, listId)
}

function handleRemove(word: VocabularyWord) {
  void vocab.deleteWord(word)
}

function handlePrev() {
  if (vocab.page.value > 1) vocab.page.value -= 1
}

function handleNext() {
  if (vocab.page.value < vocab.pageCount.value) vocab.page.value += 1
}

function handleRetry() {
  void vocab.init()
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="font-serif text-2xl font-semibold text-foreground">{{ t('vocabulary.title') }}</h1>
        <p class="text-sm text-muted-foreground">{{ t('vocabulary.subtitle') }}</p>
      </div>
      <RouterLink
        :to="{ name: 'settings-reader-dictionaries' }"
        class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Settings2 :size="15" />
        {{ t('vocabulary.manageDictionaries') }}
      </RouterLink>
    </div>

    <VocabularyAddWord :listId="vocab.activeListId.value" :listName="targetList?.name ?? null" @added="handleWordAdded" />

    <div class="grid gap-6 md:grid-cols-[14rem_1fr]">
      <!-- Lists: sidebar on desktop, select on mobile -->
      <aside class="hidden md:block">
        <nav class="space-y-0.5" :aria-label="t('vocabulary.lists')">
          <button
            class="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors"
            :class="vocab.activeListId.value === null ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-muted text-foreground'"
            @click="handleSelectAll"
          >
            <span>{{ t('vocabulary.allWords') }}</span>
            <span class="text-xs text-muted-foreground">{{ vocab.totalAll.value }}</span>
          </button>

          <div v-for="list in vocab.lists.value" :key="list.id" class="group relative">
            <form v-if="renamingId === list.id" class="flex gap-1 px-1 py-1" @submit.prevent="handleRenameSubmit">
              <Input
                v-model="renameDraft"
                class="h-8 text-sm"
                :maxlength="VOCABULARY_LIST_NAME_MAX_LENGTH"
                autofocus
                @keydown.esc="handleRenameCancel"
              />
            </form>
            <button
              v-else
              class="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors"
              :class="vocab.activeListId.value === list.id ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-muted text-foreground'"
              @click="selectList(list.id)"
            >
              <span class="truncate">{{ list.name }}</span>
              <span class="text-xs text-muted-foreground group-hover:invisible">{{ list.wordCount }}</span>
            </button>
            <div v-if="renamingId !== list.id" class="absolute right-1 top-1/2 hidden -translate-y-1/2 gap-0.5 group-hover:flex">
              <Button variant="ghost" size="icon-sm" class="size-7" :aria-label="t('vocabulary.renameList')" @click="startRename(list)">
                <Pencil :size="13" />
              </Button>
              <Button
                v-if="!list.isDefault"
                variant="destructive-ghost"
                size="icon-sm"
                class="size-7"
                :aria-label="t('vocabulary.deleteList')"
                @click="askDeleteList(list)"
              >
                <Trash2 :size="13" />
              </Button>
            </div>
          </div>

          <form v-if="showNewList" class="flex gap-1 px-1 pt-2" @submit.prevent="handleCreateList">
            <Input
              v-model="newListName"
              class="h-8 text-sm"
              :placeholder="t('vocabulary.newListPlaceholder')"
              :maxlength="VOCABULARY_LIST_NAME_MAX_LENGTH"
              autofocus
              @keydown.esc="handleCancelNewList"
            />
          </form>
          <button
            v-else
            class="mt-2 flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="handleShowNewList"
          >
            <Plus :size="14" />
            {{ t('vocabulary.newList') }}
          </button>
        </nav>
      </aside>

      <section class="min-w-0">
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <Select
            class="md:hidden w-full"
            :modelValue="vocab.activeListId.value ?? ''"
            :aria-label="t('vocabulary.lists')"
            @update:modelValue="handleMobileListChange"
          >
            <option value="">{{ t('vocabulary.allWords') }} ({{ vocab.totalAll.value }})</option>
            <option v-for="list in vocab.lists.value" :key="list.id" :value="list.id">{{ list.name }} ({{ list.wordCount }})</option>
          </Select>
          <h2 class="hidden md:block mr-auto text-lg font-semibold text-foreground truncate">{{ heading }}</h2>
          <div class="relative flex-1 md:flex-none md:w-64">
            <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              v-model="vocab.search.value"
              class="pl-8 h-9"
              :placeholder="t('vocabulary.searchPlaceholder')"
              :aria-label="t('vocabulary.searchPlaceholder')"
            />
          </div>
          <Select
            class="w-36 h-9"
            :modelValue="vocab.learned.value"
            :aria-label="t('vocabulary.filter.label')"
            @update:modelValue="handleLearnedChange"
          >
            <option v-for="option in learnedOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </Select>
          <Select class="w-40 h-9" :modelValue="vocab.sort.value" :aria-label="t('vocabulary.sort.label')" @update:modelValue="handleSortChange">
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </Select>
        </div>

        <div v-if="vocab.loadError.value" class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p class="text-destructive mb-2">{{ vocab.loadError.value }}</p>
          <Button size="sm" variant="outline" @click="handleRetry">{{ t('common.retry') }}</Button>
        </div>

        <div
          v-else-if="!vocab.loading.value && vocab.words.value.length === 0"
          class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-14 text-center"
        >
          <BookA :size="28" class="text-muted-foreground" />
          <p class="font-medium text-foreground">{{ isFiltered ? t('vocabulary.empty.filteredTitle') : t('vocabulary.empty.title') }}</p>
          <p v-if="!isFiltered" class="max-w-sm text-sm text-muted-foreground">{{ t('vocabulary.empty.hint') }}</p>
        </div>

        <ul
          v-else
          class="rounded-lg border border-border bg-card px-4"
          :class="vocab.loading.value ? 'opacity-60' : ''"
          :aria-busy="vocab.loading.value"
        >
          <VocabularyWordItem
            v-for="word in vocab.words.value"
            :key="word.id"
            :word="word"
            :lists="vocab.lists.value"
            :showList="vocab.activeListId.value === null"
            :lookingUp="vocab.lookingUp.value.has(word.id)"
            :noMeaning="vocab.noMeaningFound.value.has(word.id)"
            @toggleLearned="handleToggleLearned"
            @saveDefinition="handleSaveDefinition"
            @move="handleMove"
            @remove="handleRemove"
          />
        </ul>

        <div v-if="vocab.total.value > 0" class="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>{{ t('vocabulary.range', { start: vocab.rangeStart.value, end: vocab.rangeEnd.value, total: vocab.total.value }) }}</span>
          <div class="flex gap-1">
            <Button variant="outline" size="icon-sm" :disabled="vocab.page.value <= 1" :aria-label="t('vocabulary.prevPage')" @click="handlePrev">
              <ChevronLeft :size="15" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              :disabled="vocab.page.value >= vocab.pageCount.value"
              :aria-label="t('vocabulary.nextPage')"
              @click="handleNext"
            >
              <ChevronRight :size="15" />
            </Button>
          </div>
        </div>
      </section>
    </div>

    <ConfirmDialog
      :open="pendingDeleteList !== null"
      :title="t('vocabulary.deleteListTitle')"
      :description="t('vocabulary.deleteListDescription', { name: pendingDeleteList?.name ?? '', count: pendingDeleteList?.wordCount ?? 0 })"
      :confirmLabel="t('vocabulary.deleteList')"
      destructive
      @confirm="handleConfirmDeleteList"
      @cancel="handleCancelDeleteList"
    />
  </div>
</template>
