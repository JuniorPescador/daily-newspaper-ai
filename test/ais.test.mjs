import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectAis, storyText, summarizeAis } from '../src/ais.mjs';

test('detectAis finds products and makers', () => {
  assert.deepEqual(detectAis('OpenAI ships GPT-6 while Anthropic updates Claude'), ['chatgpt', 'claude']);
  assert.deepEqual(detectAis('DeepMind publica novo modelo Gemma'), ['gemini']);
  assert.deepEqual(detectAis("Meta's Llama 5 goes open weights"), ['llama']);
  assert.deepEqual(detectAis('xAI levanta US$ 20 bi para treinar o Grok'), ['grok']);
  assert.deepEqual(detectAis('Microsoft relança o Copilot'), ['copilot']);
  assert.deepEqual(detectAis('Databricks buys a Microsoft Excel competitor'), []);
});

test('detectAis avoids common false positives', () => {
  assert.deepEqual(detectAis('A meta da empresa é dobrar a receita'), []);
  assert.deepEqual(detectAis('apple pie recipe goes viral'), []);
  assert.deepEqual(detectAis('Bolsa fecha em alta'), []);
});

test('storyText includes original source headlines', () => {
  const story = { title: 'Nova rodada bilionária', summary: 'A empresa captou recursos.', sources: [{ title: 'Anthropic raises $30B' }] };
  assert.deepEqual(detectAis(storyText(story)), ['claude']);
});

test('summarizeAis counts stories per AI, most mentioned first', () => {
  const summary = summarizeAis([{ ais: ['claude'] }, { ais: ['chatgpt', 'claude'] }, { ais: ['chatgpt'] }, { ais: ['grok'] }, {}]);
  assert.deepEqual(
    summary.map((entry) => [entry.id, entry.count]),
    [
      ['chatgpt', 2],
      ['claude', 2],
      ['grok', 1],
    ],
  );
  assert.equal(summary[1].label, 'Claude');
  assert.equal(summary[1].maker, 'Anthropic');
  assert.equal(summary[1].logo, 'claude');
});

test('every AI with a logo has a vendored SVG', async () => {
  const { access } = await import('node:fs/promises');
  const { AIS } = await import('../src/ais.mjs');
  for (const ai of AIS.filter((entry) => entry.logo)) {
    await access(new URL(`../site/logos/${ai.logo}.svg`, import.meta.url));
  }
});
