const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function stripHtml(value) {
  if (!value) return '';
  return decodeEntities(
    String(value)
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text, max) {
  if (!text || text.length <= max) return text ?? '';
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–—-]+$/, '')}…`;
}

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|source|cmpid|__twitter_impression)$/i;

/** Normalizes a URL for dedupe. Returns null for anything that is not http(s). */
export function canonicalUrl(raw) {
  if (!raw) return null;
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

/** Keeps the original URL (links must work) but only if it is http(s). */
export function safeUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(String(raw).trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function hostnameOf(raw) {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const STOPWORDS = new Set(
  'the and for with from that this into over are was its has have will new how why what when your you our about after before de da do das dos para com que uma por sem mais como sobre'.split(
    ' ',
  ),
);

export function titleTokens(title) {
  return new Set(
    String(title ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((token) => token.length > 2 && !STOPWORDS.has(token)),
  );
}

/** Jaccard similarity between two titles (0..1). */
export function titleSimilarity(a, b) {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

// Short acronyms are case-sensitive: "IA"/"ia" and "AI"/"ai" are common words otherwise.
const AI_ACRONYMS = /\b(AI|IA|A\.I\.|AGI|LLMs?|GPTs?|GPT-\w+|GPUs?|TPUs?|NPUs?|RAG)\b/;
const AI_TERMS =
  /\b(artificial intelligence|intelig[eê]ncia artificial|machine learning|aprendizado de m[aá]quina|deep learning|neural|generative|generativ[ao]s?|chatbots?|chatgpt|openai|anthropic|claude|gemini|deepmind|copilot|llama|mistral|nvidia|perplexity|xai|grok|hugging ?face|midjourney|diffusion|language models?|modelos? de linguagem|agentes? de ia|ai agents?|robotaxi|humanoid|humanoides?|data ?centers?|semiconductors?|semicondutor(es)?)\b/i;

export function isAiRelated(text) {
  return AI_ACRONYMS.test(text) || AI_TERMS.test(text);
}
