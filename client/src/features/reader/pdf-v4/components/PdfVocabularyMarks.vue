<script setup lang="ts">
import { computed, ref, shallowRef, toRaw, watch } from 'vue'
import { useDocumentState, useRegistry } from '@embedpdf/core/vue'
import type { PdfPageGeometry } from '@embedpdf/models'
import { useLastSavedVocabularyWord } from '@/features/vocabulary/composables/useSaveVocabularyWord'
import { vocabularyApi } from '@/features/vocabulary/composables/vocabularyApi'
import { pageWordKey, pageWords } from '@/features/vocabulary/lib/page-words'
import { vocabularyMarkRects } from '../lib/vocabulary-marks'

const props = defineProps<{ documentId: string; pageIndex: number }>()

const { registry } = useRegistry()
const documentState = useDocumentState(() => props.documentId)
const lastSaved = useLastSavedVocabularyWord()

const pageText = ref('')
const geometry = shallowRef<PdfPageGeometry | null>(null)
const pageKeys = shallowRef(new Set<string>())
const saved = shallowRef(new Set<string>())
let requestId = 0

const scale = computed(() => documentState.value?.scale ?? 1)
const rects = computed(() => (geometry.value ? vocabularyMarkRects(pageText.value, saved.value, geometry.value) : []))

async function load() {
  const id = ++requestId
  const document = documentState.value?.document
  const page = document?.pages[props.pageIndex]
  const engine = registry.value?.getEngine()
  if (!document || !page || !engine) return
  try {
    // The engine runs in a worker: plain objects can be posted to it, reactive proxies cannot.
    const [text, shape] = await Promise.all([
      engine.extractText(toRaw(document), [props.pageIndex]).toPromise(),
      engine.getPageGeometry(toRaw(document), toRaw(page)).toPromise(),
    ])
    if (id !== requestId) return
    const keys = pageWords(text).map((word) => word.key)
    const found = keys.length > 0 ? await vocabularyApi.matchWords(keys) : []
    if (id !== requestId) return
    pageText.value = text
    geometry.value = shape
    pageKeys.value = new Set(keys)
    saved.value = new Set(found.map((word) => pageWordKey(word.word)))
  } catch {
    // Marks are a reading aid; a page that cannot be measured simply goes without them.
  }
}

watch(
  () => [props.pageIndex, documentState.value?.document] as const,
  () => void load(),
  { immediate: true },
)

watch(lastSaved, (entry) => {
  if (!entry) return
  const key = pageWordKey(entry.word.word)
  if (pageKeys.value.has(key) && !saved.value.has(key)) saved.value = new Set(saved.value).add(key)
})
</script>

<template>
  <div v-if="rects.length > 0" class="pointer-events-none absolute inset-0" data-testid="pdf-vocabulary-marks" aria-hidden="true">
    <div
      v-for="(rect, index) in rects"
      :key="index"
      class="absolute border-b-2 border-dashed border-primary/70"
      :style="{
        left: `${rect.x * scale}px`,
        top: `${rect.y * scale}px`,
        width: `${rect.width * scale}px`,
        height: `${rect.height * scale + 2}px`,
      }"
    />
  </div>
</template>
