---
uid: feat-020
status: open
priority: normal
scheduled: 2026-10-07
timeEstimate: 240
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

# Marketing edition in shadow mode

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#57. Daily Marketing edition generated privately to check volume and quality before the tab opens: per-niche config, collector fixes (PT-BR dates, paged feeds, topic filter, release dedupe), separate schedule, review path.

## Checklist
- [x] Per-niche config and prompt
- [x] Collector fixes
- [x] Shadow run + private storage
- [x] Review path for the operator
- [ ] First curated shadow edition checked on Railway (deployed 2026-10-07, 5690b3e3; `railway ssh` needs an SSH key registered by the operator, otherwise the 05:00 run on 2026-10-08 makes the first one)

## Implementation
- `niches/marketing.json`: reader, focus, skip list, categories (plataformas / mercado / ia) and 23 feeds (12 PT, 11 EN), all answering on 2026-10-07 (288 items in 36 h, 131 candidates).
- `src/collect.mjs`: `parseFeedDate` (PT-BR RFC 822 dates, e.g. B9), `pages` → `?paged=n` for 10-item WordPress feeds, per-source `available` count before the cap, repeated URLs across pages dropped.
- `src/curate.mjs`: `nicheSystemPrompt` / `nicheSchema` / `curateNiche` (no launch fields, "never pad" rule); the AI prompt and schema are untouched (tested). `assembleEdition` takes `categories`.
- `src/shadow.mjs`: `runShadowEdition` (collect → curate → `<dataDir>/private/shadow/<id>/<edition>.json`, keeps 31; collect-only record without a key or when curation fails), `formatShadow` / `formatShadowList` for the terminal. `scripts/start.mjs` runs it after the daily edition.
- Review: `node scripts/shadow.mjs` (latest), `--list`, `--id`, `--run [--no-ai]` (operator chose the terminal over a hidden page).
- Not done here: the marketing "Em alta" block (Google Trends BR, Product Hunt) — when the tab opens. No topic filter needed: all 23 feeds are marketing outlets.
- Curation was not run locally (no API key); the first curated shadow edition comes from Railway.
