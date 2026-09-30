// Depth: story cards tilt toward the pointer and lift, and the masthead folds back as you scroll.
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

function foldMasthead() {
  const masthead = document.querySelector('.masthead');
  let queued = false;
  const update = () => {
    queued = false;
    const progress = Math.min(1, Math.max(0, window.scrollY / Math.max(1, masthead.offsetHeight)));
    masthead.style.setProperty('--fold', progress.toFixed(3));
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}

export function startDepth() {
  if (reducedMotion.matches) {
    document.documentElement.classList.remove('with-depth');
    return;
  }
  foldMasthead();
  if (finePointer.matches) tiltCards();
}
