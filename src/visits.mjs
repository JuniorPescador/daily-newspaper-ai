// Page views per tab per day (São Paulo date), for the "em breve" demand check. Only counts: no IP,
// no cookies. Kept in memory and written to <privateDir>/visits.json every minute and on shutdown.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { localDate } from './time.mjs';

// Crawlers, link previews, uptime checks and scripts.
const NOT_A_READER = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|monitor|uptime|curl|wget|python|go-http|node-fetch|headless|lighthouse/i;

export function isReader(userAgent) {
  return Boolean(userAgent) && !NOT_A_READER.test(userAgent);
}

export async function readVisits(privateDir) {
  try {
    return JSON.parse(await readFile(path.join(privateDir, 'visits.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

/** Adds `{date: {niche: count}}` counts into `totals` and returns it. */
function addInto(totals, counts) {
  for (const [date, byNiche] of Object.entries(counts)) {
    const day = (totals[date] ??= {});
    for (const [niche, count] of Object.entries(byNiche)) day[niche] = (day[niche] ?? 0) + count;
  }
  return totals;
}

export function createVisitCounter(privateDir, { flushEveryMs = 60_000 } = {}) {
  const file = path.join(privateDir, 'visits.json');
  let pending = {};
  let writing = Promise.resolve();

  function hit(niche, now = new Date()) {
    addInto(pending, { [localDate(now)]: { [niche]: 1 } });
  }

  /** Adds the pending counts to the file. */
  function flush() {
    const batch = pending;
    pending = {};
    if (Object.keys(batch).length === 0) return writing;
    writing = writing
      .then(async () => {
        const totals = addInto(await readVisits(privateDir), batch);
        await mkdir(privateDir, { recursive: true });
        await writeFile(`${file}.tmp`, `${JSON.stringify(totals, null, 2)}\n`);
        await rename(`${file}.tmp`, file);
      })
      .catch((error) => {
        // Keep the counts for the next try.
        addInto(pending, batch);
        console.error(`✗ visitas não gravadas: ${error.message}`);
      });
    return writing;
  }

  const timer = setInterval(flush, flushEveryMs);
  timer.unref();
  return { hit, flush, stop: () => clearInterval(timer) };
}
