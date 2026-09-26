import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// One edition a day: 120 entries keep about four months of history.
export const ARCHIVE_LIMIT = 120;
const EDITION_ID = /^\d{4}-\d{2}-\d{2}-\d{2}h$/;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readIndex(dataDir) {
  const index = await readJson(path.join(dataDir, 'editions', 'index.json'), []);
  return Array.isArray(index) ? index.filter((entry) => EDITION_ID.test(entry?.id)) : [];
}

export async function readEdition(dataDir, id) {
  if (!EDITION_ID.test(id)) return null;
  return readJson(path.join(dataDir, 'editions', `${id}.json`), null);
}

/** Most recent stored edition other than `excludeId` (used to flag what is new). */
export async function previousEdition(dataDir, index, excludeId) {
  const entry = index.find((candidate) => candidate.id !== excludeId);
  return entry ? readEdition(dataDir, entry.id) : null;
}

export function indexEntry(edition) {
  return {
    id: edition.id,
    number: edition.number,
    label: edition.label,
    generatedAt: edition.generatedAt,
    headline: edition.stories[0]?.title ?? '',
    stories: edition.stories.length,
    curated: edition.curated,
  };
}

export async function saveEdition(dataDir, edition, index) {
  const nextIndex = [indexEntry(edition), ...index.filter((entry) => entry.id !== edition.id)]
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, ARCHIVE_LIMIT);
  const kept = new Set(nextIndex.map((entry) => entry.id));

  await writeJson(path.join(dataDir, 'editions', `${edition.id}.json`), edition);
  await writeJson(path.join(dataDir, 'editions', 'index.json'), nextIndex);
  await writeJson(path.join(dataDir, 'latest.json'), edition);

  for (const entry of index) {
    if (!kept.has(entry.id)) await rm(path.join(dataDir, 'editions', `${entry.id}.json`), { force: true });
  }
  return nextIndex;
}
