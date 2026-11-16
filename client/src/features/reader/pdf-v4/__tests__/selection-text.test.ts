import { describe, expect, it } from 'vitest'
import { textFromSlices } from '../lib/selection-text'

describe('textFromSlices', () => {
  it('cuts the selected characters out of the page text', () => {
    const pages = new Map([[59, '"What\'s this fish doing in my ear?"']])
    expect(textFromSlices([{ pageIndex: 59, start: 13, count: 4 }], pages)).toBe('fish')
  })

  it('joins a selection that runs over two pages and folds line breaks', () => {
    const pages = new Map([
      [3, 'the end of a\r\nline'],
      [4, 'next page'],
    ])
    expect(
      textFromSlices(
        [
          { pageIndex: 3, start: 13, count: 6 },
          { pageIndex: 4, start: 0, count: 4 },
        ],
        pages,
      ),
    ).toBe('line next')
  })

  it('gives an empty string when a page text is missing', () => {
    expect(textFromSlices([{ pageIndex: 1, start: 0, count: 3 }], new Map())).toBe('')
  })
})
