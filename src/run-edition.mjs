// One edition, end to end: collect feeds → curate (Claude, or keyword fallback) → write DATA_DIR.
// Used by the CLI (scripts/edition.mjs) and by the Railway process (scripts/start.mjs).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { collect } from './collect.mjs';
import { curateWithClaude, DEFAULT_MODEL } from './curate.mjs';
import { assembleEdition, sourceUrlsOf } from './edition.mjs';
import { fallbackCuration } from './fallback.mjs';
import { hasEditionOn, previousEdition, readIndex, saveEdition } from './store.mjs';
import { canonicalUrl } from './text.mjs';
import { editionSlot, localDate } from './time.mjs';

function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'chave da API inválida';
  if (error instanceof Anthropic.RateLimitError) return 'limite de uso da API atingido';
  if (error instanceof Anthropic.APIError) return `erro da API (${error.status ?? 'sem status'}): ${error.message}`;
  return error?.message ?? String(error);
}

/**
 * Generates and saves one edition. Returns it, or null when `ifMissing` finds today's edition.
 * Throws when no story could be collected (the previous edition stays in place).
 */
export async function runEdition({ root, dataDir, now = new Date(), ifMissing = false, noAi = false, log = console }) {
  const index = await readIndex(dataDir);
  if (ifMissing && hasEditionOn(index, localDate(now))) {
    log.log(`A edição de ${localDate(now)} já saiu (${index[0].id}). Nada a fazer.`);
    return null;
  }
  const sources = JSON.parse(await readFile(path.join(root, 'sources.json'), 'utf8'));

  log.log(`Coletando ${sources.length} fontes…`);
  const { candidates, report } = await collect({ sources, now, log: (line) => log.log(line) });
  log.log(`${candidates.length} candidatos após filtro e deduplicação.`);
  if (candidates.length === 0) throw new Error('nenhuma notícia coletada; a edição anterior foi mantida');

  const currentId = editionSlot(now).id;
  const previous = await previousEdition(dataDir, index, currentId);
  const previousUrls = sourceUrlsOf(previous);

  const model = process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());

  let raw;
  let curation;
  if (hasKey && !noAi) {
    log.log(`Curando com ${model}…`);
    try {
      const result = await curateWithClaude({ candidates, now, previousUrls, canonical: canonicalUrl, model });
      raw = result.raw;
      curation = { curated: true, model: result.model, usage: result.usage };
      log.log(`Tokens: ${result.usage.input_tokens} entrada, ${result.usage.output_tokens} saída.`);
    } catch (error) {
      log.warn(`Curadoria com IA falhou (${describeError(error)}). Usando a edição automática.`);
      curation = { curated: false, note: 'A curadoria por IA falhou nesta edição.' };
    }
  } else {
    log.log(noAi ? 'IA desativada (--no-ai).' : 'Sem ANTHROPIC_API_KEY: usando a edição automática.');
    curation = { curated: false, note: 'Edição automática, sem resumos por IA.' };
  }

  const base = { candidates, now, previousUrls, lastNumber: index[0]?.number ?? 0, lastId: index[0]?.id, report };
  let edition;
  if (raw) {
    try {
      edition = assembleEdition({ ...base, raw, curation });
    } catch (error) {
      log.warn(`Resposta da IA inutilizável (${error.message}). Usando a edição automática.`);
      curation = { curated: false, note: 'A curadoria por IA falhou nesta edição.' };
    }
  }
  edition ??= assembleEdition({ ...base, raw: fallbackCuration(candidates, { now }), curation });

  await saveEdition(dataDir, edition, index);
  const fresh = edition.stories.filter((story) => story.isNew).length;
  log.log(`✓ ${edition.label} nº ${edition.number} (${edition.id}): ${edition.stories.length} notícias, ${fresh} novas.`);
  return edition;
}
