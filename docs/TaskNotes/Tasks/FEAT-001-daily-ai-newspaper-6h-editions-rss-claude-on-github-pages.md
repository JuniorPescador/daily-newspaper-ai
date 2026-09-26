---
uid: feat-001
status: done
priority: high
scheduled: 2026-09-25
completed: 2026-09-25
timeEstimate: 180
pomodoros: 0
firstStartedAt: 2026-09-25T14:53:54.460956Z
filesTouched:
- .claude/launch.json
- .env.example
- .github/workflows/ci.yml
- .github/workflows/edition.yml
- .tasknotes.toml
- README.md
- docs/TaskNotes/Tasks/CHORE-001-default-to-claude-sonnet-5-and-12-hour-editions.md
- docs/TaskNotes/Tasks/FEAT-001-daily-ai-newspaper-6h-editions-rss-claude-on-github-pages.md
- docs/TaskNotes/Tasks/FEAT-002-filter-stories-by-ai-with-clickable-badges.md
- docs/TaskNotes/Tasks/FEAT-003-ai-filter-brand-logos-and-page-tint-by-selected-ai.md
- package.json
- pnpm-lock.yaml
- scripts/build-site.mjs
- scripts/edition.mjs
- scripts/serve.mjs
- site/app.js
- site/favicon.svg
- site/index.html
- site/logos/NOTICE.md
- site/logos/apple.svg
- site/logos/chatgpt.svg
- site/logos/claude.svg
- site/logos/copilot.svg
- site/logos/deepseek.svg
- site/logos/gemini.svg
- site/logos/grok.svg
- site/logos/kimi.svg
- site/logos/llama.svg
- site/logos/mistral.svg
- site/logos/perplexity.svg
- site/logos/qwen.svg
- site/styles.css
- sources.json
- src/ais.mjs
- src/collect.mjs
- src/curate.mjs
- src/edition.mjs
- src/fallback.mjs
- src/store.mjs
- src/text.mjs
- src/time.mjs
- test/ais.test.mjs
- test/collect.test.mjs
- test/curate.test.mjs
- test/edition.test.mjs
- test/text.test.mjs
commits:
- f0f0189
- fc3df33
- dc5ee0a
- a80a2a0
- 8eeb89e
tags:
- task
- feat
ai:
  parallelParts: 0
  needsReview: true
  uncertainty: med
  hintsInferred: true
---

# Daily AI newspaper: 6h editions (RSS + Claude) on GitHub Pages

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#1.

## Scope
- RSS/Atom collector (~20 AI sources, last 36h, dedupe)
- Claude curation (PT-BR summaries, categories Novidades/Mercado/Achados, trends); links only from RSS
- Fallback edition without AI
- Static minimalist front-end with animations, archive, dark/light
- GitHub Actions cron every 6h -> data branch -> GitHub Pages

## Subtasks
- [x] Collector + dedupe
- [x] Claude curation + fallback
- [x] Front-end
- [x] Workflow + Pages
- [x] Tests + PR (Closes #1)

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
