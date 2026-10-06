---
uid: feat-018
status: open
priority: normal
scheduled: 2026-10-06
timeEstimate: 60
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

# AI filter tints only the card details

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#54. Selecting an AI no longer re-tints the page (paper, surfaces, rules, accent); the brand look stays and only story cards and Rápidas items take the AI color in their details.

## Checklist
- [x] Remove the page-wide re-tint (:root[data-ai]) and --ai-tint
- [x] Scope the AI accent to .story and .quick__item details
- [x] Masthead network stays in the brand color
- [x] Light/dark checked with ?ia=<id>
- [x] README Filtro por IA paragraph

## Implementation
- `:root[data-ai]` no longer overrides `--bg`, `--bg-elev`, `--rule` and `--accent`; `--ai-tint` removed.
- `:root[data-ai] :is(.story, .quick__item)` sets a local `--accent` / `--accent-soft` from `--ai-accent` and colors the top rule; `.story__index` takes the accent. "Por que importa" and the "Novo" badge follow through `--accent`. Launch cards without a maker color fall back to it too.
- Masthead network reads `--accent` from the root, so it stays in the brand color.
- Checked with `?ia=chatgpt` in light and dark: page paper and progress bar stay brand; cards and Rápidas carry the AI color.
- Stacked on #53 (rebrand) because both touch the theme token lines in `site/styles.css`.
