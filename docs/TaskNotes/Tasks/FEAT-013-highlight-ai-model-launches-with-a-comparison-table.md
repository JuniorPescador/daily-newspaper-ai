---
uid: feat-013
status: done
priority: normal
scheduled: 2026-09-26
completed: 2026-09-30
timeEstimate: 240
pomodoros: 0
designDoc: '[[docs/superpowers/specs/2026-09-26-model-launch-comparison-design.md]]'
firstStartedAt: 2026-09-26T14:22:53.320165Z
tags:
- task
- feat
ai:
  parallelParts: 0
  needsReview: true
  uncertainty: med
  hintsInferred: false
---

# Highlight AI model launches with a comparison table

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#13.

Renumbered from FEAT-005 on 2026-09-30: the work sat uncommitted after a lost connection on 2026-09-26, and FEAT-005 was reused on main for the cron-job.org task.

## Subtasks
- [x] Spec (docs/superpowers/specs/2026-09-26-model-launch-comparison-design.md)
- [x] Curation flags launches (`launch: { model, maker }`) + buildStories sanitizes it
- [x] src/compare.mjs: announcement read via web fetch/search + validation (pure, tested)
- [x] src/run-edition.mjs wires comparisons (max 2, failures never break the edition); moved from scripts/edition.mjs when merging main
- [x] Launch card + comparison table in the page (light/dark, mobile)
- [x] Merge main (Rápidas, Hoje na edição, reading time); launch stories are always full
- [x] Browser check with a sample edition (new format: Rápidas + Hoje na edição) + PR (Closes #13)

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
