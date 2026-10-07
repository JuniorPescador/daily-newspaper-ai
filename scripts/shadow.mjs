#!/usr/bin/env node
// Shadow editions of the "em breve" sections (generated daily, never published). On Railway run
// `railway ssh`, then:
//   node scripts/shadow.mjs                    latest Marketing shadow edition, in full
//   node scripts/shadow.mjs --list             one line per stored edition: volume over the days
//   node scripts/shadow.mjs --id 2026-10-08-05h
//   node scripts/shadow.mjs --run [--no-ai]    generate one now (--no-ai: collect only)
//   --niche <id>                               another shadow section (default: marketing)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatShadow, formatShadowList, listShadow, readNiche, readShadow, runShadowEdition, SHADOW_NICHES } from '../src/shadow.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const nicheId = option('--niche') ?? SHADOW_NICHES[0];

try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // .env is optional
}

try {
  const niche = await readNiche(root, nicheId);
  if (args.includes('--run')) {
    const shadow = await runShadowEdition({ root, dataDir, nicheId, noAi: args.includes('--no-ai') });
    console.log(`\n${formatShadow(shadow, niche)}`);
  } else if (args.includes('--list')) {
    const ids = await listShadow(dataDir, nicheId);
    if (ids.length === 0) console.log(`Ainda não há edição sombra de ${niche.label}.`);
    else console.log(formatShadowList(await Promise.all(ids.map((id) => readShadow(dataDir, nicheId, id)))));
  } else {
    const id = option('--id') ?? (await listShadow(dataDir, nicheId))[0];
    const shadow = id ? await readShadow(dataDir, nicheId, id) : null;
    console.log(shadow ? formatShadow(shadow, niche) : `Nenhuma edição sombra de ${niche.label}${id ? ` com o id ${id}` : ''}. Gere uma com --run.`);
  }
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
