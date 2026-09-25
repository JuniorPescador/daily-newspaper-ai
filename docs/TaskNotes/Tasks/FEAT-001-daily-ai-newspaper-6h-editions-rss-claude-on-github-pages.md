---
uid: feat-001
status: in-progress
priority: high
scheduled: 2026-09-25
timeEstimate: 180
pomodoros: 0
firstStartedAt: 2026-09-25T14:53:54.460956Z
tags:
- task
- feat
ai:
  parallelParts: 0
  needsReview: true
  uncertainty: med
  hintsInferred: true
---

# Daily AI newspaper: 6h editions (RSS + Claude) on GitHub Pages

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#1.

## Scope
- RSS/Atom collector (~20 AI sources, last 36h, dedupe)
- Claude curation (PT-BR summaries, categories Novidades/Mercado/Achados, trends); links only from RSS
- Fallback edition without AI
- Static minimalist front-end with animations, archive, dark/light
- GitHub Actions cron every 6h -> data branch -> GitHub Pages

## Subtasks
- [x] Collector + dedupe
- [x] Claude curation + fallback
- [x] Front-end
- [x] Workflow + Pages
- [x] Tests + PR (Closes #1)

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
