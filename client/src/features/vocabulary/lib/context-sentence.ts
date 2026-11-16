import { VOCABULARY_CONTEXT_MAX_LENGTH } from '@bookorbit/types'

const BLOCK_SELECTOR = 'p, li, blockquote, td, th, dd, dt, h1, h2, h3, h4, h5, h6, div, section'
const SENTENCE_END = /[.!?…。！？]["'”’)\]]*\s/g

/**
 * The sentence around a selection, cut from the enclosing paragraph's text.
 * Falls back to a window around the word when the paragraph has no sentence breaks.
 */
export function sentenceAround(paragraph: string, selected: string, offsetHint = -1): string | null {
  const text = paragraph.replace(/\s+/g, ' ')
  const needle = selected.replace(/\s+/g, ' ').trim()
  if (!text.trim() || !needle) return null

  let at = offsetHint >= 0 ? text.indexOf(needle, Math.max(0, offsetHint - needle.length)) : -1
  if (at < 0) at = text.indexOf(needle)
  if (at < 0) return null

  let start = 0
  let end = text.length
  for (const match of text.matchAll(SENTENCE_END)) {
    const boundary = (match.index ?? 0) + match[0].length
    if (boundary <= at) start = boundary
    else if (boundary > at + needle.length) {
      end = boundary
      break
    }
  }

  let sentence = text.slice(start, end).trim()
  if (sentence.length > VOCABULARY_CONTEXT_MAX_LENGTH) {
    // Two characters are reserved for the ellipses so the result never exceeds the server limit.
    const budget = VOCABULARY_CONTEXT_MAX_LENGTH - 2
    const from = Math.max(0, at - start - Math.floor((budget - needle.length) / 2))
    sentence = `…${sentence.slice(from, from + budget).trim()}…`
  }
  return sentence || null
}

export function contextFromRange(range: Range | null, selected: string): string | null {
  if (!range) return null
  const startNode = range.startContainer
  const element = startNode.nodeType === Node.ELEMENT_NODE ? (startNode as Element) : startNode.parentElement
  const block = element?.closest(BLOCK_SELECTOR) ?? element
  if (!block?.textContent) return null

  let offset = -1
  try {
    const before = block.ownerDocument.createRange()
    before.setStart(block, 0)
    before.setEnd(range.startContainer, range.startOffset)
    offset = before.toString().replace(/\s+/g, ' ').length
  } catch {
    offset = -1
  }
  return sentenceAround(block.textContent, selected, offset)
}
