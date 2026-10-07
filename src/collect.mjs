import { XMLParser } from 'fast-xml-parser';
import { canonicalUrl, isAiRelated, safeUrl, stripHtml, titleSimilarity, truncate } from './text.mjs';

const USER_AGENT = 'daily-newspaper-ai/0.1 (+https://github.com/JuniorPescador/daily-newspaper-ai)';
const FETCH_TIMEOUT_MS = 15_000;
const SNIPPET_MAX = 320;
const DUPLICATE_TITLE_SIMILARITY = 0.8;
// Event tickets, sponsored posts and sales pitches that some news feeds mix in.
const PROMOTIONAL =
  /\b(disrupt 20\d\d|save up to|tickets?|early[- ]bird|register now|last (chance|24 hours)|webinar|sponsored|promo code|deal of the day|black friday|patrocinado|cupom|desconto)\b/i;

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ['item', 'entry', 'link'].includes(name),
});

export async function fetchText(url, accept) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return textOf(node[0]);
  if (typeof node === 'object') return String(node['#text'] ?? '');
  return '';
}

function linkOf(entry) {
  const links = entry.link ?? [];
  for (const link of links) {
    if (typeof link === 'string' && link.trim()) return link.trim();
  }
  const alternate =
    links.find((link) => typeof link === 'object' && link['@_href'] && (!link['@_rel'] || link['@_rel'] === 'alternate')) ??
    links.find((link) => typeof link === 'object' && link['@_href']);
  if (alternate) return alternate['@_href'];
  const guid = textOf(entry.guid ?? entry.id);
  return /^https?:\/\//.test(guid) ? guid : null;
}

const PT_MONTHS = { jan: 'Jan', fev: 'Feb', mar: 'Mar', abr: 'Apr', mai: 'May', jun: 'Jun', jul: 'Jul', ago: 'Aug', set: 'Sep', out: 'Oct', nov: 'Nov', dez: 'Dec' };

/** Feed date, including RFC 822 dates written in Portuguese ("ter, 06 out 2026 17:16:59 -0300"). */
export function parseFeedDate(raw) {
  if (!raw) return null;
  let date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    const english = raw
      .replace(/^[^\d,]*,\s*/, '')
      .replace(/\p{L}{3,}/gu, (word) => PT_MONTHS[word.slice(0, 3).toLowerCase()] ?? word);
    date = new Date(english);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOf(entry) {
  return parseFeedDate(textOf(entry.pubDate ?? entry['dc:date'] ?? entry.published ?? entry.updated ?? entry['a10:updated']));
}

function snippetOf(entry) {
  const raw = textOf(entry.description ?? entry.summary ?? entry['content:encoded'] ?? entry.content ?? entry['media:description']);
  const text = stripHtml(raw)
    // hnrss descriptions are only link/points boilerplate
    .replace(/(Article URL|Comments URL|Points|# Comments):\s*\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(text, SNIPPET_MAX);
}

export function parseFeed(body) {
  const doc = xml.parse(body);
  const entries = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item ?? [];
  return entries
    .map((entry) => ({
      title: stripHtml(textOf(entry.title)),
      url: safeUrl(linkOf(entry)),
      publishedAt: dateOf(entry),
      snippet: snippetOf(entry),
    }))
    .filter((item) => item.title && item.url);
}

export function parseHfPapers(body) {
  const papers = JSON.parse(body);
  if (!Array.isArray(papers)) throw new Error('unexpected daily_papers payload');
  return papers
    .filter((entry) => entry?.paper?.id && entry.title)
    .map((entry) => ({
      title: stripHtml(entry.title),
      url: `https://huggingface.co/papers/${encodeURIComponent(entry.paper.id)}`,
      publishedAt: new Date(entry.publishedAt ?? entry.paper.publishedAt),
      snippet: truncate(stripHtml(entry.paper.ai_summary || entry.paper.summary || entry.summary), SNIPPET_MAX),
      upvotes: Number(entry.paper.upvotes) || 0,
    }))
    .sort((a, b) => b.upvotes - a.upvotes);
}

const FEED_ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml';

/** Page `n` of a WordPress feed (`?paged=n`); page 1 is the feed itself. */
export function feedPageUrl(url, page) {
  if (page === 1) return url;
  const next = new URL(url);
  next.searchParams.set('paged', String(page));
  return next.href;
}

async function fetchSource(source) {
  if (source.type === 'hf-papers') return parseHfPapers(await fetchText(source.url, 'application/json'));
  // Some WordPress feeds list only the last 10 posts, a few hours of a busy outlet: `pages` reads
  // the next ones too. Only the first page has to answer.
  const pages = Array.from({ length: Math.max(1, source.pages ?? 1) }, (_, index) => feedPageUrl(source.url, index + 1));
  const [first, ...rest] = await Promise.allSettled(pages.map((url) => fetchText(url, FEED_ACCEPT)));
  if (first.status === 'rejected') throw first.reason;
  return [first, ...rest].filter((page) => page.status === 'fulfilled').flatMap((page) => parseFeed(page.value));
}

/** Items of one source inside its time window, without promotions or off-topic posts. */
export function relevantItems(items, source, now, defaultWindowHours) {
  const windowMs = (source.windowHours ?? defaultWindowHours) * 3_600_000;
  const seen = new Set();
  const recent = items.filter((item) => {
    if (!item.publishedAt || Number.isNaN(item.publishedAt.getTime())) return false;
    // Feed pages can overlap when a post comes out while they are read.
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    const age = now - item.publishedAt;
    // Small allowance for feeds whose clocks run slightly ahead.
    return age <= windowMs && age >= -3_600_000;
  });
  const editorial = recent.filter((item) => !PROMOTIONAL.test(item.title));
  return source.filter === 'ai' ? editorial.filter((item) => isAiRelated(`${item.title} ${item.snippet}`)) : editorial;
}

/** Pick recent items from one source, newest first (papers keep their upvote order). */
export function selectFromSource(items, source, now, defaultWindowHours) {
  const relevant = relevantItems(items, source, now, defaultWindowHours);
  const ordered = source.type === 'hf-papers' ? relevant : relevant.sort((a, b) => b.publishedAt - a.publishedAt);
  return ordered.slice(0, source.max ?? 10).map((item) => ({
    ...item,
    sourceId: source.id,
    sourceName: source.name,
    kind: source.kind,
    weight: source.weight ?? 1,
    lang: source.lang ?? 'en',
  }));
}

/**
 * Removes duplicates: same canonical URL, or near-identical titles from different outlets.
 * The copy from the higher-weight source wins; the others are kept as `related` coverage.
 */
export function dedupe(items) {
  const byWeight = [...items].sort((a, b) => b.weight - a.weight || b.publishedAt - a.publishedAt);
  const kept = [];
  const seenUrls = new Set();
  for (const item of byWeight) {
    const key = canonicalUrl(item.url);
    if (!key || seenUrls.has(key)) continue;
    seenUrls.add(key);
    const twin = kept.find((other) => titleSimilarity(other.title, item.title) >= DUPLICATE_TITLE_SIMILARITY);
    if (twin) {
      twin.related = [...(twin.related ?? []), { name: item.sourceName, url: item.url, title: item.title, publishedAt: item.publishedAt }];
      continue;
    }
    kept.push({ ...item });
  }
  return kept;
}

/** Round-robin across sources so one prolific feed cannot crowd out the rest. */
export function interleave(items) {
  const bySource = new Map();
  for (const item of items) {
    if (!bySource.has(item.sourceId)) bySource.set(item.sourceId, []);
    bySource.get(item.sourceId).push(item);
  }
  const queues = [...bySource.values()].sort((a, b) => b[0].weight - a[0].weight);
  const result = [];
  while (queues.some((queue) => queue.length)) {
    for (const queue of queues) if (queue.length) result.push(queue.shift());
  }
  return result;
}

export async function collect({ sources, now = new Date(), windowHours = 36, maxCandidates = 140, log = console.log }) {
  const settled = await Promise.allSettled(sources.map((source) => fetchSource(source)));
  const report = [];
  const picked = [];
  settled.forEach((result, index) => {
    const source = sources[index];
    if (result.status === 'rejected') {
      report.push({ id: source.id, name: source.name, ok: false, count: 0, error: String(result.reason?.message ?? result.reason) });
      log(`  ✗ ${source.name}: ${result.reason?.message ?? result.reason}`);
      return;
    }
    const items = selectFromSource(result.value, source, now, windowHours);
    // `available`: everything the source had in the window, before the per-source cap.
    const available = relevantItems(result.value, source, now, windowHours).length;
    report.push({ id: source.id, name: source.name, ok: true, count: items.length, available });
    log(`  ✓ ${source.name}: ${items.length}${available > items.length ? ` de ${available}` : ''}`);
    picked.push(...items);
  });

  const candidates = interleave(dedupe(picked))
    .slice(0, maxCandidates)
    .map((item, index) => ({ ...item, id: `c${index + 1}` }));
  return { candidates, report };
}
