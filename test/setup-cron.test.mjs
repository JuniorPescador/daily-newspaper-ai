import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildJob, DISPATCH_URL } from '../scripts/setup-cron.mjs';

test('the cron-job.org job POSTs a workflow_dispatch every day at 05:00 in São Paulo', () => {
  const job = buildJob('github_pat_example');
  assert.equal(job.url, 'https://api.github.com/repos/JuniorPescador/daily-newspaper-ai/actions/workflows/edition.yml/dispatches');
  assert.equal(job.url, DISPATCH_URL);
  assert.equal(job.requestMethod, 1);
  assert.deepEqual(job.schedule, { timezone: 'America/Sao_Paulo', expiresAt: 0, hours: [5], minutes: [0], mdays: [-1], months: [-1], wdays: [-1] });
  assert.equal(job.extendedData.headers.Authorization, 'Bearer github_pat_example');
  assert.equal(job.extendedData.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.deepEqual(JSON.parse(job.extendedData.body), { ref: 'main' });
  assert.equal(job.notification.onFailure, true);
});
