const CYRILLIC = /\p{Script=Cyrillic}/u
const TURKISH_ONLY = /[ğışİĞŞ]/u
const TURKISH_SHARED = /[çöüÇÖÜ]/u
const LATIN = /\p{Script=Latin}/u

/**
 * A best guess at a typed word's language, limited to languages the user can look up. Letters
 * only Turkish uses decide Turkish; ç/ö/ü also appear in German or French, so they only do when
 * Turkish is the one such language available.
 */
export function guessLanguage(word: string, available: readonly string[]): string | null {
  const has = (lang: string) => available.includes(lang)
  if (CYRILLIC.test(word)) {
    if (has('ru')) return 'ru'
    return available.find((lang) => ['uk', 'bg', 'sr', 'be'].includes(lang)) ?? null
  }
  if (TURKISH_ONLY.test(word) && has('tr')) return 'tr'
  if (TURKISH_SHARED.test(word) && has('tr') && !available.some((lang) => ['de', 'fr'].includes(lang))) return 'tr'
  if (LATIN.test(word) && has('en')) return 'en'
  return null
}
