import type { DictionaryDefinition, DictionaryEntry } from '@bookorbit/types';

const MAX_DEFINITIONS = 30;

/** Tags whose content is a media file name or link target, never readable text. */
const DROPPED_CONTENT_TAGS = ['s', 'video', 'url'];

function unescapeDsl(text: string): string {
  return text.replace(/\\(.)/g, '$1');
}

function stripMarkup(line: string): string {
  let text = line;
  for (const tag of DROPPED_CONTENT_TAGS) {
    text = text.replace(new RegExp(`\\[${tag}\\][\\s\\S]*?\\[/${tag}\\]`, 'g'), '');
  }
  return unescapeDsl(text.replace(/(?<!\\)\[\/?[^\]]*\]/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turns a raw DSL card into the sense list the reader's dictionary popover already shows.
 * Lines carrying `[ex]` become the example of the sense above them; `[p]` labels on a line
 * of their own become the part of speech of what follows.
 */
export function renderDslBody(headword: string, body: string): DictionaryEntry[] {
  const entries: DictionaryEntry[] = [];
  let current: DictionaryEntry = { partOfSpeech: '', definitions: [], sourceWord: headword };
  let total = 0;

  const flush = () => {
    if (current.definitions.length > 0) entries.push(current);
  };

  for (const rawLine of body.split('\n')) {
    if (total >= MAX_DEFINITIONS) break;
    const withHeadword = rawLine.replace(/(?<!\\)~/g, headword);
    const text = stripMarkup(withHeadword);
    if (!text) continue;

    const labels = [...withHeadword.matchAll(/\[p\]([\s\S]*?)\[\/p\]/g)].map((m) => stripMarkup(m[1] ?? ''));
    if (labels.length > 0 && labels.join(' ') === text) {
      flush();
      current = { partOfSpeech: text, definitions: [], sourceWord: headword };
      continue;
    }

    const last: DictionaryDefinition | undefined = current.definitions[current.definitions.length - 1];
    if (/\[ex\]/.test(withHeadword) && last && !last.example) {
      last.example = text;
      continue;
    }

    current.definitions.push({ definition: text, example: null });
    total += 1;
  }

  flush();
  return entries;
}
