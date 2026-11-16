import { ref, toRaw, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useDocumentState, useRegistry } from '@embedpdf/core/vue'

/**
 * The text of the pages being read (both pages of a two-page spread), extracted by the PDF engine
 * only while `enabled` (the Words tab is open), so ordinary reading never pays for it. A late
 * answer for pages already left is dropped.
 */
export function usePdfPageText(documentId: MaybeRefOrGetter<string>, pageNumbers: MaybeRefOrGetter<number[]>, enabled: MaybeRefOrGetter<boolean>) {
  const { registry } = useRegistry()
  const documentState = useDocumentState(documentId)
  const text = ref('')
  let requestId = 0

  watch(
    () => [toValue(enabled), toValue(pageNumbers).join(','), documentState.value?.document] as const,
    async ([on, , document]) => {
      const id = ++requestId
      const indexes = toValue(pageNumbers)
        .filter((page) => document && page >= 1 && page <= document.pageCount)
        .map((page) => page - 1)
      if (!on || !document || indexes.length === 0) return
      try {
        // The engine runs in a worker: a reactive proxy cannot be posted to it, the plain object can.
        const extracted = await registry.value?.getEngine().extractText(toRaw(document), indexes).toPromise()
        if (id === requestId) text.value = extracted ?? ''
      } catch {
        if (id === requestId) text.value = ''
      }
    },
    { immediate: true },
  )

  /** One page's text on demand, for pages other than the one the Words tab follows. */
  async function readPage(pageIndex: number): Promise<string> {
    const document = documentState.value?.document
    if (!document || pageIndex < 0 || pageIndex >= document.pageCount) return ''
    try {
      return (await registry.value?.getEngine().extractText(toRaw(document), [pageIndex]).toPromise()) ?? ''
    } catch {
      return ''
    }
  }

  return { text, readPage }
}
