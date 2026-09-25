#!/usr/bin/env node
// Assembles dist/ for GitHub Pages: static site + edition data (when present).
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const data = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');

await rm(dist, { recursive: true, force: true });
await cp(path.join(root, 'site'), dist, { recursive: true });
await mkdir(path.join(dist, 'data'), { recursive: true });

const hasData = await stat(path.join(data, 'latest.json')).then(
  () => true,
  () => false,
);
if (hasData) {
  await cp(path.join(data, 'latest.json'), path.join(dist, 'data', 'latest.json'));
  await cp(path.join(data, 'editions'), path.join(dist, 'data', 'editions'), { recursive: true });
}
await writeFile(path.join(dist, '.nojekyll'), '');
console.log(`dist/ pronto${hasData ? ' com a última edição' : ' (sem edições ainda)'}.`);
