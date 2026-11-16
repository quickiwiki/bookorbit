import { describe, expect, it } from 'vitest'
import { pageWords } from './page-words'

describe('pageWords', () => {
  it('lists distinct words in page order, counting repeats', () => {
    const words = pageWords('The cat saw the other cat. "Cats!" said the dog.')
    expect(words.map((w) => [w.text, w.count])).toEqual([
      ['the', 3],
      ['cat', 2],
      ['saw', 1],
      ['other', 1],
      ['Cats', 1],
      ['said', 1],
      ['dog', 1],
    ])
  })

  it('keeps inner apostrophes and hyphens and skips single letters and numbers', () => {
    expect(pageWords("İstanbul'da a well-known 1984 x yol").map((w) => w.text)).toEqual(["İstanbul'da", 'well-known', 'yol'])
  })

  it('reads Cyrillic and stress marks as part of the word', () => {
    expect(pageWords('Кошка спит. Кошки́ спят.').map((w) => w.key)).toEqual(['кошка', 'спит', 'кошки́', 'спят'])
  })

  it('stops collecting new words past the limit', () => {
    expect(pageWords('one two three four', 2).map((w) => w.text)).toEqual(['one', 'two'])
  })
})
