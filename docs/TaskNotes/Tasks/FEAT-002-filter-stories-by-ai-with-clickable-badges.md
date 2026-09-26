---
uid: feat-002
status: done
priority: normal
scheduled: 2026-09-25
completed: 2026-09-25
timeEstimate: 90
pomodoros: 0
firstStartedAt: 2026-09-25T15:14:46.990936Z
filesTouched:
- .env.example
- .github/workflows/edition.yml
- README.md
- docs/TaskNotes/Tasks/CHORE-001-default-to-claude-sonnet-5-and-12-hour-editions.md
- docs/TaskNotes/Tasks/FEAT-002-filter-stories-by-ai-with-clickable-badges.md
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
- src/edition.mjs
- src/store.mjs
- src/time.mjs
- test/ais.test.mjs
- test/curate.test.mjs
- test/edition.test.mjs
commits:
- f0f0189
- fc3df33
- dc5ee0a
tags:
- task
- feat
ai:
  parallelParts: 0
  needsReview: true
  uncertainty: med
  hintsInferred: true
---

# Filter stories by AI with clickable badges

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#3.

## Subtasks
- [x] AI detection at edition time (src/ais.mjs) + tests
- [x] Edition JSON: story.ais + edition ais counts
- [x] Front-end: AI cards row, story badges, combined filters, ?ia= URL
- [x] Browser check (desktop, mobile, dark) + PR (Closes #3)

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
