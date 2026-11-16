/** Languages whose dotted and dotless i make plain `toLowerCase()` wrong. */
const TURKIC_LANGUAGES = new Set(['tr', 'az']);

/** Stress accents that Russian dictionaries print but running text never carries. */
const CYRILLIC_STRESS = /([Ѐ-ӿ])[̀́]/g;

/**
 * The key a dictionary form is indexed and looked up by. Both sides go through this with the
 * dictionary's language, so `Işık` at the start of a Turkish sentence finds `ışık`, and
 * `кошки` finds the stressed `ко́шки`. `ё` folds to `е` because most Russian books omit it.
 */
export function dictionaryKey(text: string, lang: string | null): string {
  const unstressed = text.normalize('NFD').replace(CYRILLIC_STRESS, '$1').normalize('NFC').trim().replace(/\s+/g, ' ');
  const lower = lang && TURKIC_LANGUAGES.has(lang) ? unstressed.toLocaleLowerCase('tr') : unstressed.toLowerCase();
  return lower.replace(/ё/g, 'е');
}
