import type {
  CreateOxfordSourceRequest,
  CreateVocabularyWordRequest,
  CreateVocabularyWordResponse,
  DictionarySource,
  ExternalDictionaryResult,
  MatchVocabularyWordsRequest,
  ShareDictionarySourceRequest,
  UpdateDictionarySourceRequest,
  VocabularyLearnedFilter,
  VocabularyWordSort,
  VocabularyList,
  VocabularyWord,
  VocabularyWordPage,
} from '@bookorbit/types'
import { api } from '@/lib/api'
import { apiError, apiJson, apiSend, jsonBody } from '@/lib/api-json'

const VOCAB = '/api/v1/vocabulary'
const DICTIONARIES = '/api/v1/dictionaries'

export interface WordPageQuery {
  listId?: number | null
  q?: string
  learned?: VocabularyLearnedFilter
  sort?: VocabularyWordSort
  page: number
  pageSize: number
}

export const vocabularyApi = {
  lists: () => apiJson<VocabularyList[]>(`${VOCAB}/lists`, undefined, 'vocabulary.errors.load'),

  createList: (name: string) => apiJson<VocabularyList>(`${VOCAB}/lists`, jsonBody('POST', { name }), 'vocabulary.errors.saveList'),

  renameList: (id: number, name: string) => apiSend(`${VOCAB}/lists/${id}`, jsonBody('PATCH', { name }), 'vocabulary.errors.saveList'),

  deleteList: (id: number) => apiSend(`${VOCAB}/lists/${id}`, { method: 'DELETE' }, 'vocabulary.errors.deleteList'),

  words: (query: WordPageQuery) => {
    const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) })
    if (query.listId) params.set('listId', String(query.listId))
    if (query.q?.trim()) params.set('q', query.q.trim())
    if (query.learned && query.learned !== 'all') params.set('learned', query.learned)
    if (query.sort && query.sort !== 'newest') params.set('sort', query.sort)
    return apiJson<VocabularyWordPage>(`${VOCAB}/words?${params}`, undefined, 'vocabulary.errors.load')
  },

  matchWords: (words: string[]) =>
    apiJson<VocabularyWord[]>(`${VOCAB}/words/match`, jsonBody('POST', { words } satisfies MatchVocabularyWordsRequest), 'vocabulary.errors.load'),

  addWord: (body: CreateVocabularyWordRequest) =>
    apiJson<CreateVocabularyWordResponse>(`${VOCAB}/words`, jsonBody('POST', body), 'vocabulary.errors.addWord'),

  updateWord: (id: number, body: Partial<Pick<VocabularyWord, 'listId' | 'definition' | 'context' | 'learned'>>) =>
    apiJson<VocabularyWord>(`${VOCAB}/words/${id}`, jsonBody('PATCH', body), 'vocabulary.errors.saveWord'),

  deleteWord: (id: number) => apiSend(`${VOCAB}/words/${id}`, { method: 'DELETE' }, 'vocabulary.errors.deleteWord'),
}

export const dictionaryApi = {
  sources: () => apiJson<DictionarySource[]>(DICTIONARIES, undefined, 'dictionaries.errors.load'),

  lookup: (word: string, lang: string) => {
    const params = new URLSearchParams({ word })
    if (lang) params.set('lang', lang)
    return apiJson<ExternalDictionaryResult[]>(`${DICTIONARIES}/lookup?${params}`, undefined, 'dictionaries.errors.lookup')
  },

  createOxford: (body: CreateOxfordSourceRequest) =>
    apiJson<DictionarySource>(`${DICTIONARIES}/oxford`, jsonBody('POST', body), 'dictionaries.errors.save'),

  upload: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const response = await api(`${DICTIONARIES}/upload`, { method: 'POST', body: form })
    if (!response.ok) throw await apiError(response, 'dictionaries.errors.upload')
    return (await response.json()) as DictionarySource
  },

  update: (id: number, body: UpdateDictionarySourceRequest) =>
    apiJson<DictionarySource>(`${DICTIONARIES}/${id}`, jsonBody('PATCH', body), 'dictionaries.errors.save'),

  setShared: (id: number, body: ShareDictionarySourceRequest) =>
    apiJson<DictionarySource>(`${DICTIONARIES}/${id}/sharing`, jsonBody('PATCH', body), 'dictionaries.errors.share'),

  remove: (id: number) => apiSend(`${DICTIONARIES}/${id}`, { method: 'DELETE' }, 'dictionaries.errors.delete'),
}
