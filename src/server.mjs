// Static server for the page: site/ at / and the data directory at /data/, plus /healthz.
// The "em breve" tabs (/marketing, /imoveis, /ux) get site/soon.html, page views per tab are
// counted, and POST /api/waitlist takes their sign-ups. The data directory's private/ folder
// (sign-ups, visit counts) is never served.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { NICHES, nicheForPath } from '../site/niches.js';
import { isReader } from './visits.mjs';
import { normalizeEmail } from './waitlist.mjs';

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

const MAX_BODY_BYTES = 4096;
// Sign-ups per address in a 10-minute window.
const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 10 * 60_000;

function inside(base, file) {
  return file === base || file.startsWith(base + path.sep);
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * `cacheAssets`: let browsers keep CSS/JS/SVG for 10 minutes (production). HTML and JSON are
 * always revalidated so a new edition shows up right away.
 * `onPageView(nicheId)`: called for each reader's page view of a tab (bots and HEAD skipped).
 * `waitlist`: `{ open, add({ niche, email }) }`; while `open` is false, sign-ups get 503.
 */
export function createSiteServer({
  siteDir,
  dataDir,
  cacheAssets = false,
  health = () => ({ ok: true }),
  privateDir = path.join(dataDir, 'private'),
  onPageView = () => {},
  waitlist = { open: false, add: async () => false },
}) {
  const privateRoot = path.resolve(privateDir);
  const attempts = new Map();

  const resolve = (pathname) => {
    const [base, rest] = pathname.startsWith('/data/') ? [dataDir, pathname.slice('/data/'.length)] : [siteDir, pathname.slice(1)];
    const file = path.resolve(base, rest || 'index.html');
    return inside(path.resolve(base), file) && !inside(privateRoot, file) ? file : null;
  };

  function allowSignup(address, now = Date.now()) {
    if (attempts.size > 5000) attempts.clear();
    const recent = (attempts.get(address) ?? []).filter((at) => now - at < SIGNUP_WINDOW_MS);
    recent.push(now);
    attempts.set(address, recent);
    return recent.length <= SIGNUP_LIMIT;
  }

  async function signUp(request, response) {
    if (!waitlist.open) return sendJson(response, 503, { error: 'closed' });
    const address = String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || request.socket.remoteAddress || '';
    if (!allowSignup(address)) return sendJson(response, 429, { error: 'too-many' });
    let body;
    try {
      body = JSON.parse(await readBody(request));
    } catch (error) {
      return sendJson(response, error.status ?? 400, { error: 'body' });
    }
    // Hidden field only bots fill in: answer as if it worked, store nothing.
    if (body?.site) return sendJson(response, 201, { ok: true });
    const niche = NICHES.find((candidate) => candidate.id === body?.niche && candidate.status === 'soon');
    if (!niche) return sendJson(response, 400, { error: 'niche' });
    const email = normalizeEmail(body.email);
    if (!email) return sendJson(response, 400, { error: 'email' });
    if (body.consent !== true) return sendJson(response, 400, { error: 'consent' });
    try {
      await waitlist.add({ niche: niche.id, email });
      return sendJson(response, 201, { ok: true });
    } catch (error) {
      console.error(`✗ lista de espera: ${error.message}`);
      return sendJson(response, 500, { error: 'store' });
    }
  }

  return http.createServer(async (request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    if (pathname === '/api/waitlist') {
      if (request.method === 'POST') return signUp(request, response);
      response.writeHead(405, { allow: 'POST' });
      response.end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end();
      return;
    }
    if (pathname === '/healthz') {
      sendJson(response, 200, health());
      return;
    }
    const niche = nicheForPath(pathname);
    if (niche && request.method === 'GET' && isReader(request.headers['user-agent'])) onPageView(niche.id);
    try {
      const resolved = niche?.status === 'soon' ? path.join(siteDir, 'soon.html') : resolve(pathname);
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
