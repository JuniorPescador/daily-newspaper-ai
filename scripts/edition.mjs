#!/usr/bin/env node
// Generates one edition by hand. Usage: pnpm edition [--no-ai] [--if-missing]
//   --if-missing: do nothing when today's edition already exists.
// On Railway the edition runs by itself every day at 05:00 (see scripts/start.mjs).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEdition } from '../src/run-edition.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');

try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // .env is optional
}

runEdition({
  root,
  dataDir,
  ifMissing: process.argv.includes('--if-missing'),
  noAi: process.argv.includes('--no-ai'),
}).catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
