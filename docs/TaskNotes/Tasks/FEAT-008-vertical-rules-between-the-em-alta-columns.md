---
uid: feat-008
status: done
priority: low
scheduled: 2026-09-28
completed: 2026-09-28
timeEstimate: 15
pomodoros: 0
tags:
- task
- feat
ai:
  parallelParts: 0
  needsReview: true
  uncertainty: low
  hintsInferred: false
---

# Vertical rules between the Em alta columns

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#30. Thin vertical rules between the Repositórios, Modelos and Posts columns of "Em alta".

## Fix
`site/styles.css`: 1px `var(--rule)` line centered in the 44px gap, full column height. Not drawn before the first visible column or on the stacked mobile layout (≤ 860px).

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
