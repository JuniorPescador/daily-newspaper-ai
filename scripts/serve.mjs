#!/usr/bin/env node
// Local preview: serves site/ at / and data/ at /data/. Usage: pnpm dev [--port 4321]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSiteServer } from '../src/server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portFlag = process.argv.indexOf('--port');
const port = Number(portFlag > -1 ? process.argv[portFlag + 1] : process.env.PORT) || 4321;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');

createSiteServer({ siteDir: path.join(root, 'site'), dataDir }).listen(port, () => console.log(`Diário da IA em http://localhost:${port}`));
