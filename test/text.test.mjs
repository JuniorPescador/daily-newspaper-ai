import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalUrl, isAiRelated, safeUrl, stripHtml, titleSimilarity, truncate } from '../src/text.mjs';

test('stripHtml removes tags and decodes entities', () => {
  assert.equal(stripHtml('<p>OpenAI &amp; Microsoft&#8217;s <b>deal</b></p>'), 'OpenAI & Microsoft’s deal');
  assert.equal(stripHtml('<script>alert(1)</script>ok'), 'ok');
  assert.equal(stripHtml(null), '');
});

test('truncate cuts on a word boundary and adds an ellipsis', () => {
  assert.equal(truncate('short', 10), 'short');
  assert.equal(truncate('one two three four five', 16), 'one two three…');
});

test('canonicalUrl drops tracking, www, hash and trailing slash', () => {
  assert.equal(
    canonicalUrl('http://www.Example.com/story/?utm_source=rss&id=7#comments'),
    'https://example.com/story?id=7',
  );
  assert.equal(canonicalUrl('javascript:alert(1)'), null);
  assert.equal(canonicalUrl('not a url'), null);
});

test('safeUrl keeps only http(s) links', () => {
  assert.equal(safeUrl('https://a.com/x?y=1'), 'https://a.com/x?y=1');
  assert.equal(safeUrl('data:text/html,hi'), null);
});

test('titleSimilarity spots the same headline across outlets', () => {
  assert.ok(titleSimilarity('OpenAI launches GPT-6 for developers', 'OpenAI launches GPT-6 for all developers') >= 0.8);
  assert.ok(titleSimilarity('Nvidia earnings beat estimates', 'Apple unveils new iPhone') < 0.2);
});

test('isAiRelated treats short acronyms as case-sensitive', () => {
  assert.ok(isAiRelated('Nova lei de IA avança no Senado'));
  assert.ok(isAiRelated('Startup raises $50M for AI agents'));
  assert.ok(isAiRelated('Inteligência artificial chega às escolas'));
  assert.equal(isAiRelated('Ele ia ao mercado quando choveu'), false);
  assert.equal(isAiRelated('Bolsa fecha em alta com bancos'), false);
});
