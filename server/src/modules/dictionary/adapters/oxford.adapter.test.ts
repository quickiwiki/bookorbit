import { describe, expect, it, vi } from 'vitest';

import { lookupOxford, OxfordRequestError, parseOxfordPayload, type OxfordLookupInput } from './oxford.adapter';

const ENTRIES_PAYLOAD = {
  results: [
    {
      word: 'ace',
      lexicalEntries: [
        {
          lexicalCategory: { text: 'Noun' },
          entries: [
            {
              pronunciations: [{ phoneticSpelling: 'eɪs', audioFile: 'https://audio.example/ace.mp3' }],
              senses: [
                {
                  definitions: ['a playing card with a single spot'],
                  examples: [{ text: 'the ace of diamonds' }],
                  subsenses: [{ definitions: ['a person who excels at a particular activity'] }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const TRANSLATION_PAYLOAD = {
  results: [
    {
      word: 'ace',
      lexicalEntries: [{ lexicalCategory: { text: 'Noun' }, entries: [{ senses: [{ translations: [{ text: 'as' }, { text: 'campeón' }] }] }] }],
    },
  ],
};

const input: OxfordLookupInput = {
  environment: 'sandbox',
  credentials: { appId: 'id', appKey: 'key' },
  word: 'Ace',
  sourceLang: 'en',
  targetLang: null,
};

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('parseOxfordPayload', () => {
  it('maps lexical entries, nested subsenses, examples and pronunciation', () => {
    expect(parseOxfordPayload(ENTRIES_PAYLOAD, 'ace', false)).toEqual({
      word: 'ace',
      phonetic: 'eɪs',
      audioUrl: 'https://audio.example/ace.mp3',
      entries: [
        {
          partOfSpeech: 'Noun',
          sourceWord: 'ace',
          definitions: [
            { definition: 'a playing card with a single spot', example: 'the ace of diamonds' },
            { definition: 'a person who excels at a particular activity', example: null },
          ],
        },
      ],
    });
  });

  it('joins translations when translating', () => {
    const parsed = parseOxfordPayload(TRANSLATION_PAYLOAD, 'ace', true);
    expect(parsed?.entries[0]?.definitions).toEqual([{ definition: 'as, campeón', example: null }]);
  });

  it('returns null for payloads without senses', () => {
    expect(parseOxfordPayload({ results: [] }, 'x', false)).toBeNull();
    expect(parseOxfordPayload(null, 'x', false)).toBeNull();
  });
});

describe('lookupOxford', () => {
  it('calls the entries endpoint with credentials in headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, ENTRIES_PAYLOAD));
    const result = await lookupOxford(input, fetchImpl as unknown as typeof fetch);

    expect(result?.word).toBe('ace');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://od-api-sandbox.oxforddictionaries.com/api/v2/entries/en/ace?strictMatch=false');
    expect(init.headers).toMatchObject({ app_id: 'id', app_key: 'key' });
  });

  it('uses the translations endpoint when a different target language is set', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, TRANSLATION_PAYLOAD));
    await lookupOxford({ ...input, environment: 'production', targetLang: 'es' }, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://od-api.oxforddictionaries.com/api/v2/translations/en/es/ace?strictMatch=false');
  });

  it('treats 404 as not found and rejected credentials as an error', async () => {
    await expect(lookupOxford(input, vi.fn().mockResolvedValue(jsonResponse(404)) as unknown as typeof fetch)).resolves.toBeNull();
    await expect(lookupOxford(input, vi.fn().mockResolvedValue(jsonResponse(403)) as unknown as typeof fetch)).rejects.toBeInstanceOf(
      OxfordRequestError,
    );
  });
});
