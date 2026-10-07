#!/usr/bin/env node
// Local preview: serves site/ at / and data/ at /data/, with the tabs' visit counter and waitlist
// as on Railway (both kept in data/private/). Usage: pnpm dev [--port 4321]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVACY_CONTACT } from '../site/niches.js';
import { createSiteServer } from '../src/server.mjs';
import { createVisitCounter } from '../src/visits.mjs';
import { createWaitlist } from '../src/waitlist.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portFlag = process.argv.indexOf('--port');
const port = Number(portFlag > -1 ? process.argv[portFlag + 1] : process.env.PORT) || 4321;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const privateDir = path.join(dataDir, 'private');

const visits = createVisitCounter(privateDir, { flushEveryMs: 5000 });
createSiteServer({
  siteDir: path.join(root, 'site'),
  dataDir,
  privateDir,
  onPageView: visits.hit,
  waitlist: { open: Boolean(PRIVACY_CONTACT), add: createWaitlist(privateDir).add },
}).listen(port, () => console.log(`Jornal Presenza em http://localhost:${port}`));
