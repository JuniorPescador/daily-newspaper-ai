// Static server for the page: site/ at / and the data directory at /data/, plus /healthz.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function inside(base, file) {
  return file === base || file.startsWith(base + path.sep);
}

/**
 * `cacheAssets`: let browsers keep CSS/JS/SVG for 10 minutes (production). HTML and JSON are
 * always revalidated so a new edition shows up right away.
 */
export function createSiteServer({ siteDir, dataDir, cacheAssets = false, health = () => ({ ok: true }) }) {
  const resolve = (pathname) => {
    const [base, rest] = pathname.startsWith('/data/') ? [dataDir, pathname.slice('/data/'.length)] : [siteDir, pathname.slice(1)];
    const file = path.resolve(base, rest || 'index.html');
    return inside(path.resolve(base), file) ? file : null;
  };

  return http.createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    if (pathname === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(health()));
      return;
    }
    try {
      const resolved = resolve(pathname);
      if (!resolved) throw new Error('outside');
      const info = await stat(resolved);
      const file = info.isDirectory() ? path.join(resolved, 'index.html') : resolved;
      const extension = path.extname(file);
      const revalidate = extension === '.html' || extension === '.json';
      response.writeHead(200, {
        'content-type': TYPES[extension] ?? 'application/octet-stream',
        'cache-control': !cacheAssets ? 'no-store' : revalidate ? 'no-cache' : 'public, max-age=600',
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('404');
    }
  });
}
