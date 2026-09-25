#!/usr/bin/env node
// Local preview: serves site/ at / and data/ at /data/. Usage: pnpm dev [--port 4321]
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portFlag = process.argv.indexOf('--port');
const port = Number(portFlag > -1 ? process.argv[portFlag + 1] : process.env.PORT) || 4321;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
};

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const [base, rest] = clean.startsWith('/data/') ? [path.join(root, 'data'), clean.slice('/data/'.length)] : [path.join(root, 'site'), clean.slice(1)];
  const file = path.resolve(base, rest || 'index.html');
  return file.startsWith(base) ? file : null;
}

http
  .createServer(async (request, response) => {
    const file = resolve(request.url ?? '/');
    try {
      if (!file) throw new Error('forbidden');
      const info = await stat(file);
      const target = info.isDirectory() ? path.join(file, 'index.html') : file;
      response.writeHead(200, { 'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(target).pipe(response);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('404');
    }
  })
  .listen(port, () => console.log(`Diário da IA em http://localhost:${port}`));
