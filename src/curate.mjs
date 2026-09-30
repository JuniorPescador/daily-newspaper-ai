import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-sonnet-5';
export const CATEGORIES = ['novidades', 'mercado', 'achados'];
// "full" stories get a card with summary; "brief" ones are a single line in the "Rápidas" list.
export const FORMATS = ['full', 'brief'];

// Models that accept the server-side `fallbacks: "default"` retry on a safety refusal.
const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1']);

const SYSTEM_PROMPT = `You are the editor of "Diário da IA", a Brazilian Portuguese newspaper about artificial intelligence published four times a day. You receive a numbered list of candidate items collected from RSS feeds over the last ~36 hours. Build this edition from them.

Selection
- Pick the 14-22 most relevant stories for a technical, business-minded Brazilian reader: new models and products, significant releases, research with real impact, funding, deals, earnings and other market moves, regulation and policy, and notable industry shifts.
- Skip tutorials, promotional posts, minor updates, listicles and opinion pieces that carry no news.
- When several items cover the same event, merge them into one story and list every id in source_ids.
- Items marked [already published] appeared in the previous edition. Keep one only if it is still among the most important stories of the day; otherwise prefer fresh items.
- Aim for a balanced edition with at least 3 stories per category when the candidates allow it.

Categories
- "novidades": launches, models, products, features, policy and regulation news.
- "mercado": funding, M&A, earnings, valuations, chips and infrastructure business, company adoption, hiring and layoffs.
- "achados": research papers, benchmarks, studies, technical discoveries and insightful analyses.

Format
- Mark the 6-8 most important stories as "full", always including the lead. They get the complete write-up below.
- Mark every other story as "brief": it appears as a single line in a quick list. Write only its title and leave summary and why_it_matters as empty strings.

Accuracy
- Use only ids that appear in the list.
- Rely only on the candidate titles and snippets. Never add facts, numbers or claims they do not contain; if a detail is uncertain, leave it out.

Writing (Brazilian Portuguese, clear and direct, no hype, no emojis; keep company, product and model names as they are)
- title: informative headline, up to about 90 characters, no clickbait. A brief story's title must carry the key fact on its own.
- summary (full stories): 2-3 sentences with the key facts (who, what, figures when given).
- why_it_matters (full stories): one sentence on the impact for the reader.
- tags: 1-3 short tags (companies or themes).
- importance: integer from 1 (minor) to 5 (major).

List the full stories first, then the brief ones, each group from most to least important; the first story is the lead of the edition.
editorial: one or two sentences that open the edition and capture the tone of the day.
trends: 3-5 themes that show up across several stories right now (label: 2-4 words; note: one short sentence).`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    editorial: { type: 'string' },
    trends: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, note: { type: 'string' } },
        required: ['label', 'note'],
        additionalProperties: false,
      },
    },
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: CATEGORIES },
          format: { type: 'string', enum: FORMATS },
          title: { type: 'string' },
          summary: { type: 'string' },
          why_it_matters: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          importance: { type: 'integer' },
          source_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['category', 'format', 'title', 'summary', 'why_it_matters', 'tags', 'importance', 'source_ids'],
        additionalProperties: false,
      },
    },
  },
  required: ['editorial', 'trends', 'stories'],
  additionalProperties: false,
};

export class CurationError extends Error {}

function ageLabel(date, now) {
  const hours = Math.max(0, Math.round((now - date) / 3_600_000));
  return hours < 1 ? '<1h ago' : `${hours}h ago`;
}

/** Renders the candidate list the model reads. Pure, so it can be tested. */
export function formatCandidates(candidates, { now, previousUrls = new Set(), canonical = (url) => url }) {
  return candidates
    .map((item) => {
      const flags = [item.sourceName, item.kind, ageLabel(item.publishedAt, now)];
      if (item.upvotes) flags.push(`${item.upvotes} upvotes`);
      if (item.related?.length) flags.push(`also covered by ${item.related.map((r) => r.name).join(', ')}`);
      if (previousUrls.has(canonical(item.url))) flags.push('[already published]');
      const lines = [`[${item.id}] ${flags.join(' · ')}`, `Title: ${item.title}`];
      if (item.snippet) lines.push(`Snippet: ${item.snippet}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

function requestFor({ model, system, content, schema, effort, maxTokens }) {
  const request = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema } },
  };
  // Haiku 4.5 predates adaptive thinking and effort; every newer model takes both.
  if (!model.includes('haiku')) {
    request.thinking = { type: 'adaptive' };
    request.output_config.effort = effort;
  }
  return request;
}

/**
 * Sends one structured-output request and returns the parsed JSON plus usage.
 * Refusals, truncated output and invalid JSON throw CurationError.
 */
export async function requestJson({ client, model, system, content, schema, effort = 'medium', maxTokens = 32000 }) {
  const request = requestFor({ model, system, content, schema, effort, maxTokens });

  const stream = SERVER_FALLBACK_MODELS.has(model)
    ? client.beta.messages.stream({ ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : client.messages.stream(request);
  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new CurationError(`model refused (${message.stop_details?.category ?? 'no category'})`);
  }
  if (message.stop_reason === 'max_tokens') throw new CurationError('output hit max_tokens');

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CurationError('response was not valid JSON');
  }
  return {
    raw,
    model: message.model,
    usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
  };
}

/**
 * Asks Claude to curate the edition. Returns the raw structured output plus usage;
 * the caller validates it against the candidate list (see assembleEdition).
 */
export async function curateWithClaude({ candidates, now, previousUrls, canonical, model = DEFAULT_MODEL, client = new Anthropic() }) {
  const list = formatCandidates(candidates, { now, previousUrls, canonical });
  const content = `Current time: ${now.toISOString()}\n\n${candidates.length} candidates:\n\n${list}`;
  return requestJson({ client, model, system: SYSTEM_PROMPT, content, schema: OUTPUT_SCHEMA });
}
