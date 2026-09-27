import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago, duration } from '../site/relative-time.js';

const now = Date.parse('2026-09-27T12:00:00Z');
const before = (minutes) => new Date(now - minutes * 60_000).toISOString();

test('ago counts whole units and never rounds up', () => {
  assert.equal(ago(before(0.5), now), 'agora');
  assert.equal(ago(before(59), now), 'há 59 min');
  assert.equal(ago(before(90), now), 'há 1h');
  assert.equal(ago(before(23 * 60 + 59), now), 'há 23h');
  assert.equal(ago(before(24 * 60), now), 'ontem');
  assert.equal(ago(before(36 * 60), now), 'ontem');
  assert.equal(ago(before(47 * 60 + 59), now), 'ontem');
  assert.equal(ago(before(48 * 60), now), 'há 2 dias');
});

test('duration formats a countdown', () => {
  assert.equal(duration(12 * 60_000), '12 min');
  assert.equal(duration((3 * 60 + 5) * 60_000), '3h 05min');
  assert.equal(duration(-5000), '0 min');
});
