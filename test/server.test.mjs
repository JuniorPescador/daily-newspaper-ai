import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createSiteServer } from '../src/server.mjs';

let server;
let base;
let dir;
const views = [];
const BROWSER = { 'user-agent': 'Mozilla/5.0 (Macintosh) Safari/605.1' };

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'diario-server-'));
  const siteDir = path.join(dir, 'site');
  const dataDir = path.join(dir, 'data');
  await mkdir(siteDir);
  await mkdir(dataDir);
  await writeFile(path.join(siteDir, 'index.html'), '<h1>ok</h1>');
  await writeFile(path.join(siteDir, 'soon.html'), '<h1>em breve</h1>');
  await writeFile(path.join(siteDir, 'styles.css'), 'body{}');
  await writeFile(path.join(dataDir, 'latest.json'), '{"id":"x"}');
  await mkdir(path.join(dataDir, 'private'));
  await writeFile(path.join(dataDir, 'private', 'waitlist.jsonl'), '{"email":"a@b.co"}\n');
  await writeFile(path.join(dir, 'secret.txt'), 'nope');
  server = createSiteServer({
    siteDir,
    dataDir,
    cacheAssets: true,
    health: () => ({ ok: true, lastRun: null }),
    onPageView: (niche) => views.push(niche),
  });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('serves the page, assets and data with the right caching', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), '<h1>ok</h1>');
  assert.equal(page.headers.get('cache-control'), 'no-cache');

  const css = await fetch(`${base}/styles.css`);
  assert.equal(css.headers.get('cache-control'), 'public, max-age=600');

  const data = await fetch(`${base}/data/latest.json`);
  assert.equal(data.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await data.json(), { id: 'x' });
});

test('answers the health check and refuses paths outside the site', async () => {
  const health = await fetch(`${base}/healthz`);
  assert.deepEqual(await health.json(), { ok: true, lastRun: null });
  assert.equal((await fetch(`${base}/..%2Fsecret.txt`)).status, 404);
  assert.equal((await fetch(`${base}/data/..%2F..%2Fsecret.txt`)).status, 404);
  assert.equal((await fetch(`${base}/missing.js`)).status, 404);
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
});

test('never serves the private folder of the data directory', async () => {
  assert.equal((await fetch(`${base}/data/private/waitlist.jsonl`)).status, 404);
  assert.equal((await fetch(`${base}/data/editions/..%2Fprivate%2Fwaitlist.jsonl`)).status, 404);
  assert.equal((await fetch(`${base}/data/private/`)).status, 404);
});

test('serves the "em breve" page at each upcoming section', async () => {
  for (const pathname of ['/marketing', '/marketing/', '/imoveis', '/ux']) {
    const page = await fetch(`${base}${pathname}`);
    assert.equal(page.status, 200, pathname);
    assert.equal(await page.text(), '<h1>em breve</h1>');
    assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
  }
  assert.equal((await fetch(`${base}/marketing/extra`)).status, 404);
});

test('counts page views of the tabs, but not bots, HEAD or assets', async () => {
  views.length = 0;
  await fetch(`${base}/`, { headers: BROWSER });
  await fetch(`${base}/marketing`, { headers: BROWSER });
  await fetch(`${base}/ux/`, { headers: BROWSER });
  await fetch(`${base}/marketing`, { headers: { 'user-agent': 'Googlebot/2.1' } });
  await fetch(`${base}/marketing`, { method: 'HEAD', headers: BROWSER });
  await fetch(`${base}/styles.css`, { headers: BROWSER });
  assert.deepEqual(views, ['ia', 'marketing', 'ux']);
});

test('refuses waitlist sign-ups while the list is closed', async () => {
  const post = await fetch(`${base}/api/waitlist`, { method: 'POST', body: JSON.stringify({ niche: 'marketing', email: 'a@b.co', consent: true }) });
  assert.equal(post.status, 503);
  assert.deepEqual(await post.json(), { error: 'closed' });
  assert.equal((await fetch(`${base}/api/waitlist`)).status, 405);
});

test('takes valid sign-ups once the list is open', async () => {
  const added = [];
  const open = createSiteServer({
    siteDir: path.join(dir, 'site'),
    dataDir: path.join(dir, 'data'),
    waitlist: { open: true, add: async (entry) => added.push(entry) },
  });
  await new Promise((resolve) => open.listen(0, resolve));
  const url = `http://127.0.0.1:${open.address().port}/api/waitlist`;
  const send = (body, headers = {}) => fetch(url, { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.7', ...headers }, body: JSON.stringify(body) });
  try {
    const ok = await send({ niche: 'marketing', email: '  Ana@Example.COM ', consent: true });
    assert.equal(ok.status, 201);
    assert.deepEqual(added, [{ niche: 'marketing', email: 'ana@example.com' }]);

    assert.deepEqual(await (await send({ niche: 'marketing', email: 'nope', consent: true })).json(), { error: 'email' });
    assert.deepEqual(await (await send({ niche: 'marketing', email: 'a@b.co' })).json(), { error: 'consent' });
    assert.deepEqual(await (await send({ niche: 'ia', email: 'a@b.co', consent: true })).json(), { error: 'niche' });

    // The hidden field only bots fill: answered as a success, nothing stored.
    assert.equal((await send({ niche: 'ux', email: 'bot@spam.co', consent: true, site: 'http://spam' }, { 'x-forwarded-for': '203.0.113.8' })).status, 201);
    assert.equal(added.length, 1);

    // Five tries per address in ten minutes: this is the fifth, the next one waits.
    assert.equal((await send({ niche: 'ux', email: 'c@d.co', consent: true })).status, 201);
    assert.equal((await send({ niche: 'ux', email: 'e@f.co', consent: true })).status, 429);
    assert.equal(added.length, 2);
    const big = await fetch(url, { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9' }, body: 'x'.repeat(5000) });
    assert.equal(big.status, 413);
  } finally {
    open.close();
  }
});
