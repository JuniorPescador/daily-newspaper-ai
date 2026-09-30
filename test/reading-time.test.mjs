import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editionWords, readingMinutes } from '../site/reading-time.js';

const words = (count) => Array(count).fill('palavra').join(' ');

test('editionWords counts the editorial, the overview and every displayed story field', () => {
  const edition = {
    editorial: 'Um dia agitado.',
    highlights: [{ text: 'Linha um', storyId: 's1' }],
    stories: [
      { format: 'full', title: 'Título completo', summary: 'Resumo em três palavras', whyItMatters: 'Porque sim.' },
      { format: 'brief', title: 'Só o título', summary: '', whyItMatters: '' },
    ],
  };
  assert.equal(editionWords(edition), 3 + 2 + 2 + 4 + 2 + 3);
});

test('editionWords works on older editions without highlights or editorial', () => {
  assert.equal(editionWords({ stories: [{ title: 'Um dois', summary: 'três' }] }), 3);
  assert.equal(editionWords({}), 0);
});

test('readingMinutes rounds up at 200 words per minute, with a 1-minute floor', () => {
  assert.equal(readingMinutes({ stories: [] }), 1);
  assert.equal(readingMinutes({ stories: [{ title: words(200) }] }), 1);
  assert.equal(readingMinutes({ stories: [{ title: words(201) }] }), 2);
  assert.equal(readingMinutes({ stories: [{ title: words(900) }] }), 5);
});
