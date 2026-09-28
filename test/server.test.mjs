import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createSiteServer } from '../src/server.mjs';

let server;
let base;

before(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diario-server-'));
  const siteDir = path.join(dir, 'site');
  const dataDir = path.join(dir, 'data');
  await mkdir(siteDir);
  await mkdir(dataDir);
  await writeFile(path.join(siteDir, 'index.html'), '<h1>ok</h1>');
  await writeFile(path.join(siteDir, 'styles.css'), 'body{}');
  await writeFile(path.join(dataDir, 'latest.json'), '{"id":"x"}');
  await writeFile(path.join(dir, 'secret.txt'), 'nope');
  server = createSiteServer({ siteDir, dataDir, cacheAssets: true, health: () => ({ ok: true, lastRun: null }) });
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
