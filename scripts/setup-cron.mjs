#!/usr/bin/env node
// Creates (or updates) the cron-job.org job that triggers the daily edition at 05:00 São Paulo,
// through the GitHub API's workflow_dispatch. Run it yourself: it asks for two credentials in
// hidden prompts (or reads them from the environment) and never writes them anywhere but
// cron-job.org.
//
// Usage: pnpm setup:cron [--test]
//   CRONJOB_API_KEY        cron-job.org API key (Console → Settings → API)
//   GITHUB_DISPATCH_TOKEN  fine-grained GitHub token, Actions: Read and write, this repo only
//   --test                 also dispatch one edition now, exactly as the cron job will
// Re-run it with a new token when the old one expires: the existing job is updated in place.
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

export const REPOSITORY = process.env.GITHUB_REPOSITORY || 'JuniorPescador/daily-newspaper-ai';
export const DISPATCH_URL = `https://api.github.com/repos/${REPOSITORY}/actions/workflows/edition.yml/dispatches`;
const CRONJOB_API = 'https://api.cron-job.org';

/** The cron-job.org job: POST to workflow_dispatch every day at 05:00 in São Paulo. */
export function buildJob(githubToken) {
  return {
    url: DISPATCH_URL,
    enabled: true,
    title: 'Diário da IA',
    saveResponses: true,
    requestTimeout: 30,
    schedule: { timezone: 'America/Sao_Paulo', expiresAt: 0, hours: [5], minutes: [0], mdays: [-1], months: [-1], wdays: [-1] },
    requestMethod: 1, // POST
    extendedData: {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'diario-ia-cron',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
    notification: { onFailure: true, onFailureCount: 1, onSuccess: true, onDisable: true },
  };
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    // Swallow the echo so the secret never shows on screen.
    rl._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function credential(name, question) {
  const value = process.env[name]?.trim() || (await askHidden(question));
  if (!value) throw new Error(`faltou ${name}`);
  return value;
}

async function cronjob(apiKey, method, path, body) {
  const response = await fetch(`${CRONJOB_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) throw new Error('o cron-job.org recusou a chave de API (401)');
  if (!response.ok) throw new Error(`cron-job.org respondeu ${response.status} em ${method} ${path}`);
  return response.json();
}

async function github(token, method, url, body) {
  return fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'diario-ia-cron',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function brasilia(unixSeconds) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' }).format(new Date(unixSeconds * 1000));
}

async function main() {
  const test = process.argv.includes('--test');
  const githubToken = await credential('GITHUB_DISPATCH_TOKEN', 'Token do GitHub (github_pat_…): ');
  const apiKey = await credential('CRONJOB_API_KEY', 'Chave de API do cron-job.org: ');

  // The token must see this repo's workflow; this call starts nothing.
  const check = await github(githubToken, 'GET', `https://api.github.com/repos/${REPOSITORY}/actions/workflows/edition.yml`);
  if (check.status === 401) throw new Error('o GitHub recusou o token (401). Ele foi copiado inteiro?');
  if (!check.ok) throw new Error(`o token não enxerga o workflow (${check.status}). Confira se o repositório ${REPOSITORY} está marcado no token.`);
  console.log('✓ Token do GitHub aceito.');

  const { jobs = [] } = await cronjob(apiKey, 'GET', '/jobs');
  const existing = jobs.find((job) => job.url === DISPATCH_URL);
  const job = buildJob(githubToken);
  let jobId;
  if (existing) {
    jobId = existing.jobId;
    await cronjob(apiKey, 'PATCH', `/jobs/${jobId}`, { job });
    console.log(`✓ Tarefa ${jobId} atualizada no cron-job.org.`);
  } else {
    ({ jobId } = await cronjob(apiKey, 'PUT', '/jobs', { job }));
    console.log(`✓ Tarefa ${jobId} criada no cron-job.org.`);
  }
  const { jobDetails } = await cronjob(apiKey, 'GET', `/jobs/${jobId}`);
  if (jobDetails?.nextExecution) console.log(`  Próxima execução: ${brasilia(jobDetails.nextExecution)}.`);

  if (test) {
    const dispatch = await github(githubToken, 'POST', DISPATCH_URL, { ref: 'main' });
    if (dispatch.status !== 204) {
      throw new Error(`o disparo de teste falhou (${dispatch.status}). O token precisa de Actions: Read and write.`);
    }
    console.log(`✓ Edição de teste disparada. Acompanhe em https://github.com/${REPOSITORY}/actions/workflows/edition.yml`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  });
}
