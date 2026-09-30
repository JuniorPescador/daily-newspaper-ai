---
uid: feat-009
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

# Add a "Hoje na edição" overview at the top of the edition

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#32. A "Hoje na edição" list of 3–5 short lines below the editorial, each linking to its story card.

## Done
- `src/curate.mjs`: `highlights` (text + one `source_id` of the story) in prompt and output schema.
- `src/edition.mjs` `buildHighlights`: maps each line to its story, drops unknown ids and repeats, keeps up to 5; with fewer than 3 valid lines it uses the titles of the top 4 full stories (this also covers the fallback edition).
- `site/`: "Hoje na edição" below the editorial; each line is a button that scrolls to the story and clears filters that hide it. Hidden when the edition has no `highlights`.

## Subtasks

- [x] Prompt, schema and validation
- [x] Fallback highlights
- [x] Render block (light/dark, mobile), links jump to cards
- [x] Older editions unchanged
- [x] Tests

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context

## Source

- GH issue: https://github.com/JuniorPescador/daily-newspaper-ai/issues/32
- Closes GH #32

