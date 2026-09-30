// Depth: story cards tilt toward the pointer and lift.
import { finePointer, reducedMotion } from './shared.js';

const MAX_TILT = 7; // degrees

function tiltCards() {
  const surfaces = [document.querySelector('#stories')];
  for (const surface of surfaces) {
    surface.addEventListener('pointermove', (event) => {
      const card = event.target.closest('.story');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      // Axis-angle for the `rotate` property, which leaves `transform` to the reveal animation.
      const rx = -y * MAX_TILT;
      const ry = x * MAX_TILT;
      const angle = Math.hypot(rx, ry);
      card.style.setProperty('--tilt', angle ? `${rx / angle} ${ry / angle} 0 ${angle.toFixed(2)}deg` : '0 1 0 0deg');
      card.style.setProperty('--glare-x', `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--glare-y', `${((y + 0.5) * 100).toFixed(1)}%`);
    });
    surface.addEventListener(
      'pointerout',
      (event) => {
        const card = event.target.closest('.story');
        if (card && !card.contains(event.relatedTarget)) card.style.setProperty('--tilt', '0 1 0 0deg');
      },
      true,
    );
  }
}

export function startDepth() {
  if (reducedMotion.matches) {
    document.documentElement.classList.remove('with-depth');
    return;
  }
  if (finePointer.matches) tiltCards();
}
