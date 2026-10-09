---
uid: chore-007
status: open
priority: normal
scheduled: 2026-10-09
timeEstimate: 45
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

# Custom domain jornal.presenzasolucoes.com

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#61. Declare the custom domain on the Railway web service in .railway/railway.ts, apply after a clean plan, operator adds the DNS records in Cloudflare, update README.

## Checklist
- [x] railway config plan clean with the domain declared
- [x] Domain created with `railway domain jornal.presenzasolucoes.com` (id 16263fc7); IaC refuses to register custom domains, so no config apply is needed
- [ ] PR with Closes #61 merged
- [ ] DNS records in Cloudflare (operator)
- [ ] https://jornal.presenzasolucoes.com answers with a valid certificate
- [x] README with the new address

## DNS (Cloudflare, operator)
- CNAME `jornal` → `v8v3ym6q.up.railway.app` (DNS only until the certificate is issued)
- TXT `_railway-verify.jornal` → `railway-verify=aaa5cdc6fb0e135852a9096bf4b34ac950d0adbb581bea71690d823c2e0b7fa8`
