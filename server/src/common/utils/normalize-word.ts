/**
 * A selection as a vocabulary word: surrounding punctuation and quotes dropped ("tall," -> "tall"),
 * inner apostrophes and hyphens kept ("İstanbul'da", "well-known").
 */
export function cleanWord(word: string): string {
  return word
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '');
}

/** Case- and whitespace-insensitive key for matching a looked-up or saved word. */
export function normalizeWord(word: string): string {
  return word.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}
