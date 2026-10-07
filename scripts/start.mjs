#!/usr/bin/env node
// Railway entry point: serves the site and publishes the edition every day at 05:00 São Paulo,
// followed by the shadow editions of the "em breve" tabs (src/shadow.mjs).
// Editions live in DATA_DIR (the Railway volume). Env: PORT, DATA_DIR, ANTHROPIC_API_KEY, CLAUDE_MODEL.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVACY_CONTACT } from '../site/niches.js';
import { backfillAis } from '../src/backfill.mjs';
import { runEdition } from '../src/run-edition.mjs';
import { shouldCatchUp } from '../src/schedule.mjs';
import { createSiteServer } from '../src/server.mjs';
import { runShadowEdition, SHADOW_NICHES } from '../src/shadow.mjs';
import { readIndex } from '../src/store.mjs';
import { nextRunAt } from '../src/time.mjs';
import { createVisitCounter } from '../src/visits.mjs';
import { createWaitlist } from '../src/waitlist.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const privateDir = path.join(dataDir, 'private');
const port = Number(process.env.PORT) || 8080;

let running = null;
let lastRun = null;
let nextRun = null;

/** Runs one edition; overlapping calls share the run in progress. */
function publish(reason) {
  running ??= (async () => {
    console.log(`[${new Date().toISOString()}] Gerando edição (${reason}).`);
    try {
      const edition = await runEdition({ root, dataDir });
      lastRun = { at: new Date().toISOString(), ok: true, edition: edition?.id ?? null };
    } catch (error) {
      console.error(`✗ ${error.message}`);
      lastRun = { at: new Date().toISOString(), ok: false, error: error.message };
    }
    // Shadow editions of the "em breve" tabs, after the real one; never published.
    for (const nicheId of SHADOW_NICHES) {
      try {
        await runShadowEdition({ root, dataDir, nicheId });
      } catch (error) {
        console.error(`✗ edição sombra ${nicheId}: ${error.message}`);
      }
    }
    running = null;
  })();
  return running;
}

function scheduleNext() {
  nextRun = nextRunAt(new Date());
  console.log(`Próxima edição: ${nextRun.toISOString()}`);
  setTimeout(async () => {
    await publish('agendada');
    scheduleNext();
  }, Math.max(1000, nextRun.getTime() - Date.now()));
}

const visits = createVisitCounter(privateDir);
const server = createSiteServer({
  siteDir: path.join(root, 'site'),
  dataDir,
  privateDir,
  cacheAssets: true,
  health: () => ({ ok: true, running: Boolean(running), lastRun, nextRun }),
  onPageView: visits.hit,
  waitlist: { open: Boolean(PRIVACY_CONTACT), add: createWaitlist(privateDir).add },
});
server.listen(port, () => console.log(`Jornal Presenza em http://localhost:${port} (dados em ${dataDir})`));
// Save the visit counts first: closing waits for open connections.
process.on('SIGTERM', () => visits.flush().then(() => server.close(() => process.exit(0))));

const tagged = await backfillAis(dataDir);
if (tagged) console.log(`${tagged} edições antigas ganharam as marcações de IA.`);
if (shouldCatchUp(await readIndex(dataDir), new Date())) publish('a edição de hoje ainda não saiu');
scheduleNext();
