---
uid: feat-016
status: done
priority: normal
scheduled: 2026-10-02
completed: 2026-10-02
timeEstimate: 120
pomodoros: 0
firstStartedAt: 2026-10-02T15:49:37.446672Z
filesTouched:
- README.md
- docs/TaskNotes/Tasks/FEAT-016-neural-network-masthead-that-draws-a-newspaper-page.md
- site/fx/aurora.js
- site/fx/index.js
- site/fx/neural.js
- site/styles.css
commits:
- 446f0c9
- 8a5da9a
- d1635bf
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
- `site/fx/neural.js` (2D canvas, small perspective projection): ~35–40 neurons on desktop drift along smooth curves inside a 3D box; the camera sways slowly and leans with the pointer, so near links slide past far ones. Synapses wire at random to a neuron in 3D reach (of two random picks the closer wins), grow in as curves bent sideways in 3D, live 4–12s and come undone when old or stretched. Each curve is cut in 8 pieces batched into 6 depth layers: near pieces are thicker and stronger, far ones thinner and fainter. Neurons fire on their own and relay signals down some of their synapses (up to 4 hops); hovering a neuron fires it.
- Phones (< 760px) get a denser cloud, slightly fainter.
- Capped at 60 fps; ~0.7ms per frame on desktop (measured in the preview).
- `site/fx/aurora.js` removed; `.fx-aurora` → `.fx-neural`; bottom mask fades from 60% instead of 50%.
- Round 1 drew a newspaper page out of neurons; round 2 was a flat random web; round 3 (this) adds 3D depth to the links and trims the count so it draws less attention.

## Related

- [[sprint]] - Current sprint
- [[activeContext]] - Active context
