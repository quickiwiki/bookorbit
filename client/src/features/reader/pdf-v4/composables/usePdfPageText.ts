import { ref, toRaw, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useDocumentState, useRegistry } from '@embedpdf/core/vue'

/**
 * The text of the page being read, extracted by the PDF engine only while `enabled` (the Words
 * tab is open), so ordinary reading never pays for it. A late answer for a page already left is
 * dropped.
 */
export function usePdfPageText(documentId: MaybeRefOrGetter<string>, pageNumber: MaybeRefOrGetter<number>, enabled: MaybeRefOrGetter<boolean>) {
  const { registry } = useRegistry()
  const documentState = useDocumentState(documentId)
  const text = ref('')
  let requestId = 0

  watch(
    () => [toValue(enabled), toValue(pageNumber), documentState.value?.document] as const,
    async ([on, page, document]) => {
      const id = ++requestId
      if (!on || !document || page < 1 || page > document.pageCount) return
      try {
        // The engine runs in a worker: a reactive proxy cannot be posted to it, the plain object can.
        const extracted = await registry.value
          ?.getEngine()
          .extractText(toRaw(document), [page - 1])
          .toPromise()
        if (id === requestId) text.value = extracted ?? ''
      } catch {
        if (id === requestId) text.value = ''
      }
    },
    { immediate: true },
  )

  return { text }
}
