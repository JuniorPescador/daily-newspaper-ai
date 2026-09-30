import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCandidates } from '../src/curate.mjs';
import { assembleEdition, buildStories, sourceUrlsOf } from '../src/edition.mjs';
import { categorize, fallbackCuration } from '../src/fallback.mjs';
import { canonicalUrl } from '../src/text.mjs';
import { editionSlot, nextRunAt } from '../src/time.mjs';

const now = new Date('2026-09-25T15:30:00Z'); // 12:30 in São Paulo

function candidate(id, overrides = {}) {
  return {
    id,
    title: `Title ${id}`,
    url: `https://news.com/${id}`,
    publishedAt: new Date('2026-09-25T12:00:00Z'),
    snippet: `Snippet ${id}`,
    sourceId: 'news',
    sourceName: 'News',
    kind: 'news',
    weight: 2,
    ...overrides,
  };
}

const candidates = [candidate('c1'), candidate('c2'), candidate('c3', { related: [{ name: 'Other', url: 'https://other.com/c3', title: 'Other c3', publishedAt: new Date('2026-09-25T13:00:00Z') }] }), candidate('c4')];

test('buildStories drops invented ids, reuses nothing and takes links only from candidates', () => {
  const raw = {
    stories: [
      { category: 'novidades', title: 'Lead', summary: 'S', why_it_matters: 'W', tags: ['a'], importance: 5, source_ids: ['c1', 'c99'] },
      { category: 'mercado', title: 'Invented', summary: 'S', why_it_matters: '', tags: [], importance: 3, source_ids: ['c42'] },
      { category: 'achados', title: 'Reuse', summary: 'S', why_it_matters: '', tags: [], importance: 3, source_ids: ['c1'] },
      { category: 'politica', title: 'Bad category', summary: 'S', why_it_matters: '', tags: [], importance: 3, source_ids: ['c2'] },
      { category: 'mercado', title: '<b>Merged</b>', summary: 'S', why_it_matters: '', tags: [], importance: 9, source_ids: ['c3', 'c4'] },
    ],
  };
  const stories = buildStories(raw, candidates, new Set([canonicalUrl('https://news.com/c4')]));
  assert.deepEqual(
    stories.map((story) => story.title),
    ['Lead', 'Merged'],
  );
  assert.deepEqual(
    stories[0].sources.map((source) => source.url),
    ['https://news.com/c1'],
  );
  assert.deepEqual(
    stories[1].sources.map((source) => source.name),
    ['News', 'Other', 'News'],
  );
  assert.equal(stories[1].importance, 5);
  assert.equal(stories[1].publishedAt, '2026-09-25T13:00:00.000Z');
  assert.equal(stories[0].isNew, true);
  assert.equal(stories[1].isNew, false, 'shares a source with the previous edition');
});

test('buildStories marks model launches only when the curator names a model', () => {
  const raw = {
    stories: [
      { category: 'novidades', title: 'Launch', summary: 'S', why_it_matters: '', tags: [], importance: 5, launch_model: ' Claude Opus 5.5 ', launch_maker: 'Anthropic', source_ids: ['c1'] },
      { category: 'novidades', title: 'Open model', summary: 'S', why_it_matters: '', tags: [], importance: 4, launch_model: 'Nova-1', launch_maker: '', source_ids: ['c2'] },
      { category: 'mercado', title: 'Deal', summary: 'S', why_it_matters: '', tags: [], importance: 3, launch_model: '', launch_maker: '', source_ids: ['c3'] },
      { category: 'achados', title: 'Older output', summary: 'S', why_it_matters: '', tags: [], importance: 3, source_ids: ['c4'] },
    ],
  };
  const [launch, unknown, deal, older] = buildStories(raw, candidates);
  assert.deepEqual(launch.launch, { model: 'Claude Opus 5.5', maker: 'Anthropic', ai: 'claude' });
  assert.deepEqual(unknown.launch, { model: 'Nova-1', maker: '', ai: null });
  assert.equal(deal.launch, undefined);
  assert.equal(older.launch, undefined);
});

test('assembleEdition numbers editions and keeps the number when re-run in the same slot', () => {
  const raw = fallbackCuration(candidates, { now });
  const base = { raw, candidates, now, previousUrls: new Set(), curation: { curated: false }, report: [{ name: 'News', ok: true, count: 4 }] };
  const fresh = assembleEdition({ ...base, lastNumber: 7, lastId: '2026-09-25-06h' });
  assert.equal(fresh.id, '2026-09-25-12h');
  assert.equal(fresh.number, 8);
  assert.equal(fresh.label, 'Edição da tarde');
  assert.equal(fresh.nextUpdateAt, '2026-09-26T08:17:00.000Z');
  const rerun = assembleEdition({ ...base, lastNumber: 8, lastId: '2026-09-25-12h' });
  assert.equal(rerun.number, 8);
  assert.deepEqual([...sourceUrlsOf(fresh)].length, 5);
});

test('assembleEdition keeps trend labels up to 60 characters', () => {
  const label = 'Anthropic sob pressão regulatória e judicial';
  const raw = { ...fallbackCuration(candidates, { now }), trends: [{ label, note: 'n' }] };
  const edition = assembleEdition({ raw, candidates, now, previousUrls: new Set(), curation: { curated: true }, report: [] });
  assert.equal(edition.trends[0].label, label);
});

test('assembleEdition refuses an edition with too few valid stories', () => {
  assert.throws(
    () =>
      assembleEdition({ raw: { stories: [] }, candidates, now, previousUrls: new Set(), curation: { curated: true }, report: [] }),
    /valid stories/,
  );
});

test('fallback categorizes by source kind and keywords', () => {
  assert.equal(categorize(candidate('x', { kind: 'research' })), 'achados');
  assert.equal(categorize(candidate('x', { title: 'Startup raises $40M Series B for agents' })), 'mercado');
  assert.equal(categorize(candidate('x', { title: 'New study finds models memorize benchmarks' })), 'achados');
  assert.equal(categorize(candidate('x', { title: 'Google ships Gemini to Chrome' })), 'novidades');
});

test('formatCandidates marks items already published', () => {
  const text = formatCandidates(candidates.slice(0, 2), {
    now,
    previousUrls: new Set(['https://news.com/c2']),
    canonical: canonicalUrl,
  });
  assert.match(text, /\[c1\] News · news · 4h ago\nTitle: Title c1/);
  assert.match(text, /\[c2\].*\[already published\]/);
  assert.doesNotMatch(text.split('\n\n')[0], /already published/);
});

test('edition slots follow São Paulo time', () => {
  assert.deepEqual(editionSlot(new Date('2026-09-25T02:59:00Z')), { id: '2026-09-24-18h', key: 'noite', label: 'Edição da noite' });
  assert.deepEqual(editionSlot(new Date('2026-09-25T03:17:00Z')), { id: '2026-09-25-00h', key: 'madrugada', label: 'Edição da madrugada' });
  assert.equal(editionSlot(new Date('2026-09-25T09:20:00Z')).key, 'manha');
  assert.deepEqual(editionSlot(new Date('2026-09-25T08:17:00Z')), { id: '2026-09-25-05h', key: 'manha', label: 'Edição da manhã' });
  assert.equal(editionSlot(new Date('2026-09-25T07:59:00Z')).key, 'madrugada');
});

test('nextRunAt follows the workflow cron and rolls over midnight UTC', () => {
  assert.equal(nextRunAt(new Date('2026-09-25T08:00:00Z')).toISOString(), '2026-09-25T08:17:00.000Z');
  assert.equal(nextRunAt(new Date('2026-09-25T08:17:00Z')).toISOString(), '2026-09-26T08:17:00.000Z');
  assert.equal(nextRunAt(new Date('2026-09-25T22:00:00Z')).toISOString(), '2026-09-26T08:17:00.000Z');
});
