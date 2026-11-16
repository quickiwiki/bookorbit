import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DictionaryEntry } from '@bookorbit/types'

const externalLookup = vi.fn()
const builtInLookup = vi.fn()
vi.mock('../composables/vocabularyApi', () => ({ dictionaryApi: { lookup: (...a: unknown[]) => externalLookup(...a) } }))
vi.mock('@/features/reader/epub/composables/useDictionary', () => ({
  normalizeLang: (l: string) => l.split('-')[0],
  useDictionary: () => ({ lookup: (...a: unknown[]) => builtInLookup(...a) }),
}))

const { cleanSelectedWord, formatDefinition, useDefinitionLookup } = await import('./definition')

const sense = (definition: string) => ({ definition, example: null })
const entry = (partOfSpeech: string, defs: string[], sourceWord = 'ışık'): DictionaryEntry => ({
  partOfSpeech,
  definitions: defs.map(sense),
  sourceWord,
})

describe('formatDefinition', () => {
  it('keeps a few senses per part of speech', () => {
    const text = formatDefinition('ışık', [entry('noun', ['light', 'lamp', 'gleam', 'enlightenment']), entry('adj', ['bright'])])
    expect(text).toBe('(noun) light; lamp; gleam\n(adj) bright')
  })

  it('names the base form when the senses belong to it', () => {
    expect(formatDefinition('кошкой', [entry('noun', ['cat'], 'кошка')])).toBe('кошка (noun) cat')
  })

  it('returns null when there is nothing to show', () => {
    expect(formatDefinition('x', [])).toBeNull()
    expect(formatDefinition('x', [entry('noun', [])])).toBeNull()
  })
})

describe('useDefinitionLookup', () => {
  beforeEach(() => {
    externalLookup.mockReset()
    builtInLookup.mockReset()
  })

  it("prefers the user's dictionaries and passes the word's language", async () => {
    externalLookup.mockResolvedValue([{ entries: [entry('noun', ['cat'], 'кошка')] }])
    await expect(useDefinitionLookup().resolve('кошки', 'ru-RU')).resolves.toBe('кошка (noun) cat')
    expect(externalLookup).toHaveBeenCalledWith('кошки', 'ru')
    expect(builtInLookup).not.toHaveBeenCalled()
  })

  it('falls back to the built-in dictionaries, also when the server lookup fails', async () => {
    externalLookup.mockRejectedValue(new Error('offline'))
    builtInLookup.mockResolvedValue({ entries: [entry('adjective', ['lasting a short time'], 'ephemeral')] })
    await expect(useDefinitionLookup().resolve('ephemeral', null)).resolves.toBe('(adjective) lasting a short time')
    expect(builtInLookup).toHaveBeenCalledWith('ephemeral', 'en')
  })

  it('returns null when no dictionary knows the word', async () => {
    externalLookup.mockResolvedValue([])
    builtInLookup.mockResolvedValue(null)
    await expect(useDefinitionLookup().resolve('qwzx', 'en')).resolves.toBeNull()
  })
})

describe('cleanSelectedWord', () => {
  it('drops surrounding punctuation and quotes', () => {
    expect(cleanSelectedWord('tall,')).toBe('tall')
    expect(cleanSelectedWord('“diffidence.”')).toBe('diffidence')
    expect(cleanSelectedWord('  (кошки)! ')).toBe('кошки')
  })

  it('keeps inner apostrophes and hyphens', () => {
    expect(cleanSelectedWord("İstanbul'da,")).toBe("İstanbul'da")
    expect(cleanSelectedWord('well-known.')).toBe('well-known')
    expect(cleanSelectedWord('ruká́.')).toBe('ruká́')
  })
})
