---
uid: chore-005
status: in-progress
priority: high
scheduled: 2026-09-28
timeEstimate: 60
pomodoros: 0
firstStartedAt: 2026-09-28T12:22:56.653575Z
tags:
- task
- chore
ai:
  parallelParts: 0
  needsReview: false
  uncertainty: med
  hintsInferred: false
---

# Migrate Railway config to .railway/railway.ts (IaC)

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#28.

Config as Code (railway.json) stops being read on 2026-12-01. Keep start command, /healthz (60 s) and ON_FAILURE x5. Do not touch web-volume or ANTHROPIC_API_KEY / DATA_DIR.

## Subtasks
- [x] .railway/railway.ts (volume + mount + preserve() vars + restart policy), remove railway.json
- [x] railway config plan: no destructive changes (0 add, 1 change, 0 destroy)
- [ ] PR with Closes #28
- [ ] Clear Config File setting, config apply, deploy
- [ ] Verify /healthz ok + logs "Próxima edição"

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
