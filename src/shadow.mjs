// Shadow editions: sections that are still "em breve" (niches/<id>.json) get a daily edition that
// is never published. It lives in <dataDir>/private/shadow/<id>/, which the site never serves, so
// the operator can judge volume and quality with `node scripts/shadow.mjs` before the tab opens.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collect } from './collect.mjs';
import { curateNiche, DEFAULT_MODEL } from './curate.mjs';
import { assembleEdition, sourceUrlsOf } from './edition.mjs';
import { canonicalUrl } from './text.mjs';
import { editionSlot } from './time.mjs';

export const SHADOW_NICHES = ['marketing'];
// A month of shadow editions is enough to see the trend in volume.
const KEEP = 31;
const EDITION_ID = /^\d{4}-\d{2}-\d{2}-\d{2}h$/;

export async function readNiche(root, id) {
  return JSON.parse(await readFile(path.join(root, 'niches', `${id}.json`), 'utf8'));
}

function shadowDir(dataDir, nicheId) {
  return path.join(dataDir, 'private', 'shadow', nicheId);
}

/** Stored shadow edition ids, newest first. */
export async function listShadow(dataDir, nicheId) {
  try {
    const files = await readdir(shadowDir(dataDir, nicheId));
    return files
      .map((file) => file.replace(/\.json$/, ''))
      .filter((id) => EDITION_ID.test(id))
      .sort()
      .reverse();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function readShadow(dataDir, nicheId, id) {
  if (!EDITION_ID.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(shadowDir(dataDir, nicheId), `${id}.json`), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveShadow(dataDir, nicheId, edition) {
  const dir = shadowDir(dataDir, nicheId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${edition.id}.json`), `${JSON.stringify(edition, null, 2)}\n`);
  for (const old of (await listShadow(dataDir, nicheId)).slice(KEEP)) await rm(path.join(dir, `${old}.json`), { force: true });
}

/**
 * Collects and curates one shadow edition and stores it. Without an API key (or when the curation
 * fails) it stores only what was collected, which still shows the source volume.
 */
export async function runShadowEdition({ root, dataDir, nicheId, now = new Date(), noAi = false, log = console }) {
  const niche = await readNiche(root, nicheId);
  log.log(`[sombra ${niche.label}] Coletando ${niche.sources.length} fontes…`);
  const { candidates, report } = await collect({ sources: niche.sources, now, log: (line) => log.log(line) });
  const id = editionSlot(now).id;
  const [previousId] = (await listShadow(dataDir, nicheId)).filter((other) => other !== id);
  const previousUrls = sourceUrlsOf(previousId ? await readShadow(dataDir, nicheId, previousId) : null);
  const collected = {
    id,
    niche: nicheId,
    generatedAt: now.toISOString(),
    available: report.reduce((sum, entry) => sum + (entry.available ?? 0), 0),
    candidates: candidates.length,
    sources: report.map(({ name, ok, count, available, error }) => ({ name, ok, count, available: available ?? 0, error: error ?? null })),
  };

  const model = process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
  let shadow = { ...collected, edition: null, note: noAi || !hasKey ? 'Sem curadoria: só a coleta.' : null };
  if (hasKey && !noAi && candidates.length > 0) {
    try {
      log.log(`[sombra ${niche.label}] Curando ${candidates.length} candidatos com ${model}…`);
      const result = await curateNiche({ niche, candidates, now, previousUrls, canonical: canonicalUrl, model });
      const edition = assembleEdition({
        raw: result.raw,
        candidates,
        now,
        previousUrls,
        curation: { curated: true, model: result.model, usage: result.usage },
        report,
        categories: Object.keys(niche.categories),
      });
      shadow = { ...collected, edition, note: null };
    } catch (error) {
      log.warn(`[sombra ${niche.label}] Curadoria falhou: ${error.message}`);
      shadow = { ...collected, edition: null, note: `A curadoria falhou: ${error.message}` };
    }
  }
  await saveShadow(dataDir, nicheId, shadow);
  const stories = shadow.edition?.stories ?? [];
  log.log(`[sombra ${niche.label}] ✓ ${id}: ${collected.available} itens no período, ${collected.candidates} candidatos, ${stories.length} notícias.`);
  return shadow;
}

const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

/** One line per stored shadow edition: how much came in and how much was kept. */
export function formatShadowList(entries) {
  const lines = ['Edição          Itens  Candidatos  Notícias  Completas  Fontes com falha'];
  for (const entry of entries) {
    const stories = entry.edition?.stories ?? [];
    const full = stories.filter((story) => story.format !== 'brief').length;
    const failed = entry.sources.filter((source) => !source.ok).length;
    lines.push(
      [entry.id.padEnd(15), String(entry.available).padStart(5), String(entry.candidates).padStart(11), String(entry.edition ? stories.length : '-').padStart(9), String(entry.edition ? full : '-').padStart(10), String(failed).padStart(17)].join(' '),
    );
  }
  return lines.join('\n');
}

/** The whole shadow edition as plain text, to read in a terminal. */
export function formatShadow(shadow, niche) {
  const lines = [];
  const stories = shadow.edition?.stories ?? [];
  const full = stories.filter((story) => story.format !== 'brief');
  const brief = stories.filter((story) => story.format === 'brief');
  const failed = shadow.sources.filter((source) => !source.ok);
  lines.push(`${niche.label} · edição sombra ${shadow.id} (gerada em ${dateTime.format(new Date(shadow.generatedAt))})`);
  lines.push(`Coleta: ${shadow.available} itens nas últimas 36 h, de ${shadow.sources.length - failed.length} das ${shadow.sources.length} fontes; ${shadow.candidates} candidatos depois dos limites e duplicados.`);
  if (!shadow.edition) {
    lines.push(shadow.note ?? 'Sem edição.');
  } else {
    const usage = shadow.edition.usage;
    lines.push(`Edição: ${stories.length} notícias (${full.length} completas, ${brief.length} rápidas). ${shadow.edition.model ?? ''}${usage ? `, ${usage.input_tokens} tokens de entrada e ${usage.output_tokens} de saída` : ''}.`);
    if (shadow.edition.editorial) lines.push('', shadow.edition.editorial);
    for (const [key, category] of Object.entries(niche.categories)) {
      const inCategory = full.filter((story) => story.category === key);
      if (inCategory.length === 0) continue;
      lines.push('', category.label.toUpperCase());
      for (const story of inCategory) {
        lines.push(`• ${story.title}`);
        if (story.summary) lines.push(`  ${story.summary}`);
        if (story.whyItMatters) lines.push(`  Por que importa: ${story.whyItMatters}`);
        lines.push(`  Fontes: ${story.sources.map((source) => `${source.name} (${source.url})`).join(' · ')}`);
      }
    }
    if (brief.length) {
      lines.push('', 'RÁPIDAS');
      for (const story of brief) lines.push(`• [${niche.categories[story.category]?.label ?? story.category}] ${story.title} — ${story.sources[0].name}`);
    }
  }
  lines.push('', 'FONTES (usadas / no período)');
  for (const source of shadow.sources) {
    lines.push(source.ok ? `  ✓ ${source.name}: ${source.count} / ${source.available}` : `  ✗ ${source.name}: ${source.error}`);
  }
  return lines.join('\n');
}
