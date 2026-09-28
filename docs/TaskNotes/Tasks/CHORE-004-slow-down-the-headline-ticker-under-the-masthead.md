---
uid: chore-004
status: done
priority: low
scheduled: 2026-09-28
completed: 2026-09-28
timeEstimate: 10
pomodoros: 0
firstStartedAt: 2026-09-28T12:02:54.776690Z
tags:
- task
- chore
ai:
  parallelParts: 0
  needsReview: false
  uncertainty: low
  hintsInferred: false
---

# Slow down the headline ticker under the masthead

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#23. The headline ticker scrolls too fast to read.

## Fix
In `site/app.js` (`renderTicker`), change the loop duration from `max(40, stories × 7)`s to `max(60, stories × 10)`s — about 40% slower.

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
