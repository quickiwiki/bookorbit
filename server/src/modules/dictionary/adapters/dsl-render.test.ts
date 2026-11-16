import { describe, expect, it } from 'vitest';

import { renderDslBody } from './dsl-render';

describe('renderDslBody', () => {
  it('groups senses under [p] labels and attaches [ex] lines as examples', () => {
    const body = [
      '[m0][s]cat.wav[/s] [c gray]\\[kæt\\][/c][/m]',
      '[m1][p]n[/p][/m]',
      '[m1]1) [trn]кошка[/trn][/m]',
      '[m2][ex][lang id=1033]a black ~[/lang] — чёрная кошка[/ex][/m]',
      '[m1]2) [trn]кот[/trn][/m]',
      '[m1][p]v[/p][/m]',
      '[m1][trn]поднимать якорь[/trn] [ref]catfish[/ref][/m]',
    ].join('\n');

    const entries = renderDslBody('cat', body);

    expect(entries).toEqual([
      { partOfSpeech: '', definitions: [{ definition: '[kæt]', example: null }], sourceWord: 'cat' },
      {
        partOfSpeech: 'n',
        definitions: [
          { definition: '1) кошка', example: 'a black cat — чёрная кошка' },
          { definition: '2) кот', example: null },
        ],
        sourceWord: 'cat',
      },
      { partOfSpeech: 'v', definitions: [{ definition: 'поднимать якорь catfish', example: null }], sourceWord: 'cat' },
    ]);
  });

  it('drops media file names and returns nothing for an empty card', () => {
    expect(renderDslBody('x', '[s]x.wav[/s]')).toEqual([]);
  });

  it('caps very long cards', () => {
    const body = Array.from({ length: 100 }, (_, i) => `[m1]sense ${i}[/m]`).join('\n');
    const total = renderDslBody('w', body).reduce((n, e) => n + e.definitions.length, 0);
    expect(total).toBe(30);
  });
});
