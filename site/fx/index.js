// Visual effects, loaded after the edition renders: a neural network behind the masthead, depth on the
// cards, the 3D map of the day and the 3D logo of the selected AI. Each one is optional: if it
// fails (no WebGL, CDN down…), the page keeps working without it.

function idle() {
  return new Promise((resolve) =>
    'requestIdleCallback' in window ? window.requestIdleCallback(resolve, { timeout: 2000 }) : setTimeout(resolve, 800),
  );
}

const EFFECTS = {
  neural: () => import('./neural.js').then((module) => module.startNeural()),
  depth: () => import('./depth.js').then((module) => module.startDepth()),
  map: (edition) => import('./map3d.js').then((module) => module.startMap(edition)),
  // Nothing shows until an AI is selected, so the logo can wait for an idle moment.
  logo: (edition) => idle().then(() => import('./logo3d.js')).then((module) => module.startLogo3d(edition)),
};

export async function startEffects({ edition }) {
  const names = Object.keys(EFFECTS);
  // Flags on <html> use `with-*` so they never collide with the effects' own element classes.
  document.documentElement.classList.add(...names.map((name) => `with-${name}`));
  await Promise.all(
    names.map((name) =>
      EFFECTS[name](edition).catch((error) => {
        console.warn(`[fx] ${name} unavailable:`, error);
        document.documentElement.classList.remove(`with-${name}`);
      }),
    ),
  );
}
