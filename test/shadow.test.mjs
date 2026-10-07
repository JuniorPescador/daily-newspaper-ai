import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { curateNiche, curateWithClaude, nicheSchema, nicheSystemPrompt } from '../src/curate.mjs';
import { assembleEdition } from '../src/edition.mjs';
import { formatShadow, formatShadowList, listShadow, readShadow, saveShadow } from '../src/shadow.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marketing = JSON.parse(await readFile(path.join(root, 'niches', 'marketing.json'), 'utf8'));
const now = new Date('2026-10-08T08:00:00Z');
const candidates = ['c1', 'c2', 'c3', 'c4'].map((id, index) => ({
  id,
  title: `Notícia ${id}`,
  url: `https://example.com/${id}`,
  publishedAt: new Date('2026-10-08T06:00:00Z'),
  snippet: 's',
  sourceName: index % 2 ? 'PPC Land' : 'Meio & Mensagem',
  kind: 'news',
}));

function stubClient(raw) {
  const calls = [];
  const stream = (request) => {
    calls.push(request);
    return { finalMessage: async () => ({ model: 'claude-sonnet-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: JSON.stringify(raw) }] }) };
  };
  return { calls, messages: { stream }, beta: { messages: { stream } } };
}

const empty = { editorial: '', highlights: [], trends: [], stories: [] };

test('the marketing config names its sources and three categories', () => {
  assert.deepEqual(Object.keys(marketing.categories), ['plataformas', 'mercado', 'ia']);
  assert.ok(marketing.sources.length >= 20);
  assert.equal(new Set(marketing.sources.map((source) => source.id)).size, marketing.sources.length);
});

test('a section prompt carries its reader, categories and the no-padding rule', () => {
  const prompt = nicheSystemPrompt(marketing);
  assert.match(prompt, /editor of the Marketing section of "Jornal Presenza"/);
  assert.match(prompt, /- "plataformas": changes to ad platforms/);
  assert.match(prompt, /Never pad the edition/);
  assert.doesNotMatch(prompt, /launch_model/);
});

test('a section schema takes its categories and drops the launch fields, leaving the AI schema alone', async () => {
  const story = nicheSchema(marketing).properties.stories.items;
  assert.deepEqual(story.properties.category.enum, ['plataformas', 'mercado', 'ia']);
  assert.equal(story.properties.launch_model, undefined);
  assert.ok(!story.required.includes('launch_model'));

  const client = stubClient(empty);
  await curateWithClaude({ candidates, now, client });
  const aiStory = client.calls[0].output_config.format.schema.properties.stories.items;
  assert.deepEqual(aiStory.properties.category.enum, ['novidades', 'mercado', 'achados']);
  assert.ok(aiStory.required.includes('launch_model'));
});

test('curateNiche sends the section prompt and schema', async () => {
  const client = stubClient(empty);
  const result = await curateNiche({ niche: marketing, candidates, now, client });
  assert.deepEqual(result.raw, empty);
  assert.equal(client.calls[0].system, nicheSystemPrompt(marketing));
  assert.deepEqual(client.calls[0].output_config.format.schema.properties.stories.items.properties.category.enum, ['plataformas', 'mercado', 'ia']);
});

test('assembleEdition keeps only the section categories it is given', () => {
  const raw = {
    ...empty,
    stories: [
      { category: 'plataformas', format: 'full', title: 'Meta muda o Advantage+', summary: 'S', why_it_matters: 'W', tags: [], importance: 4, source_ids: ['c1'] },
      { category: 'ia', format: 'full', title: 'Google leva anúncios ao AI Mode', summary: 'S', why_it_matters: 'W', tags: [], importance: 4, source_ids: ['c2'] },
      { category: 'novidades', format: 'brief', title: 'Fora das categorias', summary: '', why_it_matters: '', tags: [], importance: 2, source_ids: ['c3'] },
      { category: 'mercado', format: 'brief', title: 'Agência ganha conta', summary: '', why_it_matters: '', tags: [], importance: 2, source_ids: ['c4'] },
    ],
  };
  const edition = assembleEdition({ raw, candidates, now, previousUrls: new Set(), curation: { curated: true }, report: [], categories: Object.keys(marketing.categories) });
  assert.deepEqual(edition.stories.map((story) => story.category), ['plataformas', 'ia', 'mercado']);
  assert.equal(edition.stories[0].launch, undefined);
});

test('shadow editions are stored privately, newest first, and pruned after a month', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'shadow-'));
  // 33 days: September 1 to October 3.
  for (let day = 0; day < 33; day += 1) {
    const id = `${new Date(Date.UTC(2026, 8, 1 + day)).toISOString().slice(0, 10)}-05h`;
    await saveShadow(dataDir, 'marketing', { id, available: day, candidates: day, sources: [], edition: null });
  }
  const ids = await listShadow(dataDir, 'marketing');
  assert.equal(ids.length, 31);
  assert.equal(ids[0], '2026-10-03-05h');
  assert.equal(ids.at(-1), '2026-09-03-05h');
  assert.equal(await readShadow(dataDir, 'marketing', '2026-09-01-05h'), null);
  assert.equal(await readShadow(dataDir, 'marketing', '../../latest'), null);
  assert.equal((await readShadow(dataDir, 'marketing', ids[0])).available, 32);
});

test('the terminal report shows the stories by category, the quick list and each source', () => {
  const raw = {
    ...empty,
    editorial: 'Dia de mudanças no Meta.',
    stories: [
      { category: 'plataformas', format: 'full', title: 'Meta muda o Advantage+', summary: 'Resumo.', why_it_matters: 'Muda a compra.', tags: [], importance: 4, source_ids: ['c1'] },
      { category: 'ia', format: 'full', title: 'Google leva anúncios ao AI Mode', summary: 'Resumo 2.', why_it_matters: 'Novo inventário.', tags: [], importance: 4, source_ids: ['c2'] },
      { category: 'mercado', format: 'brief', title: 'Agência ganha conta', summary: '', why_it_matters: '', tags: [], importance: 2, source_ids: ['c4'] },
    ],
  };
  const edition = assembleEdition({ raw, candidates, now, previousUrls: new Set(), curation: { curated: true, model: 'claude-sonnet-5', usage: { input_tokens: 9000, output_tokens: 4000 } }, report: [], categories: Object.keys(marketing.categories) });
  const shadow = {
    id: edition.id,
    generatedAt: now.toISOString(),
    available: 288,
    candidates: 131,
    sources: [
      { name: 'Meio & Mensagem', ok: true, count: 14, available: 45, error: null },
      { name: 'B9', ok: false, count: 0, available: 0, error: 'HTTP 403' },
    ],
    edition,
  };
  const text = formatShadow(shadow, marketing);
  assert.match(text, /Marketing · edição sombra 2026-10-08-05h/);
  assert.match(text, /288 itens nas últimas 36 h, de 1 das 2 fontes; 131 candidatos/);
  assert.match(text, /3 notícias \(2 completas, 1 rápidas\)/);
  assert.match(text, /PLATAFORMAS\n• Meta muda o Advantage\+\n {2}Resumo\.\n {2}Por que importa: Muda a compra\./);
  assert.match(text, /IA NO MARKETING\n• Google leva anúncios ao AI Mode/);
  assert.match(text, /RÁPIDAS\n• \[Mercado\] Agência ganha conta — PPC Land/);
  assert.match(text, / {2}✓ Meio & Mensagem: 14 \/ 45\n {2}✗ B9: HTTP 403/);
  assert.match(formatShadowList([shadow, { ...shadow, id: '2026-10-07-05h', edition: null }]), /2026-10-08-05h {4}288 {9}131 {9}3 {10}2 {17}1\n2026-10-07-05h {4}288 {9}131 {9}- {10}- {17}1/);
});
