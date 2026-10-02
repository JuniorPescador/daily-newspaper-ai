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

# Neural network masthead (replaces the aurora)

Mirror of GitHub issue JuniorPescador/daily-newspaper-ai#49. Replace the aurora behind the masthead (`site/fx/aurora.js`) with a living neural network. Accent-tinted, light/dark aware, still under reduced motion, paused off-screen.

## Implementation
- `site/fx/neural.js` (2D canvas): ~45–55 neurons on desktop wander along smooth curves at varying depths (near = bigger, brighter, faster; pointer parallax). Synapses wire at random to a neuron in reach (of two random picks the closer wins), grow in as slightly bent curves, live 4–12s and come undone when old or stretched. Neurons fire on their own and relay signals down some of their synapses (up to 5 hops); hovering a neuron fires it.
- Phones (< 760px) get a denser web, slightly fainter.
- Capped at 60 fps; ~0.8ms per frame on desktop (measured in the preview).
- `site/fx/aurora.js` removed; `.fx-aurora` → `.fx-neural`; bottom mask fades from 60% instead of 50%.
- First round drew a newspaper page out of neurons; the operator preferred no fixed shape, fewer points and random, moving links.

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
