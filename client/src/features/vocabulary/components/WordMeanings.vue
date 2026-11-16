<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Loader2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatLanguageName } from '@/i18n/formatters'
import { storage } from '@/services/storage'
import { useWordMeanings, type WordMeaning } from '../composables/useWordMeanings'
import { formatDefinition } from '../lib/definition'

const MAX_SENSES = 5
const MAX_BLOCKS = 4
const TAB_KEY = 'vocabularyMeaningLanguage'

const props = withDefaults(
  defineProps<{ word: string; language: string | null; current?: string | null; canSave?: boolean; useLabel?: string | null }>(),
  { current: null, canSave: true, useLabel: null },
)
const emit = defineEmits<{ use: [definition: string] }>()

const { t } = useI18n()
const { meanings, loading, load } = useWordMeanings()
const activeKey = ref<string | null>(null)

const active = computed(() => meanings.value.find((m) => m.key === activeKey.value) ?? meanings.value[0] ?? null)
const activeText = computed(() => (active.value ? formatDefinition(props.word, active.value.entries) : null))
const isCurrent = computed(() => !!activeText.value && activeText.value === props.current)

function tabLabel(meaning: WordMeaning) {
  return meaning.language ? formatLanguageName(meaning.language) : meaning.sourceName
}

function pickInitialTab() {
  const preferred = storage.get<string | null>(TAB_KEY, null)
  activeKey.value = meanings.value.find((m) => m.language === preferred)?.key ?? meanings.value[0]?.key ?? null
}

async function refresh() {
  await load(props.word, props.language)
  pickInitialTab()
}

onMounted(refresh)
watch(() => [props.word, props.language], refresh)

function selectTab(meaning: WordMeaning) {
  activeKey.value = meaning.key
  if (meaning.language) storage.set(TAB_KEY, meaning.language)
}

function handleUse() {
  if (activeText.value) emit('use', activeText.value)
}
</script>

<template>
  <div class="rounded-md border border-border bg-muted/30 p-3 text-sm" data-testid="word-meanings">
    <p v-if="loading && meanings.length === 0" class="flex items-center gap-1.5 text-muted-foreground">
      <Loader2 :size="13" class="animate-spin" />
      {{ t('vocabulary.word.lookingUp') }}
    </p>
    <p v-else-if="meanings.length === 0" class="text-muted-foreground">{{ t('vocabulary.meanings.none') }}</p>
    <template v-else>
      <div class="mb-2 flex flex-wrap gap-1" role="tablist" :aria-label="t('vocabulary.meanings.tabs')">
        <button
          v-for="meaning in meanings"
          :key="meaning.key"
          type="button"
          role="tab"
          class="rounded-full px-2.5 py-0.5 text-xs transition-colors"
          :class="active?.key === meaning.key ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'"
          :aria-selected="active?.key === meaning.key"
          :title="meaning.sourceName"
          @click="selectTab(meaning)"
        >
          {{ tabLabel(meaning) }}
        </button>
      </div>
      <div v-if="active" role="tabpanel" class="space-y-2">
        <p v-if="active.headword.toLowerCase() !== word.toLowerCase()" class="text-xs text-muted-foreground">
          {{ t('vocabulary.meanings.baseForm', { word: active.headword }) }}
        </p>
        <div v-for="(entry, index) in active.entries.slice(0, MAX_BLOCKS)" :key="index">
          <p v-if="entry.partOfSpeech" class="text-xs italic text-muted-foreground">{{ entry.partOfSpeech }}</p>
          <ol class="list-decimal space-y-0.5 ps-5 text-foreground/90">
            <li v-for="(sense, senseIndex) in entry.definitions.slice(0, MAX_SENSES)" :key="senseIndex">
              {{ sense.definition }}
              <span v-if="sense.example" class="block text-xs italic text-muted-foreground">{{ sense.example }}</span>
            </li>
          </ol>
        </div>
        <p class="text-[11px] text-muted-foreground">{{ active.sourceName }}</p>
        <div v-if="canSave" class="pt-1">
          <span v-if="isCurrent" class="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Check :size="12" />
            {{ t('vocabulary.meanings.isSaved') }}
          </span>
          <Button v-else size="sm" variant="outline" class="h-7 text-xs" @click="handleUse">{{ useLabel ?? t('vocabulary.meanings.use') }}</Button>
        </div>
      </div>
    </template>
  </div>
</template>
