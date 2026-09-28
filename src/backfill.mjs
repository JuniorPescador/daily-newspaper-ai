// Editions written before the AI filter existed have no AI tags. Adding them needs no model call,
// so the server fills them in at startup; already tagged editions are left untouched.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { detectAis, storyText, summarizeAis } from './ais.mjs';

/** The edition with AI tags, or null when it already has them. */
export function withAis(edition) {
  const stories = edition?.stories;
  if (!Array.isArray(stories)) return null;
  if (Array.isArray(edition.ais) && stories.every((story) => Array.isArray(story.ais))) return null;
  const tagged = stories.map((story) => (Array.isArray(story.ais) ? story : { ...story, ais: detectAis(storyText(story)) }));
  return { ...edition, stories: tagged, ais: summarizeAis(tagged) };
}

export async function backfillAis(dataDir) {
  const editionsDir = path.join(dataDir, 'editions');
  const names = await readdir(editionsDir).catch(() => []);
  const files = [path.join(dataDir, 'latest.json'), ...names.filter((name) => name.endsWith('.json') && name !== 'index.json').map((name) => path.join(editionsDir, name))];
  let updated = 0;
  for (const file of files) {
    let edition;
    try {
      edition = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    const tagged = withAis(edition);
    if (!tagged) continue;
    await writeFile(file, `${JSON.stringify(tagged, null, 2)}\n`);
    updated += 1;
  }
  return updated;
}
