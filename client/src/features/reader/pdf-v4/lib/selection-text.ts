/** Where a selection sits in one page's text, in the character offsets the PDF engine uses. */
export interface SelectionSlice {
  pageIndex: number
  start: number
  count: number
}

/**
 * The selected characters cut out of each page's extracted text. The engine's own selected-text
 * call refuses PDFs flagged "no copying"; a page's full text and the selection offsets still give
 * the word, since both count characters the same way.
 */
export function textFromSlices(slices: SelectionSlice[], pageTexts: Map<number, string>): string {
  return slices
    .map(({ pageIndex, start, count }) => (pageTexts.get(pageIndex) ?? '').slice(start, start + count))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
