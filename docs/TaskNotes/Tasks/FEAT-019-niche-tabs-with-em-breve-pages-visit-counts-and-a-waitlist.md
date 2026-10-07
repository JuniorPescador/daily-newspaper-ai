---
uid: feat-019
status: open
priority: normal
scheduled: 2026-10-07
timeEstimate: 180
pomodoros: 0
createdBy: JuniorPescador
tags:
- task
- feat
ai:
  parallelParts: 0
  needsReview: true
  uncertainty: med
  hintsInferred: true
---

# Niche tabs (em breve) + waitlist

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#56. Tabs IA / Marketing / Imóveis / UX; the new ones are em breve pages with a waitlist that stays closed until a privacy contact exists (LGPD). Server counts views per tab; sign-ups and counts in a private folder never served; `pnpm waitlist` prints the numbers.

## Checklist
- [x] Shared niche config (site/niches.js) + tabs on every page
- [x] soon.html / soon.js em breve page
- [x] Server: niche routes, private folder blocked, POST /api/waitlist, view counter
- [x] scripts/waitlist.mjs (pnpm waitlist)
- [x] Tests
- [x] README
- [x] Browser check light/dark/mobile

## Implementation
- `site/niches.js` is shared by the page and the server: tabs, "em breve" copy (from the #52 research) and `PRIVACY_CONTACT` (null = waitlist closed).
- `site/chrome.js` holds the theme toggle (moved from app.js) and the tabs; `site/soon.html` + `soon.js` render the "em breve" page with `<base href="/">`.
- `src/server.mjs`: `/marketing`, `/imoveis`, `/ux` → soon.html; `onPageView` for reader GETs of the tabs (bots/HEAD skipped); `POST /api/waitlist` (503 closed, 4 KB body cap, honeypot, 5 tries / 10 min per address, niche + e-mail + consent checks); `<dataDir>/private/` never served.
- `src/waitlist.mjs` (JSONL, one per e-mail+niche, consent version), `src/visits.mjs` (per São Paulo day, flushed every minute and on SIGTERM).
- `scripts/waitlist.mjs` → `pnpm waitlist` (`--csv`). `scripts/serve.mjs` wired like production.
- Checked in the browser via a temporary launch config pointing at the worktree's serve.mjs: tabs on `/`, the three soon pages, light/dark, 360px (tabs fit without pills), open waitlist flow with a test contact (validation, success, JSONL + visits + CLI output), `/data/private/...` → 404. Contact reverted to null.
