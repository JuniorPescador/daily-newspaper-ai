import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addComparisons, ComparisonError, compareLaunch, fetchedUrls, launchBrief, validateComparison } from '../src/compare.mjs';

const PAGE = 'https://www.anthropic.com/news/claude-opus-5-5';
const fetched = new Set(['https://anthropic.com/news/claude-opus-5-5']);

const report = {
  source_url: PAGE,
  source_name: 'Anthropic',
  models: ['Claude Opus 5.5', 'Claude Fable 5.1', 'GPT Astra'],
  rows: [
    { label: 'SWE-bench Verified', unit: '%', better: 'higher', values: [81.2, 84, 78.1] },
    { label: 'GPQA Diamond', unit: '%', better: 'higher', values: [88, 87.5, null] },
    { label: 'Preço de entrada (por 1M tokens)', unit: 'usd', better: 'lower', values: [4, 10, null] },
  ],
};

function story(overrides = {}) {
  return {
    title: 'Anthropic lança o Claude Opus 5.5',
    summary: 'Resumo.',
    sources: [{ name: 'TechCrunch', url: 'https://techcrunch.com/opus-5-5' }],
    launch: { model: 'Claude Opus 5.5', maker: 'Anthropic', ai: 'claude' },
    ...overrides,
  };
}

function fetchBlocks(url = PAGE) {
  return [
    { type: 'server_tool_use', id: 'f1', name: 'web_fetch', input: { url } },
    { type: 'web_fetch_tool_result', tool_use_id: 'f1', content: { type: 'web_fetch_result', url, content: { type: 'document' } } },
  ];
}

function message(content, overrides = {}) {
  return { stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 50, server_tool_use: { web_search_requests: 1, web_fetch_requests: 1 } }, content, ...overrides };
}

function stubClient(...messages) {
  const calls = [];
  return {
    calls,
    messages: {
      stream: (request) => {
        calls.push(structuredClone(request));
        const next = messages[Math.min(calls.length - 1, messages.length - 1)];
        return { finalMessage: async () => (next instanceof Error ? Promise.reject(next) : next) };
      },
    },
  };
}

const reportCall = (input = report) => ({ type: 'tool_use', id: 't1', name: 'report_comparison', input });

test('validateComparison keeps a well-formed table and drops rivals without numbers', () => {
  const table = validateComparison(report, { fetched });
  assert.deepEqual(table.models, ['Claude Opus 5.5', 'Claude Fable 5.1', 'GPT Astra']);
  assert.equal(table.rows.length, 3);
  assert.deepEqual(table.source, { name: 'Anthropic', url: PAGE });

  const noAstra = { ...report, rows: report.rows.map((row) => ({ ...row, values: [...row.values.slice(0, 2), null] })) };
  const trimmed = validateComparison(noAstra, { fetched });
  assert.deepEqual(trimmed.models, ['Claude Opus 5.5', 'Claude Fable 5.1']);
  assert.deepEqual(trimmed.rows[0].values, [81.2, 84]);
});

test('validateComparison drops malformed rows', () => {
  const rows = [
    ...report.rows.slice(0, 2),
    { label: 'Over 100', unit: '%', better: 'higher', values: [120, 80, 70] },
    { label: 'Negative', unit: 'usd', better: 'lower', values: [-1, 2, 3] },
    { label: 'Short', unit: '%', better: 'higher', values: [80, 70] },
    { label: 'No new model', unit: '%', better: 'higher', values: [null, 70, 60] },
    { label: 'Rivals missing', unit: '%', better: 'higher', values: [50, null, null] },
    { label: 'Bad unit', unit: 'points', better: 'higher', values: [1, 2, 3] },
    { label: 'Text', unit: '', better: 'higher', values: ['1M', 2, 3] },
  ];
  const table = validateComparison({ ...report, rows }, { fetched });
  assert.deepEqual(
    table.rows.map((row) => row.label),
    ['SWE-bench Verified', 'GPQA Diamond'],
  );
});

test('validateComparison refuses unread sources and thin tables', () => {
  assert.throws(() => validateComparison({ ...report, source_url: 'https://invented.example/x' }, { fetched }), ComparisonError);
  assert.throws(() => validateComparison({ ...report, source_url: 'javascript:alert(1)' }, { fetched }), ComparisonError);
  assert.throws(() => validateComparison({ ...report, models: ['Claude Opus 5.5'] }, { fetched }), ComparisonError);
  assert.throws(() => validateComparison({ ...report, rows: report.rows.slice(0, 1) }, { fetched }), /only 1 usable rows/);
  assert.throws(() => validateComparison({ ...report, rows: [] }, { fetched }), ComparisonError);
  assert.throws(() => validateComparison(null, { fetched }), ComparisonError);
});

test('validateComparison caps models at 4 and rows at 6', () => {
  const models = ['New', 'R1', 'R2', 'R3', 'R4', 'R5'];
  const rows = Array.from({ length: 9 }, (_, i) => ({ label: `B${i}`, unit: '%', better: 'higher', values: [50, 40, 30, 20, 10, 5] }));
  const table = validateComparison({ ...report, models, rows }, { fetched });
  assert.deepEqual(table.models, ['New', 'R1', 'R2', 'R3']);
  assert.equal(table.rows.length, 6);
  assert.deepEqual(table.rows[0].values, [50, 40, 30, 20]);
});

test('fetchedUrls takes successful fetches only, by requested and final URL', () => {
  const content = [
    ...fetchBlocks('https://anthropic.com/opus?utm_source=x'),
    { type: 'server_tool_use', id: 'f2', name: 'web_fetch', input: { url: 'https://blocked.example/' } },
    { type: 'web_fetch_tool_result', tool_use_id: 'f2', content: { type: 'web_fetch_tool_result_error', error_code: 'url_not_accessible' } },
    { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://search.example/' }] },
  ];
  assert.deepEqual([...fetchedUrls(content)], ['https://anthropic.com/opus']);
});

test('launchBrief names the model and lists the story links', () => {
  const brief = launchBrief(story());
  assert.match(brief, /New model: Claude Opus 5\.5 \(maker: Anthropic\)/);
  assert.match(brief, /- TechCrunch: https:\/\/techcrunch\.com\/opus-5-5/);
});

test('compareLaunch sends web tools plus the report tool and validates the report', async () => {
  const client = stubClient(message([...fetchBlocks(), reportCall()]));
  const result = await compareLaunch({ story: story(), model: 'claude-sonnet-5', client });
  const [request] = client.calls;
  assert.deepEqual(
    request.tools.map((tool) => tool.type ?? tool.name),
    ['web_search_20260209', 'web_fetch_20260209', 'report_comparison'],
  );
  assert.equal(request.tool_choice, undefined, 'forced tool use is rejected by some models');
  assert.deepEqual(request.thinking, { type: 'adaptive' });
  assert.equal(result.comparison.rows.length, 3);
  assert.deepEqual(result.usage, { input_tokens: 100, output_tokens: 50, web_search_requests: 1, web_fetch_requests: 1 });
});

test('compareLaunch uses the basic web tools and no thinking on Haiku', async () => {
  const client = stubClient(message([...fetchBlocks(), reportCall()]));
  await compareLaunch({ story: story(), model: 'claude-haiku-4-5', client });
  assert.deepEqual(
    client.calls[0].tools.slice(0, 2).map((tool) => tool.type),
    ['web_search_20250305', 'web_fetch_20250910'],
  );
  assert.equal(client.calls[0].thinking, undefined);
});

test('compareLaunch resumes a paused turn and reads fetches from every turn', async () => {
  const paused = message(fetchBlocks(), { stop_reason: 'pause_turn' });
  const client = stubClient(paused, message([reportCall()]));
  const result = await compareLaunch({ story: story(), client });
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[1].messages.at(-1).role, 'assistant');
  assert.ok(result.comparison, 'the page fetched before the pause counts');
  assert.equal(result.usage.input_tokens, 200);
});

test('compareLaunch returns the reason when there is nothing to show', async () => {
  const noReport = await compareLaunch({ story: story(), client: stubClient(message([{ type: 'text', text: 'Nada.' }], { stop_reason: 'end_turn' })) });
  assert.equal(noReport.comparison, null);
  assert.match(noReport.reason, /end_turn/);

  const unread = await compareLaunch({ story: story(), client: stubClient(message([reportCall()])) });
  assert.equal(unread.comparison, null);
  assert.match(unread.reason, /not a page fetched/);

  const paused = message([], { stop_reason: 'pause_turn' });
  const stuck = await compareLaunch({ story: story(), client: stubClient(paused) });
  assert.match(stuck.reason, /still paused/);
});

test('addComparisons covers the first launches only and survives failures', async () => {
  const edition = {
    stories: [
      story(),
      story({ launch: { model: 'GPT Astra', maker: 'OpenAI', ai: 'chatgpt' } }),
      { title: 'Not a launch', sources: [] },
      story({ launch: { model: 'Gemini 4', maker: 'Google', ai: 'gemini' } }),
    ],
  };
  const client = stubClient(message([...fetchBlocks(), reportCall()]), new Error('boom'));
  const logs = [];
  const log = { log: (line) => logs.push(line), warn: (line) => logs.push(line) };
  const usage = await addComparisons(edition, { client, log });
  assert.equal(client.calls.length, 2);
  assert.ok(edition.stories[0].launch.comparison);
  assert.equal(edition.stories[1].launch.comparison, undefined);
  assert.equal(edition.stories[3].launch.comparison, undefined);
  assert.equal(usage.input_tokens, 100);
  assert.match(logs[1], /GPT Astra falhou \(boom\)/);
});
