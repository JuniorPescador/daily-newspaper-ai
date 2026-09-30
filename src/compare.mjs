import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL } from './curate.mjs';
import { canonicalUrl, stripHtml, truncate } from './text.mjs';

// Launch stories that get a comparison table per edition: each one is an extra request with web tools.
export const MAX_COMPARISONS = 2;
const MAX_MODELS = 4;
const MAX_ROWS = 6;
const MIN_ROWS = 2;
const MAX_CONTINUATIONS = 3;
const UNITS = ['%', 'usd', 'tokens', ''];
const BETTER = ['higher', 'lower'];

const SYSTEM_PROMPT = `You research AI model launches for "Diário da IA", a Brazilian Portuguese newspaper about artificial intelligence. You receive a story about a newly released model. Find the maker's official announcement (or model card), read it, and report how the new model compares with the rivals that page compares it against.

Research
- Start with web_fetch on the story's links. If they are news articles, use web_search to find the maker's own announcement, model card or docs, and fetch it.
- Report only numbers printed on a page you fetched in this conversation. Never use memory, estimates or numbers from other pages. When a model has no number for a row on that page, use null.

Report
- models: the new model first, then up to 3 rivals, preferring the ones the page itself compares against (the latest flagship models from other labs first). Use each model's short official name.
- rows: 2 to 6 of the best-known metrics the page reports for the new model and at least one rival: benchmark scores in percent, price per 1M input tokens and per 1M output tokens in US dollars, context window in tokens.
- label: in Brazilian Portuguese, keeping benchmark names as written (e.g. "SWE-bench Verified", "Preço de entrada (por 1M tokens)", "Janela de contexto").
- unit: "%" for scores from 0 to 100, "usd" for prices, "tokens" for context windows, "" for any other number. better: "lower" for prices, otherwise "higher".
- source_url: the fetched page the numbers come from. source_name: who published it (e.g. "Anthropic").
- Finish by calling report_comparison exactly once. If you cannot find at least two metrics with numbers, call it with an empty rows list.`;

const REPORT_TOOL = {
  name: 'report_comparison',
  description: 'Reports the comparison table for the new model. Call it exactly once, at the end of the research.',
  input_schema: {
    type: 'object',
    properties: {
      source_url: { type: 'string', description: 'URL of the fetched page the numbers come from.' },
      source_name: { type: 'string', description: 'Who published that page, e.g. "Anthropic".' },
      models: { type: 'array', items: { type: 'string' }, description: 'The new model first, then up to 3 rivals.' },
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            unit: { type: 'string', enum: UNITS },
            better: { type: 'string', enum: BETTER },
            values: {
              type: 'array',
              items: { type: ['number', 'null'] },
              description: 'One value per model, in the same order as models; null when the page has no number.',
            },
          },
          required: ['label', 'unit', 'better', 'values'],
        },
      },
    },
    required: ['source_url', 'source_name', 'models', 'rows'],
  },
};

export class ComparisonError extends Error {}

function clean(value, max) {
  return truncate(stripHtml(value ?? ''), max);
}

function webTools(model) {
  // The dynamic-filtering versions need Sonnet/Opus 4.6 or newer; Haiku 4.5 takes the basic ones.
  const basic = model.includes('haiku');
  return [
    { type: basic ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search', max_uses: 3 },
    { type: basic ? 'web_fetch_20250910' : 'web_fetch_20260209', name: 'web_fetch', max_uses: 3, max_content_tokens: 20000 },
  ];
}

function requestFor(model, messages) {
  const request = {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [...webTools(model), REPORT_TOOL],
    messages,
  };
  if (!model.includes('haiku')) {
    request.thinking = { type: 'adaptive' };
    request.output_config = { effort: 'medium' };
  }
  return request;
}

/** What the model reads about the story. Pure, so it can be tested. */
export function launchBrief(story) {
  const links = story.sources.map((source) => `- ${source.name}: ${source.url}`).join('\n');
  return [
    `New model: ${story.launch.model}${story.launch.maker ? ` (maker: ${story.launch.maker})` : ''}`,
    `Story: ${story.title}`,
    story.summary,
    `Links from the story:\n${links}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Pages web_fetch actually returned in this response (canonical URLs, requested and final). */
export function fetchedUrls(content) {
  const requested = new Map(
    content.filter((block) => block.type === 'server_tool_use' && block.name === 'web_fetch').map((block) => [block.id, block.input?.url]),
  );
  const urls = new Set();
  for (const block of content) {
    if (block.type !== 'web_fetch_tool_result' || block.content?.type !== 'web_fetch_result') continue;
    for (const url of [block.content.url, requested.get(block.tool_use_id)]) {
      const key = canonicalUrl(url);
      if (key) urls.add(key);
    }
  }
  return urls;
}

function cleanRow(row, total) {
  const label = clean(row?.label, 60);
  if (!label || !UNITS.includes(row.unit) || !BETTER.includes(row.better)) return null;
  if (!Array.isArray(row.values) || row.values.length !== total) return null;
  const values = row.values.slice(0, MAX_MODELS);
  const valid = values.every((value) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && (row.unit !== '%' || value <= 100)));
  if (!valid || values[0] === null) return null;
  return { label, unit: row.unit, better: row.better, values };
}

/**
 * Turns report_comparison input into the table the page renders, trusting nothing: the source must be
 * a page fetched in the same response, bad rows are dropped, and rivals without numbers are removed.
 * Throws ComparisonError when too little is left for a table.
 */
export function validateComparison(input, { fetched }) {
  const url = typeof input?.source_url === 'string' ? input.source_url.trim() : '';
  if (!fetched.has(canonicalUrl(url))) throw new ComparisonError('the source is not a page fetched in this run');

  const names = Array.isArray(input.models) ? input.models.map((name) => clean(name, 40)) : [];
  if (names.length < 2 || names.some((name) => !name)) throw new ComparisonError('needs the new model and at least one rival');

  const rows = (Array.isArray(input.rows) ? input.rows : [])
    .map((row) => cleanRow(row, names.length))
    .filter(Boolean)
    .slice(0, MAX_ROWS);
  const columns = names.slice(0, MAX_MODELS).map((_, i) => i).filter((i) => i === 0 || rows.some((row) => row.values[i] !== null));
  const table = rows
    .map((row) => ({ ...row, values: columns.map((i) => row.values[i]) }))
    .filter((row) => row.values.slice(1).some((value) => value !== null));
  if (columns.length < 2 || table.length < MIN_ROWS) throw new ComparisonError(`only ${table.length} usable rows`);

  return {
    models: columns.map((i) => names[i]),
    rows: table,
    source: { name: clean(input.source_name, 40) || new URL(url).hostname.replace(/^www\./, ''), url },
  };
}

/**
 * Researches one launch story. Returns the comparison, or null with the reason when the model
 * found nothing usable; API errors are thrown.
 */
export async function compareLaunch({ story, model = DEFAULT_MODEL, client = new Anthropic() }) {
  const messages = [{ role: 'user', content: launchBrief(story) }];
  const content = [];
  const usage = { input_tokens: 0, output_tokens: 0, web_search_requests: 0, web_fetch_requests: 0 };

  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn += 1) {
    const message = await client.messages.stream(requestFor(model, messages)).finalMessage();
    usage.input_tokens += message.usage.input_tokens;
    usage.output_tokens += message.usage.output_tokens;
    usage.web_search_requests += message.usage.server_tool_use?.web_search_requests ?? 0;
    usage.web_fetch_requests += message.usage.server_tool_use?.web_fetch_requests ?? 0;
    content.push(...message.content);

    // The server-side tool loop hit its iteration limit: send the turn back and it resumes.
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }
    const report = message.content.find((block) => block.type === 'tool_use' && block.name === REPORT_TOOL.name);
    if (!report) return { comparison: null, reason: `no report (stop_reason: ${message.stop_reason})`, usage };
    try {
      return { comparison: validateComparison(report.input, { fetched: fetchedUrls(content) }), reason: null, usage };
    } catch (error) {
      if (!(error instanceof ComparisonError)) throw error;
      return { comparison: null, reason: error.message, usage };
    }
  }
  return { comparison: null, reason: `still paused after ${MAX_CONTINUATIONS} continuations`, usage };
}

/**
 * Adds a comparison to the first launch stories of an edition. A failure only costs that story its
 * table: the launch highlight stays and the edition goes out. Returns the tokens and tool calls spent.
 */
export async function addComparisons(edition, { model = DEFAULT_MODEL, client = new Anthropic(), limit = MAX_COMPARISONS, log = console } = {}) {
  const usage = { input_tokens: 0, output_tokens: 0, web_search_requests: 0, web_fetch_requests: 0 };
  for (const story of edition.stories.filter((entry) => entry.launch).slice(0, limit)) {
    try {
      const result = await compareLaunch({ story, model, client });
      for (const key of Object.keys(usage)) usage[key] += result.usage[key];
      if (result.comparison) {
        story.launch.comparison = result.comparison;
        log.log(`Comparativo de ${story.launch.model}: ${result.comparison.models.length} modelos, ${result.comparison.rows.length} linhas (${result.comparison.source.name}).`);
      } else {
        log.warn(`Comparativo de ${story.launch.model}: sem tabela (${result.reason}).`);
      }
    } catch (error) {
      log.warn(`Comparativo de ${story.launch.model} falhou (${error?.message ?? error}). O card sai sem tabela.`);
    }
  }
  return usage;
}
