---
uid: feat-003
status: done
priority: normal
scheduled: 2026-09-25
completed: 2026-09-25
timeEstimate: 60
pomodoros: 0
firstStartedAt: 2026-09-25T15:24:34.298483Z
filesTouched:
- .env.example
- .github/workflows/edition.yml
- README.md
- docs/TaskNotes/Tasks/CHORE-001-default-to-claude-sonnet-5-and-12-hour-editions.md
- docs/TaskNotes/Tasks/FEAT-003-ai-filter-brand-logos-and-page-tint-by-selected-ai.md
- site/app.js
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
- src/ais.mjs
- src/curate.mjs
- src/store.mjs
- src/time.mjs
- test/ais.test.mjs
- test/curate.test.mjs
- test/edition.test.mjs
commits:
- f0f0189
- fc3df33
tags:
- task
- feat
ai:
  parallelParts: 0
  needsReview: true
  uncertainty: med
  hintsInferred: true
---

# AI filter: brand logos and page tint by selected AI

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#5. Ships in PR #4 (same AI filter surface, not merged yet).

## Subtasks
- [x] Vendor mono logos + attribution (site/logos)
- [x] Logos in cards, badges, active pill
- [x] Page tint/accent by selected AI with @property transitions
- [x] Browser check (light, dark, mobile) + update PR #4 (Closes #5)

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
