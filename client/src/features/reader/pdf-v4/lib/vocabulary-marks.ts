import type { PdfPageGeometry } from '@embedpdf/models'
import { pageWordKey } from '@/features/vocabulary/lib/page-words'

/** A word, with inner apostrophes and hyphens kept; the same shape the Words list counts. */
const WORD = /\p{L}[\p{L}\p{M}]*(?:['’-][\p{L}\p{M}]+)*/gu

export interface MarkRect {
  key: string
  x: number
  y: number
  width: number
  height: number
}

/** Every place a saved word appears in a page's text, as character offsets. */
export function savedWordOccurrences(text: string, saved: ReadonlySet<string>): { key: string; start: number; end: number }[] {
  const found: { key: string; start: number; end: number }[] = []
  if (saved.size === 0) return found
  for (const match of text.matchAll(WORD)) {
    const key = pageWordKey(match[0])
    if (!saved.has(key)) continue
    const start = match.index ?? 0
    found.push({ key, start, end: start + match[0].length })
  }
  return found
}

/**
 * Boxes, in page points, under each saved word on the page. The page text and the geometry number
 * characters the same way, so a word's offsets in the text pick out its glyphs. A word broken over
 * two lines gets one box per line.
 */
export function vocabularyMarkRects(text: string, saved: ReadonlySet<string>, geometry: PdfPageGeometry): MarkRect[] {
  const occurrences = savedWordOccurrences(text, saved)
  if (occurrences.length === 0) return []

  const glyphAt = new Map<number, { run: number; x: number; y: number; width: number; height: number }>()
  geometry.runs.forEach((run, runIndex) => {
    run.glyphs.forEach((glyph, offset) => {
      if (glyph.width > 0 && glyph.height > 0)
        glyphAt.set(run.charStart + offset, { run: runIndex, x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height })
    })
  })

  const rects: MarkRect[] = []
  for (const { key, start, end } of occurrences) {
    let current: (MarkRect & { run: number }) | null = null
    for (let index = start; index < end; index++) {
      const glyph = glyphAt.get(index)
      if (!glyph) continue
      if (current && current.run === glyph.run) {
        const right = Math.max(current.x + current.width, glyph.x + glyph.width)
        const bottom = Math.max(current.y + current.height, glyph.y + glyph.height)
        current.x = Math.min(current.x, glyph.x)
        current.y = Math.min(current.y, glyph.y)
        current.width = right - current.x
        current.height = bottom - current.y
        continue
      }
      if (current) rects.push(withoutRun(current))
      current = { key, run: glyph.run, x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height }
    }
    if (current) rects.push(withoutRun(current))
  }
  return rects
}

function withoutRun({ key, x, y, width, height }: MarkRect & { run: number }): MarkRect {
  return { key, x, y, width, height }
}
