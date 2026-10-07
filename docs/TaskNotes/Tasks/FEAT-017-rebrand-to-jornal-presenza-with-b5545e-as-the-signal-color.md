---
uid: feat-017
status: open
priority: normal
scheduled: 2026-10-06
timeEstimate: 90
pomodoros: 0
createdBy: JuniorPescador
tags:
- task
- feat
ai:
  parallelParts: 0
  needsReview: true
  uncertainty: med
  hintsInferred: true
---

# Rebrand to Jornal Presenza

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#51. Gazeta Neural becomes **Jornal Presenza**; the orange signal (#ff4a1c / #ff6b3d) becomes **#B5545E**, with a lighter same-hue variant for the dark theme (WCAG AA).

## Checklist
- [x] Name in page, meta, aria, document.title, prompts and server logs
- [x] --signal / --accent / --ai-accent fallbacks in site/styles.css
- [x] Favicon output node
- [x] README title and Marca paragraph
- [x] Light/dark and AI filter checked in the browser

## Implementation
- Light accent `#b5545e` (4.6:1 on the page paper, 4.8:1 on white); dark accent `#d27a83`, same hue (6.3:1 on the dark paper). The old orange was 3.2:1 on light paper.
- Symbol, fonts and the neural effects stay; only the name and the signal color changed.
- Checked in the browser (worktree site copied under `data/presenza/` of the main checkout): light, dark, 360px mobile (no horizontal scroll, wordmark fits), `?ia=claude` re-tint.
