#!/usr/bin/env node
// Railway entry point: serves the site and publishes the edition every day at 05:00 São Paulo.
// Editions live in DATA_DIR (the Railway volume). Env: PORT, DATA_DIR, ANTHROPIC_API_KEY, CLAUDE_MODEL.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backfillAis } from '../src/backfill.mjs';
import { runEdition } from '../src/run-edition.mjs';
import { shouldCatchUp } from '../src/schedule.mjs';
import { createSiteServer } from '../src/server.mjs';
import { readIndex } from '../src/store.mjs';
import { nextRunAt } from '../src/time.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
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
    } finally {
      running = null;
    }
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

const server = createSiteServer({
  siteDir: path.join(root, 'site'),
  dataDir,
  cacheAssets: true,
  health: () => ({ ok: true, running: Boolean(running), lastRun, nextRun }),
});
server.listen(port, () => console.log(`Gazeta Neural em http://localhost:${port} (dados em ${dataDir})`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));

const tagged = await backfillAis(dataDir);
if (tagged) console.log(`${tagged} edições antigas ganharam as marcações de IA.`);
if (shouldCatchUp(await readIndex(dataDir), new Date())) publish('a edição de hoje ainda não saiu');
scheduleNext();
