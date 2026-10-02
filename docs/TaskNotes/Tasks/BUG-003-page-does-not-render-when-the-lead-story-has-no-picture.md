---
uid: bug-003
status: done
priority: high
scheduled: 2026-10-01
completed: 2026-10-01
pomodoros: 0
tags:
- task
- bug
ai:
  parallelParts: 0
  needsReview: false
  uncertainty: low
  hintsInferred: true
---

# Page does not render when the lead story has no picture

GitHub issue: #44

Introduced by #41: when the lead story had no `image`, `leadMedia` and `safeHref` threw and the page stayed blank. Fixed in #45 by returning early when there is no picture or URL.

## Subtasks
- [x] Guard `safeHref` and `leadMedia` against a missing picture
- [x] PR #45 (Closes #44), merged 2026-10-01

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
