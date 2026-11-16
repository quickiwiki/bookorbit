import { describe, expect, it } from 'vitest'
import type { PdfPageGeometry } from '@embedpdf/models'
import { savedWordOccurrences, vocabularyMarkRects } from '../lib/vocabulary-marks'

/** One run per line, ten points per character, so offsets map to easy x values. */
function geometryFor(lines: string[]): PdfPageGeometry {
  let charStart = 0
  const runs = lines.map((line, row) => {
    const run = {
      rect: { x: 0, y: row * 20, width: line.length * 10, height: 12 },
      charStart,
      glyphs: [...line].map((ch, i) => ({ x: i * 10, y: row * 20, width: ch === ' ' ? 0 : 10, height: 12, flags: 0 })),
    }
    charStart += line.length + 2
    return run
  })
  return { runs }
}

describe('savedWordOccurrences', () => {
  it('finds every appearance of a saved word, whatever its case', () => {
    expect(savedWordOccurrences('Fish and more fish, no fishing.', new Set(['fish']))).toEqual([
      { key: 'fish', start: 0, end: 4 },
      { key: 'fish', start: 14, end: 18 },
    ])
  })

  it('finds nothing when no words are saved', () => {
    expect(savedWordOccurrences('fish', new Set())).toEqual([])
  })
})

describe('vocabularyMarkRects', () => {
  it('puts a box under each saved word', () => {
    const text = 'the fish swam'
    expect(vocabularyMarkRects(text, new Set(['fish']), geometryFor([text]))).toEqual([{ key: 'fish', x: 40, y: 0, width: 40, height: 12 }])
  })

  it('marks a word on the second line using its own line position', () => {
    const lines = ['a big', 'fish']
    const text = lines.join('\r\n')
    expect(vocabularyMarkRects(text, new Set(['fish']), geometryFor(lines))).toEqual([{ key: 'fish', x: 0, y: 20, width: 40, height: 12 }])
  })

  it('reads a word hyphenated at a line end as the part on that line', () => {
    const lines = ['well-', 'known']
    const geometry = geometryFor(lines)
    const text = 'well-\r\nknown'
    expect(vocabularyMarkRects(text, new Set(['well']), geometry)).toEqual([{ key: 'well', x: 0, y: 0, width: 40, height: 12 }])
  })
})
