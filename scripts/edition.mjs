#!/usr/bin/env node
// Generates one edition: collect feeds → curate (Claude, or keyword fallback) → write data/.
// Usage: pnpm edition [--no-ai]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { collect } from '../src/collect.mjs';
import { addComparisons } from '../src/compare.mjs';
import { curateWithClaude, DEFAULT_MODEL } from '../src/curate.mjs';
import { assembleEdition, sourceUrlsOf } from '../src/edition.mjs';
import { fallbackCuration } from '../src/fallback.mjs';
import { previousEdition, readIndex, saveEdition } from '../src/store.mjs';
import { canonicalUrl } from '../src/text.mjs';
import { editionSlot } from '../src/time.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');

try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // .env is optional
}

function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'chave da API inválida';
  if (error instanceof Anthropic.RateLimitError) return 'limite de uso da API atingido';
  if (error instanceof Anthropic.APIError) return `erro da API (${error.status ?? 'sem status'}): ${error.message}`;
  return error?.message ?? String(error);
}

async function main() {
  const now = new Date();
  const sources = JSON.parse(await readFile(path.join(root, 'sources.json'), 'utf8'));

  console.log(`Coletando ${sources.length} fontes…`);
  const { candidates, report } = await collect({ sources, now });
  console.log(`${candidates.length} candidatos após filtro e deduplicação.`);
  if (candidates.length === 0) throw new Error('nenhuma notícia coletada; a edição anterior foi mantida');

  const index = await readIndex(dataDir);
  const currentId = editionSlot(now).id;
  const previous = await previousEdition(dataDir, index, currentId);
  const previousUrls = sourceUrlsOf(previous);

  const model = process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
  const aiDisabled = process.argv.includes('--no-ai');

  let raw;
  let curation;
  if (hasKey && !aiDisabled) {
    console.log(`Curando com ${model}…`);
    try {
      const result = await curateWithClaude({ candidates, now, previousUrls, canonical: canonicalUrl, model });
      raw = result.raw;
      curation = { curated: true, model: result.model, usage: result.usage };
      console.log(`Tokens: ${result.usage.input_tokens} entrada, ${result.usage.output_tokens} saída.`);
    } catch (error) {
      console.warn(`Curadoria com IA falhou (${describeError(error)}). Usando a edição automática.`);
      curation = { curated: false, note: 'A curadoria por IA falhou nesta edição.' };
    }
  } else {
    console.log(aiDisabled ? 'IA desativada (--no-ai).' : 'Sem ANTHROPIC_API_KEY: usando a edição automática.');
    curation = { curated: false, note: 'Edição automática, sem resumos por IA.' };
  }

  let edition;
  if (raw) {
    try {
      edition = assembleEdition({ raw, candidates, now, previousUrls, lastNumber: index[0]?.number ?? 0, lastId: index[0]?.id, curation, report });
    } catch (error) {
      console.warn(`Resposta da IA inutilizável (${error.message}). Usando a edição automática.`);
      curation = { curated: false, note: 'A curadoria por IA falhou nesta edição.' };
    }
  }
  edition ??= assembleEdition({
    raw: fallbackCuration(candidates, { now }),
    candidates,
    now,
    previousUrls,
    lastNumber: index[0]?.number ?? 0,
    lastId: index[0]?.id,
    curation,
    report,
  });

  if (edition.curated && edition.stories.some((story) => story.launch)) {
    console.log('Montando comparativos de lançamento…');
    const spent = await addComparisons(edition, { model });
    edition.usage = { ...edition.usage, comparisons: spent };
    console.log(`Comparativos: ${spent.input_tokens} tokens de entrada, ${spent.output_tokens} de saída, ${spent.web_search_requests} buscas.`);
  }

  await saveEdition(dataDir, edition, index);
  const fresh = edition.stories.filter((story) => story.isNew).length;
  console.log(`✓ ${edition.label} nº ${edition.number} (${edition.id}): ${edition.stories.length} notícias, ${fresh} novas.`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
