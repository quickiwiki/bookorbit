import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { CreateVocabularyWordRequest, VocabularyWord } from '@bookorbit/types'
import { VOCABULARY_WORD_MAX_LENGTH } from '@bookorbit/types'
import { errorMessage } from '@/lib/api-json'
import { cleanSelectedWord, useDefinitionLookup } from '../lib/definition'
import { vocabularyApi } from './vocabularyApi'

/** Selections longer than this are phrases or passages, not vocabulary. */
const MAX_WORDS_IN_SELECTION = 6

export function useSaveVocabularyWord() {
  const { t } = useI18n()
  const router = useRouter()
  const saving = ref(false)
  const { resolve } = useDefinitionLookup()

  function openVocabulary() {
    void router.push({ name: 'vocabulary' })
  }

  async function save(request: CreateVocabularyWordRequest, options: { viewAction?: boolean } = {}): Promise<VocabularyWord | null> {
    const word = cleanSelectedWord(request.word)
    if (!word) return null
    if (word.length > VOCABULARY_WORD_MAX_LENGTH || word.split(' ').length > MAX_WORDS_IN_SELECTION) {
      toast.error(t('vocabulary.toast.tooLong'))
      return null
    }

    saving.value = true
    try {
      const definition = request.definition?.trim() || (await resolve(word, request.language))
      const result = await vocabularyApi.addWord({ ...request, word, definition })
      const message = result.created
        ? t('vocabulary.toast.added', { word: result.word.word, list: result.listName })
        : t('vocabulary.toast.alreadySaved', { word: result.word.word, list: result.listName })
      toast.success(message, options.viewAction === false ? {} : { action: { label: t('vocabulary.toast.view'), onClick: openVocabulary } })
      return result.word
    } catch (error) {
      toast.error(errorMessage(error, 'vocabulary.errors.addWord'))
      return null
    } finally {
      saving.value = false
    }
  }

  return { save, saving }
}
