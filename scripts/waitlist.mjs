#!/usr/bin/env node
// Demand check for the "em breve" tabs: page views, waitlist sign-ups and conversion per tab.
// On Railway: `railway ssh`, then `pnpm waitlist`. `pnpm waitlist --csv` prints the sign-ups
// (tab, e-mail, date) instead, to move them to a newsletter tool.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NICHES, PRIVACY_CONTACT } from '../site/niches.js';
import { localDate } from '../src/time.mjs';
import { readVisits } from '../src/visits.mjs';
import { readWaitlist } from '../src/waitlist.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const privateDir = path.join(dataDir, 'private');
const [visits, signups] = await Promise.all([readVisits(privateDir), readWaitlist(privateDir)]);

// A cell starting with = + - @ would run as a formula in a spreadsheet.
const csvCell = (value) => `"${String(value).replace(/^([=+\-@])/, "'$1").replaceAll('"', '""')}"`;

if (process.argv.includes('--csv')) {
  console.log('aba,email,data');
  for (const entry of signups) console.log([entry.niche, entry.email, entry.at].map(csvCell).join(','));
  process.exit(0);
}

const weekStart = localDate(new Date(Date.now() - 6 * 86_400_000));
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const rows = NICHES.map((niche) => {
  const days = Object.entries(visits);
  const total = days.reduce((sum, [, counts]) => sum + (counts[niche.id] ?? 0), 0);
  const week = days.filter(([date]) => date >= weekStart).reduce((sum, [, counts]) => sum + (counts[niche.id] ?? 0), 0);
  if (niche.status !== 'soon') return [niche.label, week, total, '-', '-'];
  const emails = signups.filter((entry) => entry.niche === niche.id).length;
  return [niche.label, week, total, emails, total ? percent.format(emails / total) : '-'];
});

const header = ['Aba', 'Visitas 7 dias', 'Visitas total', 'E-mails', 'Conversão'];
const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => String(row[column]).length)));
const line = (cells) => cells.map((cell, column) => (column === 0 ? String(cell).padEnd(widths[column]) : String(cell).padStart(widths[column]))).join('  ');
console.log(line(header));
for (const row of rows) console.log(line(row));
console.log(
  `\nLista de espera ${PRIVACY_CONTACT ? `aberta (contato: ${PRIVACY_CONTACT})` : 'fechada: falta o e-mail de contato (PRIVACY_CONTACT em site/niches.js)'}.`,
);
console.log('O servidor grava as visitas a cada minuto; as do último minuto ainda não aparecem.');
