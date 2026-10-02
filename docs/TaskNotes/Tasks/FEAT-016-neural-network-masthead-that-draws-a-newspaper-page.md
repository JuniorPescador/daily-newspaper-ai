---
uid: feat-016
status: in-progress
priority: normal
scheduled: 2026-10-02
timeEstimate: 120
pomodoros: 0
firstStartedAt: 2026-10-02T15:49:37.446672Z
tags:
- task
- feat
ai:
  parallelParts: 0
  needsReview: true
  uncertainty: med
  hintsInferred: false
---

# Neural network masthead that draws a newspaper page

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#49. Replace the aurora behind the masthead (`site/fx/aurora.js`) with a neural network: neurons fly in and link until they draw a newspaper page, with signal pulses running along the links. Accent-tinted, light/dark aware, still under reduced motion, paused off-screen.

## Implementation
- `site/fx/neural.js` (2D canvas, hand-rolled 3D projection): the page is built in page units — dog-eared sheet, "Gazeta Neural" nameplate sampled from the real Instrument Serif letters, double rule, two-line headline, photo, three text columns — then bent like a held newspaper and tilted toward the headline. Neurons fly in top to bottom and links grow between them; afterwards signals hop along the links, random lines "read" themselves, loose neurons drift and link to the page, and the pointer links to nearby neurons.
- Placement: right of the masthead (behind the trends) on desktop; smaller, fainter, top corner on phones (< 760px).
- Capped at 60 fps; ~3.3ms per frame on desktop (measured in the preview).
- `site/fx/aurora.js` removed; `.fx-aurora` → `.fx-neural`; bottom mask fades from 60% instead of 50%.

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
