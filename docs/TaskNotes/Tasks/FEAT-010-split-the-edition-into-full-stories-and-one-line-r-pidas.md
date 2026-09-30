---
uid: feat-010
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

# Split the edition into full stories and one-line "Rápidas"

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#33. 6–8 full stories plus a one-line "Rápidas" list for the rest; total stays 14–22.

## Decision
Per-story `format: "full" | "brief"`, approved by the operator on 2026-09-30. The lead is always full; brief stories carry no summary. Editions without the field render every story as a full card.

## Subtasks

- [x] Prompt, schema and validation for full vs. brief
- [x] Fallback split
- [x] "Rápidas" block (light/dark, mobile); filters and counts cover it
- [x] Older editions unchanged
- [x] Tests; README "Como funciona"

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context

## Source

- GH issue: https://github.com/JuniorPescador/daily-newspaper-ai/issues/33
- Closes GH #33

