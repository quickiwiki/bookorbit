import { describe, expect, it } from 'vitest'
import { guessLanguage } from './guess-language'

const ALL = ['en', 'ru', 'tr']

describe('guessLanguage', () => {
  it('reads the script and Turkish letters', () => {
    expect(guessLanguage('кошка', ALL)).toBe('ru')
    expect(guessLanguage('ışık', ALL)).toBe('tr')
    expect(guessLanguage('İstanbul', ALL)).toBe('tr')
    expect(guessLanguage('çok', ALL)).toBe('tr')
    expect(guessLanguage('ephemeral', ALL)).toBe('en')
  })

  it('only answers with a language the user can look up', () => {
    expect(guessLanguage('ışık', ['en'])).toBe('en')
    expect(guessLanguage('кошка', ['en', 'uk'])).toBe('uk')
    expect(guessLanguage('кошка', ['en'])).toBeNull()
    expect(guessLanguage('123', ALL)).toBeNull()
  })

  it('does not take German umlauts for Turkish when German is available', () => {
    expect(guessLanguage('schön', ['en', 'de', 'tr'])).toBe('en')
  })
})
