// Helpers shared by the visual effects.

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
export const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

const probe = document.createElement('canvas');
probe.width = probe.height = 1;
const probeContext = probe.getContext('2d', { willReadFrequently: true });

/**
 * Any CSS color (hex, rgb(), oklab(), color-mix results…) as sRGB floats 0..1.
 * The canvas parses what getComputedStyle hands back, whatever the syntax.
 */
export function toRgb(css) {
  probeContext.clearRect(0, 0, 1, 1);
  probeContext.fillStyle = '#000';
  probeContext.fillStyle = css;
  probeContext.fillRect(0, 0, 1, 1);
  const [r, g, b] = probeContext.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

export function cssVar(name, element = document.documentElement) {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

export function varRgb(name) {
  return toRgb(cssVar(name));
}

export function isDarkTheme() {
  const [r, g, b] = varRgb('--bg');
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

/** Calls `callback(visible)` when the element enters or leaves the viewport. */
export function watchVisibility(element, callback, rootMargin = '0px') {
  const observer = new IntersectionObserver(([entry]) => callback(entry.isIntersecting), { rootMargin });
  observer.observe(element);
  return observer;
}

/** Runs `callback` whenever the theme or the selected AI changes. */
export function onPaletteChange(callback) {
  new MutationObserver(callback).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-ai', 'style'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', callback);
}

export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}
