import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CurationError, curateWithClaude } from '../src/curate.mjs';

const candidates = [
  { id: 'c1', title: 'A', url: 'https://a.com/1', publishedAt: new Date('2026-09-25T10:00:00Z'), snippet: 's', sourceName: 'A', kind: 'news' },
];
const now = new Date('2026-09-25T12:00:00Z');

function stubClient(message) {
  const calls = [];
  const stream = (kind) => (request) => {
    calls.push({ kind, request });
    return { finalMessage: async () => message };
  };
  return { calls, beta: { messages: { stream: stream('beta') } }, messages: { stream: stream('ga') } };
}

const ok = {
  model: 'claude-opus-5',
  stop_reason: 'end_turn',
  usage: { input_tokens: 1200, output_tokens: 800 },
  content: [
    { type: 'thinking', thinking: '' },
    { type: 'text', text: '{"editorial":"E","trends":[],"stories":[]}' },
  ],
};

test('Opus 5 requests use structured output, adaptive thinking and server-side fallbacks', async () => {
  const client = stubClient(ok);
  const result = await curateWithClaude({ candidates, now, model: 'claude-opus-5', client });
  const [{ kind, request }] = client.calls;
  assert.equal(kind, 'beta');
  assert.deepEqual(request.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(request.fallbacks, 'default');
  assert.deepEqual(request.thinking, { type: 'adaptive' });
  assert.equal(request.output_config.format.type, 'json_schema');
  assert.match(request.messages[0].content, /\[c1\] A · news · 2h ago/);
  assert.deepEqual(result.raw, { editorial: 'E', trends: [], stories: [] });
  assert.deepEqual(result.usage, { input_tokens: 1200, output_tokens: 800 });
});

test('every story must say whether it is a model launch', async () => {
  const client = stubClient(ok);
  await curateWithClaude({ candidates, now, client });
  const { request } = client.calls[0];
  const story = request.output_config.format.schema.properties.stories.items;
  assert.ok(story.required.includes('launch_model'));
  assert.ok(story.required.includes('launch_maker'));
  assert.match(request.system, /launch_model:/);
});

test('the default model is Sonnet 5 on the regular endpoint', async () => {
  const client = stubClient({ ...ok, model: 'claude-sonnet-5' });
  const result = await curateWithClaude({ candidates, now, client });
  assert.equal(client.calls[0].kind, 'ga');
  assert.equal(client.calls[0].request.model, 'claude-sonnet-5');
  assert.deepEqual(client.calls[0].request.thinking, { type: 'adaptive' });
  assert.equal(result.model, 'claude-sonnet-5');
});

test('other models skip the fallback beta; Haiku skips thinking and effort', async () => {
  const sonnet = stubClient(ok);
  await curateWithClaude({ candidates, now, model: 'claude-sonnet-5', client: sonnet });
  assert.equal(sonnet.calls[0].kind, 'ga');
  assert.equal(sonnet.calls[0].request.fallbacks, undefined);
  assert.equal(sonnet.calls[0].request.output_config.effort, 'medium');

  const haiku = stubClient(ok);
  await curateWithClaude({ candidates, now, model: 'claude-haiku-4-5', client: haiku });
  assert.equal(haiku.calls[0].request.thinking, undefined);
  assert.equal(haiku.calls[0].request.output_config.effort, undefined);
});

test('refusals, truncation and invalid JSON become CurationError', async () => {
  const cases = [
    { ...ok, stop_reason: 'refusal', stop_details: { category: 'cyber' } },
    { ...ok, stop_reason: 'max_tokens' },
    { ...ok, content: [{ type: 'text', text: 'not json' }] },
  ];
  for (const message of cases) {
    await assert.rejects(curateWithClaude({ candidates, now, client: stubClient(message) }), CurationError);
  }
});
