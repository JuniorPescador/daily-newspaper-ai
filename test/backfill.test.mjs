import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { backfillAis, withAis } from '../src/backfill.mjs';

const oldEdition = {
  id: '2026-09-28-05h',
  stories: [
    { id: 's1', title: 'Anthropic lança nova versão do Claude', summary: '', sources: [{ title: 'Anthropic ships Claude' }] },
    { id: 's2', title: 'Bolsa fecha em alta', summary: '', sources: [] },
  ],
};

test('withAis tags stories and the edition, and leaves tagged editions alone', () => {
  const tagged = withAis(oldEdition);
  assert.deepEqual(
    tagged.stories.map((story) => story.ais),
    [['claude'], []],
  );
  assert.deepEqual(
    tagged.ais.map((ai) => [ai.id, ai.count]),
    [['claude', 1]],
  );
  assert.equal(withAis(tagged), null);
});

test('backfillAis rewrites latest.json and archived editions once', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diario-backfill-'));
  await mkdir(path.join(dir, 'editions'));
  await writeFile(path.join(dir, 'latest.json'), JSON.stringify(oldEdition));
  await writeFile(path.join(dir, 'editions', '2026-09-28-05h.json'), JSON.stringify(oldEdition));
  await writeFile(path.join(dir, 'editions', 'index.json'), JSON.stringify([{ id: '2026-09-28-05h' }]));

  assert.equal(await backfillAis(dir), 2);
  const latest = JSON.parse(await readFile(path.join(dir, 'latest.json'), 'utf8'));
  assert.deepEqual(latest.stories[0].ais, ['claude']);
  assert.equal(await backfillAis(dir), 0);
});
