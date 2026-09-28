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
- [x] PR #29 with Closes #28
- [x] config apply (redeploy 1554d74a) + railway up from branch (a3265537); no custom Config File path was set
- [x] Verify /healthz ok + logs "Próxima edição" (2026-09-28 09:37 -03)
- [ ] Merge PR #29 (closes #28), then `tn done CHORE-005`

## Notes
- `railway config migrate` drops the restart policy and declares no volume/variables; the file was built from `railway config pull`.
- ON_FAILURE is stored as null by Railway, so `restartPolicyType` is left out of the file (explicit value = permanent plan diff).
- Before this change, the live deployment (10a864c5) ran without start command/health check and with 10 retries: railway.json was not being applied.

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
