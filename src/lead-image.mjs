// Picture for the lead story: the share image (og:image / twitter:image) of its source pages, tried
// in source order. It is shown like a link preview, credited and linked; no picture is fine.
import { fetchText } from './collect.mjs';
import { decodeEntities, safeUrl } from './text.mjs';

const MAX_PAGES = 3;
const IMAGE_KEYS = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'];
// Site logos and placeholders make a poor front page.
const GENERIC = /(logo|favicon|default|placeholder|avatar)[^/]*$|\.(svg|ico)(\?|$)/i;

/** An attribute's value, quoted or not (`property=og:image` is valid HTML and common). */
function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+?)(?=\\s|/?>))`, 'i'));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3]) : null;
}

/** The page's share image as an absolute https URL, or null. */
export function shareImageOf(html, pageUrl) {
  const found = new Map();
  for (const tag of String(html).match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attribute(tag, 'property') ?? attribute(tag, 'name') ?? '').toLowerCase();
    const content = attribute(tag, 'content')?.trim();
    if (IMAGE_KEYS.includes(key) && content && !found.has(key)) found.set(key, content);
  }
  for (const key of IMAGE_KEYS) {
    if (!found.has(key)) continue;
    let url;
    try {
      url = new URL(found.get(key), pageUrl);
    } catch {
      continue;
    }
    // The site is served over https; an http picture would be blocked as mixed content.
    if (url.protocol === 'http:') url.protocol = 'https:';
    const safe = safeUrl(url.toString());
    if (safe && !GENERIC.test(url.pathname)) return safe;
  }
  return null;
}

/** The story the page shows as its headline: the first one that is not a one-line brief. */
export function leadOf(edition) {
  return edition?.stories?.find((story) => story.format !== 'brief') ?? null;
}

/**
 * Looks for a picture for the lead story and stores it as `image: { url, credit }`, credit being
 * the outlet whose page it came from. Never throws: a page that fails is skipped.
 */
export async function addLeadImage(edition, { fetchPage = (url) => fetchText(url, 'text/html'), maxPages = MAX_PAGES, log = console } = {}) {
  const lead = leadOf(edition);
  if (!lead) return null;
  const pages = [...new Set((lead.sources ?? []).map((source) => source.url).filter(Boolean))].slice(0, maxPages);
  for (const pageUrl of pages) {
    try {
      const url = shareImageOf(await fetchPage(pageUrl), pageUrl);
      if (!url) continue;
      const source = lead.sources.find((candidate) => candidate.url === pageUrl);
      lead.image = { url, credit: source.name };
      return lead.image;
    } catch (error) {
      log.warn(`  Imagem de ${pageUrl} indisponível: ${error?.message ?? error}`);
    }
  }
  return null;
}
