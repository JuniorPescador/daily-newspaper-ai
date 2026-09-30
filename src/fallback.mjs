// Edition without AI: keyword categories, original titles, feed snippets.
// Produces the same raw shape as the Claude curation so both go through assembleEdition.

const MARKET =
  /\b(raises?|raised|funding|round|series [a-f]|seed|valuation|valued|acquires?|acquisition|acquired|merger|ipo|earnings|revenue|investors?|invest(s|ment)?|stock|shares|market cap|layoffs?|deal|partnership|capta|rodada|aporte|investimento|aquisi[cç][aã]o|compra|avalia[cç][aã]o|receita|faturamento|a[cç][oõ]es|demiss(ão|ões)|parceria)\b/i;
const RESEARCH =
  /\b(paper|study|research(ers)?|benchmark|dataset|arxiv|findings?|we (propose|introduce|present)|estudo|pesquisa(dores)?|artigo cient[ií]fico)\b/i;

const MAX_STORIES = 20;
const FULL_STORIES = 7;
const MIN_PER_CATEGORY = 5;
const MAX_PER_CATEGORY = 8;

const TREND_TERMS = [
  ['Agentes de IA', /\bagent(s|ic)?\b|\bagentes?\b/i],
  ['OpenAI', /\bopenai|chatgpt|gpt-?\d/i],
  ['Google e Gemini', /\bgoogle|gemini|deepmind/i],
  ['Anthropic e Claude', /\banthropic|claude\b/i],
  ['Chips e data centers', /\bnvidia|gpus?\b|chips?\b|semiconductor|data ?centers?/i],
  ['Meta', /\bmeta\b|llama/i],
  ['Microsoft', /\bmicrosoft|copilot/i],
  ['Apple', /\bapple\b/i],
  ['Open source', /\bopen[- ]?(source|weights?)\b|c[oó]digo aberto/i],
  ['Regulação', /\bregulat|\blaw\b|\bpolicy|regula[cç][aã]o|\blei\b|senado|congress/i],
  ['Robótica', /\brobot|rob[oô]s?\b|humanoid|humanoide/i],
  ['Segurança', /\bsecurity|safety|seguran[cç]a|jailbreak|vulnerab/i],
  ['Vídeo e imagem', /\bvideo|v[ií]deo|image gen|sora|veo\b|midjourney/i],
];

export function categorize(item) {
  if (item.kind === 'research') return 'achados';
  const text = `${item.title} ${item.snippet}`;
  if (item.kind === 'market' || MARKET.test(item.title)) return 'mercado';
  if (RESEARCH.test(text)) return 'achados';
  return 'novidades';
}

function score(item, now) {
  const ageHours = Math.max(0, (now - item.publishedAt) / 3_600_000);
  // Items without a snippet make a thin story, so they rank lower.
  const substance = item.snippet ? 1 : -2;
  return item.weight * 2 + substance + (item.related?.length ?? 0) * 1.5 + Math.min(item.upvotes ?? 0, 200) / 50 - ageHours / 12;
}

export function trendsFrom(candidates) {
  return TREND_TERMS.map(([label, pattern]) => ({
    label,
    count: candidates.filter((item) => pattern.test(`${item.title} ${item.snippet}`)).length,
  }))
    .filter((trend) => trend.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((trend) => ({ label: trend.label, note: `${trend.count} menções entre as notícias coletadas.` }));
}

export function fallbackCuration(candidates, { now = new Date() } = {}) {
  const ranked = candidates
    .map((item) => ({ item, category: categorize(item), score: score(item, now) }))
    .sort((a, b) => b.score - a.score);

  // Guarantee each category a few slots first, then fill by score.
  const chosen = new Set();
  for (const category of ['novidades', 'mercado', 'achados']) {
    ranked
      .filter((entry) => entry.category === category)
      .slice(0, MIN_PER_CATEGORY)
      .forEach((entry) => chosen.add(entry));
  }
  const perCategory = (category) => [...chosen].filter((entry) => entry.category === category).length;
  for (const entry of ranked) {
    if (chosen.size >= MAX_STORIES) break;
    if (!chosen.has(entry) && perCategory(entry.category) < MAX_PER_CATEGORY) chosen.add(entry);
  }
  const ordered = ranked.filter((entry) => chosen.has(entry));

  return {
    editorial: '',
    trends: trendsFrom(candidates),
    stories: ordered.map(({ item, category }, position) => ({
      category,
      format: position < FULL_STORIES ? 'full' : 'brief',
      title: item.title,
      summary: item.snippet,
      why_it_matters: '',
      tags: [],
      importance: 3,
      source_ids: [item.id],
    })),
  };
}
