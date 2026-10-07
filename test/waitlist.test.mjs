import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CONSENT_VERSION, createWaitlist, normalizeEmail, readWaitlist } from '../src/waitlist.mjs';

test('normalizes e-mails and refuses what is not one', () => {
  assert.equal(normalizeEmail('  Ana@Example.COM '), 'ana@example.com');
  assert.equal(normalizeEmail('ana@example'), null);
  assert.equal(normalizeEmail('ana example@x.co'), null);
  assert.equal(normalizeEmail(`${'a'.repeat(250)}@x.co`), null);
  assert.equal(normalizeEmail(42), null);
});

test('stores each e-mail once per section, with the date and the consent version', async () => {
  const dir = path.join(await mkdtemp(path.join(tmpdir(), 'waitlist-')), 'private');
  assert.deepEqual(await readWaitlist(dir), []);
  const now = new Date('2026-10-07T12:00:00Z');
  const list = createWaitlist(dir);
  const results = await Promise.all([
    list.add({ niche: 'marketing', email: 'ana@example.com', now }),
    list.add({ niche: 'marketing', email: 'ana@example.com', now }),
    list.add({ niche: 'ux', email: 'ana@example.com', now }),
  ]);
  assert.deepEqual(results, [true, false, true]);
  assert.deepEqual(await readWaitlist(dir), [
    { niche: 'marketing', email: 'ana@example.com', at: '2026-10-07T12:00:00.000Z', consent: CONSENT_VERSION },
    { niche: 'ux', email: 'ana@example.com', at: '2026-10-07T12:00:00.000Z', consent: CONSENT_VERSION },
  ]);
  // A new process (after a deploy) still knows who already signed up.
  assert.equal(await createWaitlist(dir).add({ niche: 'ux', email: 'ana@example.com', now }), false);
});
