---
uid: feat-005
status: in-progress
priority: normal
scheduled: 2026-09-26
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

## Subtasks
- [x] Spec (docs/superpowers/specs/2026-09-26-model-launch-comparison-design.md)
- [x] Curation flags launches (`launch: { model, maker }`) + buildStories sanitizes it
- [x] src/compare.mjs: announcement read via web fetch/search + validation (pure, tested)
- [x] scripts/edition.mjs wires comparisons (max 2, failures never break the edition)
- [x] Launch card + comparison table in the page (light/dark, mobile)
- [ ] Browser check with a sample edition + PR (Closes #13)

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
