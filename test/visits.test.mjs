import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createVisitCounter, isReader, readVisits } from '../src/visits.mjs';

test('tells readers from crawlers and scripts', () => {
  assert.equal(isReader('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1'), true);
  assert.equal(isReader('Mozilla/5.0 (compatible; Googlebot/2.1)'), false);
  assert.equal(isReader('WhatsApp/2.24'), false);
  assert.equal(isReader('curl/8.7.1'), false);
  assert.equal(isReader(undefined), false);
});

test('counts views per São Paulo day and adds them to what is saved', async () => {
  const dir = path.join(await mkdtemp(path.join(tmpdir(), 'visits-')), 'private');
  const counter = createVisitCounter(dir, { flushEveryMs: 60_000 });
  // 02:00 UTC on the 7th is still the 6th in São Paulo.
  counter.hit('marketing', new Date('2026-10-07T02:00:00Z'));
  counter.hit('marketing', new Date('2026-10-07T12:00:00Z'));
  counter.hit('ia', new Date('2026-10-07T12:00:00Z'));
  await counter.flush();
  assert.deepEqual(await readVisits(dir), { '2026-10-06': { marketing: 1 }, '2026-10-07': { marketing: 1, ia: 1 } });

  counter.hit('marketing', new Date('2026-10-07T13:00:00Z'));
  await counter.flush();
  await counter.flush();
  counter.stop();
  assert.deepEqual(await readVisits(dir), { '2026-10-06': { marketing: 1 }, '2026-10-07': { marketing: 2, ia: 1 } });
});
