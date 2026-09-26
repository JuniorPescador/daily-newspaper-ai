---
uid: chore-001
status: done
priority: normal
scheduled: 2026-09-25
completed: 2026-09-25
timeEstimate: 30
pomodoros: 0
firstStartedAt: 2026-09-25T16:31:34.042009Z
filesTouched:
- .env.example
- .github/workflows/edition.yml
- README.md
- docs/TaskNotes/Tasks/CHORE-001-default-to-claude-sonnet-5-and-12-hour-editions.md
- site/app.js
- site/index.html
- src/curate.mjs
- src/store.mjs
- src/time.mjs
- test/curate.test.mjs
- test/edition.test.mjs
commits:
- f0f0189
tags:
- task
- chore
ai:
  parallelParts: 0
  needsReview: false
  uncertainty: low
  hintsInferred: true
---

# Default to Claude Sonnet 5 and 12-hour editions

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#6.

## Subtasks
- [x] Default model claude-sonnet-5
- [x] Cron 17 9,21 * * * + RUN_HOURS_UTC [9, 21]
- [x] Copy: page, README, .env.example
- [x] Tests + PR (Closes #6)

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
