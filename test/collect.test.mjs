import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dedupe, feedPageUrl, interleave, parseFeed, parseFeedDate, parseHfPapers, selectFromSource } from '../src/collect.mjs';

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[Anthropic signs &amp; ships]]></title>
    <link>https://example.com/a?utm_source=rss</link>
    <pubDate>Fri, 25 Sep 2026 10:00:00 GMT</pubDate>
    <description><![CDATA[<p>Big <b>news</b> today.</p>]]></description>
  </item>
  <item><title>No link</title></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title type="html">Gemini gets faster</title>
    <link rel="replies" href="https://example.org/comments"/>
    <link rel="alternate" href="https://example.org/gemini"/>
    <updated>2026-09-25T09:00:00Z</updated>
    <summary>Speed-ups everywhere.</summary>
  </entry>
</feed>`;

test('parseFeed reads RSS 2.0 and skips entries without a link', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Anthropic signs & ships');
  assert.equal(items[0].url, 'https://example.com/a?utm_source=rss');
  assert.equal(items[0].snippet, 'Big news today.');
  assert.equal(items[0].publishedAt.toISOString(), '2026-09-25T10:00:00.000Z');
});

test('parseFeed reads Atom and prefers the alternate link', () => {
  const [item] = parseFeed(ATOM);
  assert.equal(item.url, 'https://example.org/gemini');
  assert.equal(item.title, 'Gemini gets faster');
});

test('parseHfPapers sorts by upvotes and links to the paper page', () => {
  const body = JSON.stringify([
    { title: 'Low', publishedAt: '2026-09-24T00:00:00Z', paper: { id: '2609.1', upvotes: 2, summary: 'a' } },
    { title: 'High', publishedAt: '2026-09-24T00:00:00Z', paper: { id: '2609.2', upvotes: 90, ai_summary: 'b' } },
  ]);
  const papers = parseHfPapers(body);
  assert.deepEqual(
    papers.map((paper) => [paper.title, paper.url]),
    [
      ['High', 'https://huggingface.co/papers/2609.2'],
      ['Low', 'https://huggingface.co/papers/2609.1'],
    ],
  );
});

test('selectFromSource applies the window, promo filter, AI filter and cap', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  const at = (hoursAgo) => new Date(now - hoursAgo * 3_600_000);
  const items = [
    { title: 'AI startup raises $10M', url: 'https://x.com/1', publishedAt: at(1), snippet: '' },
    { title: 'Bolsa fecha em alta', url: 'https://x.com/2', publishedAt: at(2), snippet: '' },
    { title: 'Save up to $200 on AI Disrupt 2026 tickets', url: 'https://x.com/3', publishedAt: at(3), snippet: '' },
    { title: 'Old AI news', url: 'https://x.com/4', publishedAt: at(50), snippet: '' },
    { title: 'Undated AI news', url: 'https://x.com/5', publishedAt: null, snippet: '' },
  ];
  const source = { id: 's', name: 'S', kind: 'news', filter: 'ai', max: 5 };
  const picked = selectFromSource(items, source, now, 36);
  assert.deepEqual(
    picked.map((item) => item.title),
    ['AI startup raises $10M'],
  );
  assert.equal(picked[0].sourceName, 'S');
});

test('dedupe keeps the higher-weight copy and records the other as related', () => {
  const base = { snippet: '', publishedAt: new Date('2026-09-25T10:00:00Z') };
  const items = [
    { ...base, title: 'OpenAI launches GPT-6 for developers', url: 'https://blog.com/gpt6', sourceId: 'blog', sourceName: 'Blog', weight: 1 },
    { ...base, title: 'OpenAI launches GPT-6 for all developers', url: 'https://news.com/gpt6', sourceId: 'news', sourceName: 'News', weight: 2 },
    { ...base, title: 'Same link', url: 'https://news.com/gpt6?utm_source=x', sourceId: 'x', sourceName: 'X', weight: 1 },
  ];
  const kept = dedupe(items);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].sourceName, 'News');
  assert.deepEqual(
    kept[0].related.map((related) => related.name),
    ['Blog'],
  );
});

test('interleave alternates sources, heaviest first', () => {
  const item = (sourceId, weight, n) => ({ sourceId, weight, n });
  const order = interleave([item('a', 1, 1), item('a', 1, 2), item('b', 3, 1), item('b', 3, 2), item('c', 2, 1)]).map(
    (entry) => `${entry.sourceId}${entry.n}`,
  );
  assert.deepEqual(order, ['b1', 'c1', 'a1', 'b2', 'a2']);
});

test('parseFeedDate reads RFC 822 dates written in Portuguese', () => {
  assert.equal(parseFeedDate('ter, 06 out 2026 17:16:59 -0300').toISOString(), '2026-10-06T20:16:59.000Z');
  assert.equal(parseFeedDate('sáb, 05 dez 2026 08:00:00 +0000').toISOString(), '2026-12-05T08:00:00.000Z');
  assert.equal(parseFeedDate('Wed, 07 Oct 2026 07:50:32 +0200').toISOString(), '2026-10-07T05:50:32.000Z');
  assert.equal(parseFeedDate('2026-09-25T09:00:00Z').toISOString(), '2026-09-25T09:00:00.000Z');
  assert.equal(parseFeedDate('sem data'), null);
  assert.equal(parseFeedDate(''), null);
});

test('feedPageUrl asks WordPress for the next pages of a feed', () => {
  assert.equal(feedPageUrl('https://propmark.com.br/feed/', 1), 'https://propmark.com.br/feed/');
  assert.equal(feedPageUrl('https://propmark.com.br/feed/', 2), 'https://propmark.com.br/feed/?paged=2');
  assert.equal(feedPageUrl('https://example.com/feed?cat=3', 3), 'https://example.com/feed?cat=3&paged=3');
});

test('selectFromSource drops a post repeated across feed pages', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  const item = { title: 'Campanha nova', url: 'https://example.com/campanha', publishedAt: new Date('2026-10-07T10:00:00Z'), snippet: '' };
  const picked = selectFromSource([item, { ...item }], { id: 'x', name: 'X' }, now, 36);
  assert.equal(picked.length, 1);
});
