import { detectAis, storyText, summarizeAis } from './ais.mjs';
import { CATEGORIES } from './curate.mjs';
import { canonicalUrl, stripHtml, truncate } from './text.mjs';
import { editionSlot, nextRunAt } from './time.mjs';

export const SCHEMA_VERSION = 1;
const MAX_STORIES = 24;
const MIN_STORIES = 3;

function clean(value, max) {
  return truncate(stripHtml(value ?? ''), max);
}

/** Every canonical source URL used by an edition's stories. */
export function sourceUrlsOf(edition) {
  const urls = new Set();
  for (const story of edition?.stories ?? []) {
    for (const source of story.sources ?? []) {
      const key = canonicalUrl(source.url);
      if (key) urls.add(key);
    }
  }
  return urls;
}

function sourcesOf(candidate) {
  return [
    { name: candidate.sourceName, url: candidate.url, title: candidate.title, publishedAt: candidate.publishedAt },
    ...(candidate.related ?? []),
  ];
}

/**
 * Turns raw curation output (Claude or fallback) into stories, trusting nothing:
 * unknown ids are dropped, each candidate is used once, and every link comes from the feeds.
 */
export function buildStories(raw, candidates, previousUrls = new Set()) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const used = new Set();
  const stories = [];

  for (const story of raw?.stories ?? []) {
    if (!CATEGORIES.includes(story?.category)) continue;
    const title = clean(story.title, 160);
    if (!title) continue;

    const ids = [...new Set(Array.isArray(story.source_ids) ? story.source_ids : [])].filter((id) => byId.has(id) && !used.has(id));
    if (ids.length === 0) continue;
    ids.forEach((id) => used.add(id));

    const seen = new Set();
    const sources = ids
      .flatMap((id) => sourcesOf(byId.get(id)))
      .filter((source) => {
        const key = canonicalUrl(source.url);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((source) => ({ ...source, publishedAt: new Date(source.publishedAt).toISOString() }));

    const latest = sources.reduce((max, source) => (source.publishedAt > max ? source.publishedAt : max), sources[0].publishedAt);
    const built = {
      id: `s${stories.length + 1}`,
      category: story.category,
      title,
      summary: clean(story.summary, 700),
      whyItMatters: clean(story.why_it_matters, 300),
      tags: (Array.isArray(story.tags) ? story.tags : []).map((tag) => clean(tag, 32)).filter(Boolean).slice(0, 3),
      importance: Math.min(5, Math.max(1, Math.round(Number(story.importance) || 3))),
      publishedAt: latest,
      isNew: ![...seen].some((key) => previousUrls.has(key)),
      sources,
    };
    built.ais = detectAis(storyText(built));
    const launchModel = clean(story.launch_model, 60);
    if (launchModel) {
      const maker = clean(story.launch_maker, 40);
      built.launch = { model: launchModel, maker, ai: detectAis(`${launchModel} ${maker}`)[0] ?? null };
    }
    stories.push(built);
    if (stories.length >= MAX_STORIES) break;
  }
  return stories;
}

export function assembleEdition({ raw, candidates, now, previousUrls, lastNumber = 0, lastId = null, curation, report }) {
  const stories = buildStories(raw, candidates, previousUrls);
  if (stories.length < MIN_STORIES) {
    throw new Error(`only ${stories.length} valid stories after validation (minimum ${MIN_STORIES})`);
  }
  const slot = editionSlot(now);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: slot.id,
    // Re-running inside the same slot replaces that edition instead of taking a new number.
    number: slot.id === lastId ? lastNumber : lastNumber + 1,
    slot: slot.key,
    label: slot.label,
    generatedAt: now.toISOString(),
    nextUpdateAt: nextRunAt(now).toISOString(),
    curated: curation.curated,
    model: curation.model ?? null,
    usage: curation.usage ?? null,
    note: curation.note ?? null,
    editorial: clean(raw.editorial, 400),
    trends: (Array.isArray(raw.trends) ? raw.trends : [])
      .map((trend) => ({ label: clean(trend?.label, 60), note: clean(trend?.note, 160) }))
      .filter((trend) => trend.label)
      .slice(0, 5),
    ais: summarizeAis(stories),
    stories,
    stats: {
      sources: report.length,
      sourcesOk: report.filter((entry) => entry.ok).length,
      failed: report.filter((entry) => !entry.ok).map((entry) => entry.name),
      candidates: candidates.length,
      list: report.map(({ name, ok, count }) => ({ name, ok, count })),
    },
  };
}
