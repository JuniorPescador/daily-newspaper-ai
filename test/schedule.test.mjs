import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldCatchUp } from '../src/schedule.mjs';
import { previousRunAt } from '../src/time.mjs';

test('previousRunAt is the latest 05:00 São Paulo run at or before the moment', () => {
  assert.equal(previousRunAt(new Date('2026-09-28T08:00:00Z')).toISOString(), '2026-09-28T08:00:00.000Z');
  assert.equal(previousRunAt(new Date('2026-09-28T12:00:00Z')).toISOString(), '2026-09-28T08:00:00.000Z');
  assert.equal(previousRunAt(new Date('2026-09-28T07:59:00Z')).toISOString(), '2026-09-27T08:00:00.000Z');
});

test('startup catches up only when today\'s 05:00 run was missed', () => {
  const yesterday = [{ id: '2026-09-27-05h' }];
  const today = [{ id: '2026-09-28-05h' }, ...yesterday];
  // 09:00 in São Paulo, no edition today: the process was down at 05:00.
  assert.equal(shouldCatchUp(yesterday, new Date('2026-09-28T12:00:00Z')), true);
  // Today's edition exists: nothing to do.
  assert.equal(shouldCatchUp(today, new Date('2026-09-28T12:00:00Z')), false);
  // 04:30 in São Paulo: the regular 05:00 run will handle it.
  assert.equal(shouldCatchUp(yesterday, new Date('2026-09-28T07:30:00Z')), false);
  // 23:30 in São Paulo (02:30 UTC next day) with no edition that day: still catch up.
  assert.equal(shouldCatchUp([], new Date('2026-09-29T02:30:00Z')), true);
});
