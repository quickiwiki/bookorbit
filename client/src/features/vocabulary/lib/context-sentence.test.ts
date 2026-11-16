import { describe, expect, it } from 'vitest'
import { contextFromRange, sentenceAround } from './context-sentence'

describe('sentenceAround', () => {
  const paragraph = 'It was cold. The ephemeral   frost vanished by noon! Nobody noticed.'

  it('returns the sentence that contains the word, with whitespace collapsed', () => {
    expect(sentenceAround(paragraph, 'ephemeral')).toBe('The ephemeral frost vanished by noon!')
  })

  it('uses the offset hint to pick the right occurrence', () => {
    const text = 'A cat sat. Another cat ran.'
    expect(sentenceAround(text, 'cat', 19)).toBe('Another cat ran.')
  })

  it('returns null when the word is not in the paragraph', () => {
    expect(sentenceAround(paragraph, 'missing')).toBeNull()
  })

  it('trims very long sentences to a window around the word', () => {
    const long = `${'word '.repeat(400)}target ${'word '.repeat(400)}`
    const result = sentenceAround(long, 'target')!
    expect(result.length).toBeLessThanOrEqual(1000)
    expect(result).toContain('target')
    expect(result.startsWith('…')).toBe(true)
  })
})

describe('contextFromRange', () => {
  it('reads the sentence from the paragraph enclosing a DOM selection', () => {
    document.body.innerHTML = '<p id="p">First one. Then <em>serendipity</em> struck. Last.</p>'
    const em = document.querySelector('em')!
    const range = document.createRange()
    range.selectNodeContents(em)
    expect(contextFromRange(range, 'serendipity')).toBe('Then serendipity struck.')
  })

  it('returns null without a range', () => {
    expect(contextFromRange(null, 'x')).toBeNull()
  })
})
