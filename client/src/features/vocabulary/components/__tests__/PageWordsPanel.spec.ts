import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { shallowRef } from 'vue'
import type { VocabularyWord } from '@bookorbit/types'

const mocks = vi.hoisted(() => ({
  matchWords: vi.fn(),
  lastSaved: null as unknown as { value: { word: VocabularyWord; at: number } | null },
}))

vi.mock('../../composables/vocabularyApi', () => ({
  vocabularyApi: { matchWords: mocks.matchWords, updateWord: vi.fn() },
  dictionaryApi: { lookup: vi.fn().mockResolvedValue([]) },
}))

vi.mock('../../composables/useSaveVocabularyWord', async () => {
  const { shallowRef: makeRef } = await import('vue')
  mocks.lastSaved = makeRef(null)
  return {
    useSaveVocabularyWord: () => ({ save: vi.fn(), saving: shallowRef(false) }),
    useLastSavedVocabularyWord: () => mocks.lastSaved,
  }
})

import PageWordsPanel from '../PageWordsPanel.vue'

function word(text: string): VocabularyWord {
  return { id: 1, word: text, definition: 'a meaning' } as VocabularyWord
}

function mountPanel() {
  return mount(PageWordsPanel, {
    props: { text: 'The fish swam past the old harbour.', language: 'en', saveContext: { bookId: 1, bookFileId: 1, bookFormat: 'pdf' } },
    global: { stubs: { WordMeanings: true } },
  })
}

describe('PageWordsPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.matchWords.mockReset().mockResolvedValue([])
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('moves a word saved elsewhere into the saved group and points it out', async () => {
    const wrapper = mountPanel()
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(wrapper.text()).not.toContain('In your vocabulary')

    mocks.lastSaved.value = { word: word('Fish'), at: 1 }
    await flushPromises()

    expect(wrapper.text()).toContain('In your vocabulary (1)')
    const row = wrapper.find('[data-word-key="fish"]')
    expect(row.classes()).toContain('bg-primary/15')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.find('[data-word-key="fish"]').classes()).not.toContain('bg-primary/15')
  })

  it('ignores a saved word that is not on this page', async () => {
    const wrapper = mountPanel()
    await vi.advanceTimersByTimeAsync(500)
    mocks.lastSaved.value = { word: word('galaxy'), at: 2 }
    await flushPromises()
    expect(wrapper.text()).not.toContain('In your vocabulary')
  })
})
