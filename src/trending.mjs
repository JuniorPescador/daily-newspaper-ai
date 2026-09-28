// "Em alta": what the AI community is building and discussing today. Trending GitHub repos,
// trending Hugging Face models and Bluesky posts are collected apart from the news, curated by
// their own small Claude call (or a score-based fallback) and saved as `edition.trending`.
import Anthropic from '@anthropic-ai/sdk';
import { fetchText } from './collect.mjs';
import { DEFAULT_MODEL, requestJson } from './curate.mjs';
import { isAiRelated, stripHtml, truncate } from './text.mjs';

export const TRENDING_PER_LIST = 5;
const POOL_SIZE = 12;
const POSTS_PER_AUTHOR = 2;
const POST_WINDOW_HOURS = 36;

const GITHUB_TRENDING = 'https://github.com/trending';
const HF_TRENDING = 'https://huggingface.co/api/models?sort=trendingScore&limit=50';
const BLUESKY_API = 'https://public.api.bsky.app/xrpc';
const PERIOD_WORDS = { daily: 'today', weekly: 'this week', monthly: 'this month' };

// Trending projects often describe themselves without the words isAiRelated looks for.
const AI_PROJECT =
  /\b(agents?|agentic|llms?|rag|mcp|embeddings?|transformers?|diffusion|inference|fine-?tun\w*|prompts?|tts|text-to-speech|speech-to-text|voice clon\w*|whisper|ollama|vllm|codex|multimodal|vlms?|computer vision)\b/i;
// Uploads that only repackage another model, and adult content.
const DERIVATIVE_TAG = /^base_model:(quantized|adapter|merge):/;
const SKIPPED_TAGS = new Set(['gguf', 'not-for-all-audiences']);
const SKIPPED_MODEL = /uncensored|abliterated|nsfw|lewd/i;

// "owner/name"; the owner can't start with a dot and the name can't be "." or "..".
const REPO_NAME = /^[\w-][\w.-]*\/(?!\.\.?$)[\w.-]+$/;
const HANDLE = /^[a-z0-9.-]+$/i;
const RECORD_KEY = /^[a-z0-9]+$/i;

function toNumber(text) {
  return Number(String(text ?? '').replace(/\D/g, '')) || 0;
}

function isAiText(text) {
  return isAiRelated(text) || AI_PROJECT.test(text);
}

/* ---------- parsers ---------- */

/** Reads github.com/trending (there is no API for it). Throws when the page layout changes. */
export function parseGithubTrending(html, period = 'daily') {
  const repos = [];
  for (const [, block] of html.matchAll(/<article class="Box-row">([\s\S]*?)<\/article>/g)) {
    const name = block.match(/<h2[^>]*>\s*<a[^>]*?href="\/([^"]+)"/)?.[1]?.trim();
    if (!name || !REPO_NAME.test(name)) continue;
    repos.push({
      name,
      url: `https://github.com/${name}`,
      description: truncate(stripHtml(block.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/)?.[1]), 280),
      language: stripHtml(block.match(/itemprop="programmingLanguage">([^<]*)</)?.[1]),
      stars: toNumber(block.match(/href="\/[^"]+\/stargazers"[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)/)?.[1]),
      gained: toNumber(block.match(/([\d,]+) stars? (?:today|this week|this month)/)?.[1]),
      period,
    });
  }
  if (repos.length === 0) throw new Error('no repositories found on the trending page');
  return repos;
}

export function parseHfModels(body) {
  const models = JSON.parse(body);
  if (!Array.isArray(models)) throw new Error('unexpected models payload');
  return models
    .filter((model) => typeof model?.id === 'string' && REPO_NAME.test(model.id) && !SKIPPED_MODEL.test(model.id))
    .map((model) => ({ model, tags: Array.isArray(model.tags) ? model.tags : [] }))
    .filter(({ tags }) => !tags.some((tag) => SKIPPED_TAGS.has(tag) || DERIVATIVE_TAG.test(tag)))
    .map(({ model, tags }) => ({
      name: model.id,
      url: `https://huggingface.co/${model.id}`,
      task: model.pipeline_tag ?? '',
      library: model.library_name ?? '',
      license: tags.find((tag) => tag.startsWith('license:'))?.slice('license:'.length) ?? '',
      // "base_model:org/name" without a qualifier names the model this one was trained from.
      baseModel: tags.find((tag) => /^base_model:[^:]+$/.test(tag))?.slice('base_model:'.length) ?? '',
      likes: Number(model.likes) || 0,
      downloads: Number(model.downloads) || 0,
      createdAt: model.createdAt ?? null,
    }));
}

/** Reads an author feed or a feed generator from the public Bluesky API. */
export function parseBlueskyFeed(body) {
  const data = JSON.parse(body);
  if (!Array.isArray(data?.feed)) throw new Error('unexpected Bluesky feed payload');
  return (
    data.feed
      // Reposts and pinned posts carry a `reason`; replies have `record.reply`.
      .filter((entry) => !entry?.reason && entry?.post?.record?.text && !entry.post.record.reply)
      .map((entry) => entry.post)
      // Labelled posts or authors (adult content, "hide from logged-out users") stay out.
      .filter((post) => !post.labels?.length && !post.author?.labels?.length)
      .map((post) => {
        const handle = String(post.author?.handle ?? '');
        const key = String(post.uri ?? '').split('/').pop();
        if (!HANDLE.test(handle) || !RECORD_KEY.test(key)) return null;
        return {
          url: `https://bsky.app/profile/${handle}/post/${key}`,
          author: String(post.author.displayName ?? '').trim() || handle,
          handle,
          text: truncate(post.record.text.replace(/\s+/g, ' ').trim(), 300),
          likes: Number(post.likeCount) || 0,
          reposts: Number(post.repostCount) || 0,
          quotes: Number(post.quoteCount) || 0,
          publishedAt: new Date(post.record.createdAt ?? post.indexedAt),
        };
      })
      .filter(Boolean)
  );
}

/* ---------- selection ---------- */

/** AI repos, one entry each: the daily list first (most stars gained first), then weekly to top up. */
export function selectRepos(lists, max = POOL_SIZE) {
  const seen = new Set();
  const picked = [];
  for (const list of lists) {
    for (const repo of [...list].sort((a, b) => b.gained - a.gained)) {
      if (seen.has(repo.name) || !isAiText(`${repo.name.replace(/[/_.-]/g, ' ')} ${repo.description}`)) continue;
      seen.add(repo.name);
      picked.push(repo);
    }
  }
  return picked.slice(0, max);
}

function engagement(post) {
  return post.likes + 2 * (post.reposts + post.quotes);
}

/** Recent AI posts by engagement, at most two per author so one big account can't fill the list. */
export function selectPosts(posts, { now, windowHours = POST_WINDOW_HOURS, max = POOL_SIZE }) {
  const windowMs = windowHours * 3_600_000;
  const seen = new Set();
  const perAuthor = new Map();
  const picked = [];
  const recent = posts.filter((post) => {
    const age = now - post.publishedAt;
    return age <= windowMs && age >= -3_600_000 && isAiText(post.text);
  });
  for (const post of recent.sort((a, b) => engagement(b) - engagement(a))) {
    const count = perAuthor.get(post.handle) ?? 0;
    if (seen.has(post.url) || count >= POSTS_PER_AUTHOR) continue;
    seen.add(post.url);
    perAuthor.set(post.handle, count + 1);
    picked.push(post);
  }
  return picked.slice(0, max);
}

function withIds(items, prefix) {
  return items.map((item, index) => ({ ...item, id: `${prefix}${index + 1}` }));
}

/* ---------- collection ---------- */

export async function collectTrending({ config, now, log = console.log }) {
  const github = config.github ?? {};
  const huggingface = config.huggingface ?? {};
  const bluesky = config.bluesky ?? {};
  const accounts = bluesky.accounts ?? [];

  const jobs = [
    ...(github.periods ?? ['daily']).map((period) => ({
      group: 'GitHub Trending',
      run: async () => parseGithubTrending(await fetchText(`${GITHUB_TRENDING}?since=${encodeURIComponent(period)}`, 'text/html'), period),
    })),
    { group: 'Hugging Face', run: async () => parseHfModels(await fetchText(HF_TRENDING, 'application/json')) },
    ...accounts.map((handle) => ({
      group: 'Bluesky',
      label: `@${handle}`,
      run: async () =>
        parseBlueskyFeed(
          await fetchText(`${BLUESKY_API}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=30&filter=posts_no_replies`, 'application/json'),
        ),
    })),
    ...(bluesky.feeds ?? []).map((feed) => ({
      group: 'Bluesky',
      label: feed.name,
      run: async () => parseBlueskyFeed(await fetchText(`${BLUESKY_API}/app.bsky.feed.getFeed?feed=${encodeURIComponent(feed.uri)}&limit=100`, 'application/json')),
    })),
  ];

  const settled = await Promise.allSettled(jobs.map((job) => job.run()));
  const results = new Map();
  settled.forEach((result, index) => {
    const job = jobs[index];
    const group = results.get(job.group) ?? { lists: [], failed: [] };
    if (result.status === 'fulfilled') group.lists.push(result.value);
    else group.failed.push(`${job.label ?? job.group}: ${result.reason?.message ?? result.reason}`);
    results.set(job.group, group);
  });

  const report = [...results].map(([name, { lists, failed }]) => {
    const count = lists.reduce((sum, list) => sum + list.length, 0);
    log(`  ${lists.length ? '✓' : '✗'} ${name}: ${count}${failed.length ? ` (falhou: ${failed.join('; ')})` : ''}`);
    return { name, ok: lists.length > 0, count };
  });

  const listsOf = (name) => results.get(name)?.lists ?? [];
  const trusted = new Set(accounts.map((handle) => handle.toLowerCase()));
  const posts = listsOf('Bluesky')
    .flat()
    .map((post) => ({ ...post, trusted: trusted.has(post.handle.toLowerCase()) }));
  const pool = {
    repos: withIds(selectRepos(listsOf('GitHub Trending'), github.max), 'r'),
    models: withIds(listsOf('Hugging Face').flat().slice(0, huggingface.max ?? POOL_SIZE), 'm'),
    posts: withIds(selectPosts(posts, { now, windowHours: bluesky.windowHours, max: bluesky.max }), 'p'),
  };
  return { pool, report };
}

/* ---------- curation ---------- */

const SYSTEM_PROMPT = `You are the editor of "Diário da IA", a Brazilian Portuguese newspaper about artificial intelligence. Besides the news, each edition has an "Em alta" section with what the AI community is building and discussing right now. You receive three numbered lists: GitHub repositories trending now, models trending on Hugging Face, and recent Bluesky posts from AI researchers, builders and journalists.

Selection
- Pick up to 5 items from each list, the most relevant for a technical, business-minded Brazilian reader, ordered from most to least relevant. Return fewer (or none) when the candidates are weak.
- Repositories: real AI projects (tools, agents, models, frameworks, datasets). Skip link collections, courses, personal guides and anything not about AI.
- Models: new or notable models. Skip minor fine-tunes and re-uploads that add little.
- Posts: news, useful findings, sharp analysis or a debate the AI community is having. Skip jokes, personal chatter, self-promotion and anything offensive.
- Items marked [in previous edition] were featured yesterday. Prefer fresh items unless one is still clearly among the most relevant.

Writing
- note: one sentence in Brazilian Portuguese, up to about 160 characters, saying what the item is and why it matters. Clear and direct, no hype, no emojis. Keep project, model and people names as they are.
- Rely only on the given fields. Never add facts, numbers or claims they do not contain.
- Use only ids that appear in the lists.`;

const PICKS = {
  type: 'array',
  items: {
    type: 'object',
    properties: { id: { type: 'string' }, note: { type: 'string' } },
    required: ['id', 'note'],
    additionalProperties: false,
  },
};

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: { repos: PICKS, models: PICKS, posts: PICKS },
  required: ['repos', 'models', 'posts'],
  additionalProperties: false,
};

function hoursAgo(date, now) {
  const hours = Math.max(0, Math.round((now - date) / 3_600_000));
  return hours < 1 ? '<1h ago' : `${hours}h ago`;
}

/** Renders the three lists the model reads. Pure, so it can be tested. */
export function formatTrending(pool, { now, previousUrls = new Set() }) {
  const flag = (item) => (previousUrls.has(item.url) ? ' · [in previous edition]' : '');
  const repos = pool.repos.map((repo) => {
    const facts = [repo.name, repo.language, `${repo.stars} stars`, `+${repo.gained} ${PERIOD_WORDS[repo.period] ?? repo.period}`];
    return `[${repo.id}] ${facts.filter(Boolean).join(' · ')}${flag(repo)}\n${repo.description || '(no description)'}`;
  });
  const models = pool.models.map((model) => {
    const facts = [
      model.name,
      model.task,
      model.library,
      model.license && `license ${model.license}`,
      model.baseModel && `trained from ${model.baseModel}`,
      `${model.likes} likes`,
      `${model.downloads} downloads`,
      model.createdAt && `created ${String(model.createdAt).slice(0, 10)}`,
    ];
    return `[${model.id}] ${facts.filter(Boolean).join(' · ')}${flag(model)}`;
  });
  const posts = pool.posts.map((post) => {
    const facts = [`${post.author} (@${post.handle})`, `${post.likes} likes`, `${post.reposts} reposts`, hoursAgo(post.publishedAt, now)];
    return `[${post.id}] ${facts.join(' · ')}${flag(post)}\n${post.text}`;
  });
  return [
    `GitHub repositories trending now (${repos.length}):`,
    ...repos,
    `Hugging Face models trending now (${models.length}):`,
    ...models,
    `Bluesky posts from the last ${POST_WINDOW_HOURS} hours (${posts.length}):`,
    ...posts,
  ].join('\n\n');
}

export async function curateTrending({ pool, now, previousUrls, model = DEFAULT_MODEL, client = new Anthropic() }) {
  const content = `Current time: ${now.toISOString()}\n\n${formatTrending(pool, { now, previousUrls })}`;
  return requestJson({ client, model, system: SYSTEM_PROMPT, content, schema: OUTPUT_SCHEMA, effort: 'low', maxTokens: 16000 });
}

/** Without AI: the top items by score, and Bluesky only from the hand-picked accounts. */
export function fallbackTrending(pool) {
  const pick = (items) => items.slice(0, TRENDING_PER_LIST).map((item) => ({ id: item.id, note: '' }));
  return { repos: pick(pool.repos), models: pick(pool.models), posts: pick(pool.posts.filter((post) => post.trusted)) };
}

/* ---------- validation ---------- */

function picksFrom(list, picks, shape) {
  const byId = new Map(list.map((item) => [item.id, item]));
  const used = new Set();
  const chosen = [];
  for (const pick of Array.isArray(picks) ? picks : []) {
    const item = byId.get(pick?.id);
    if (!item || used.has(item.id)) continue;
    used.add(item.id);
    chosen.push({ ...shape(item), note: truncate(stripHtml(pick.note), 220) });
    if (chosen.length >= TRENDING_PER_LIST) break;
  }
  return chosen;
}

/**
 * Turns picks (Claude or fallback) into the saved section, trusting nothing: unknown ids are
 * dropped, each item is used once, and every link and number comes from the collected data.
 * Returns null when nothing is left.
 */
export function assembleTrending({ raw, pool, curation, report }) {
  const repos = picksFrom(pool.repos, raw?.repos, ({ name, url, description, language, stars, gained, period }) => ({
    name,
    url,
    description,
    language,
    stars,
    gained,
    period,
  }));
  const models = picksFrom(pool.models, raw?.models, ({ name, url, task, likes, downloads }) => ({ name, url, task, likes, downloads }));
  const posts = picksFrom(pool.posts, raw?.posts, ({ url, author, handle, text, likes, reposts, publishedAt }) => ({
    url,
    author,
    handle,
    text,
    likes,
    reposts,
    publishedAt: publishedAt.toISOString(),
  }));
  if (repos.length + models.length + posts.length === 0) return null;
  return {
    curated: curation.curated,
    model: curation.model ?? null,
    usage: curation.usage ?? null,
    repos,
    models,
    posts,
    sources: report,
  };
}

/** Every link featured in an edition's "Em alta" section (used to flag repeats). */
export function trendingUrlsOf(edition) {
  const section = edition?.trending;
  return new Set([...(section?.repos ?? []), ...(section?.models ?? []), ...(section?.posts ?? [])].map((item) => item.url));
}
