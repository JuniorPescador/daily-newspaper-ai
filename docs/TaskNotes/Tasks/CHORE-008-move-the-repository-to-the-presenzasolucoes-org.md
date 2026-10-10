---
uid: chore-008
status: open
priority: normal
scheduled: 2026-10-10
timeEstimate: 30
pomodoros: 0
createdBy: JuniorPescador
tags:
- task
- chore
ai:
  parallelParts: 0
  needsReview: false
  uncertainty: low
  hintsInferred: true
---

# Move the repo to the presenzasolucoes org

Mirror of GitHub issue #63 (opened as JuniorPescador/daily-newspaper-ai#63). Transfer to presenzasolucoes/daily-newspaper-ai, public; point origin to it; update the footer links and the collector user agent.

## Checklist
- [x] Transfer (public, issues/PRs/branches move, old URLs redirect)
- [x] Local origin remote updated
- [x] Links in site/index.html, site/soon.html and src/collect.mjs
- [ ] PR with Closes #63

## Notes
- Transferred 2026-10-10 with `gh api -X POST repos/JuniorPescador/daily-newspaper-ai/transfer -f new_owner=presenzasolucoes`; operator keeps ADMIN; all 14 branches (incl. `data`) and issue #63 moved; github.com/JuniorPescador/daily-newspaper-ai redirects.
- Older TaskNotes and the FEAT-013 spec keep `JuniorPescador/daily-newspaper-ai#N` references: GitHub redirects them.
