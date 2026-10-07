// "Me avise" sign-ups for the "em breve" tabs. One JSON line per sign-up in
// <privateDir>/waitlist.jsonl, a folder the site server never serves.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Bump when the consent wording on site/soon.html changes, so each sign-up records what was agreed to.
export const CONSENT_VERSION = '2026-10-07';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export async function readWaitlist(privateDir) {
  try {
    const text = await readFile(path.join(privateDir, 'waitlist.jsonl'), 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function createWaitlist(privateDir) {
  const file = path.join(privateDir, 'waitlist.jsonl');
  let known = null;
  let queue = Promise.resolve();

  /** Stores a sign-up once per e-mail and niche. Resolves to whether it was new. */
  function add({ niche, email, now = new Date() }) {
    const task = queue.then(async () => {
      known ??= new Set((await readWaitlist(privateDir)).map((entry) => `${entry.niche} ${entry.email}`));
      const key = `${niche} ${email}`;
      if (known.has(key)) return false;
      await mkdir(privateDir, { recursive: true });
      await appendFile(file, `${JSON.stringify({ niche, email, at: now.toISOString(), consent: CONSENT_VERSION })}\n`);
      known.add(key);
      return true;
    });
    queue = task.catch(() => {});
    return task;
  }

  return { add };
}
