---
uid: feat-011
status: done
priority: normal
scheduled: 2026-09-30
completed: 2026-09-30
pomodoros: 0
tags:
- task
- feat
ai:
  parallelParts: 0
  needsReview: true
  uncertainty: med
  hintsInferred: true
---

# Show the edition's reading time in the masthead

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#34. "Leitura: ~N min" in the masthead meta line, computed in the browser from the rendered text at ~200 words/min (rounded up, min 1). No edition JSON change.

## Subtasks

- [x] Pure helper in `site/` with tests (like `site/relative-time.js`)
- [x] Shown in the masthead for latest and archived editions
- [x] Light/dark and mobile checked

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context

## Source

- GH issue: https://github.com/JuniorPescador/daily-newspaper-ai/issues/34
- Closes GH #34

