// "Mapa do dia": the edition as a living brain. Hundreds of points on a stylized brain surface are
// woven into a mesh; impulses wander along it and light up the points they reach. Each story is a
// neuron on that surface, in its section's region (news up front, market on top, findings at the
// back); the AIs sit deep inside and every story wires to the AIs it mentions. Particles drifting
// around the brain tether to it when they come close, so the background belongs to the network.
// Colors come from the section's --nm-* tokens, so the map follows the light and dark themes
// (bloom and additive light only in the dark one). Three.js is loaded on demand.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { cssVar, finePointer, lerp, onPaletteChange, reducedMotion, toRgb, watchVisibility } from './shared.js';

const CATEGORY_LABEL = { novidades: 'Novidades', mercado: 'Mercado', achados: 'Achados' };
// Where each section lives on the brain.
const REGIONS = { novidades: [0, 0.8, 3.4], mercado: [0, 2.9, 0], achados: [0, 0.6, -3.4] };
const LINK_DISTANCE = 1.2;
const NEIGHBORS = 3;
const WALKERS = 40;
const FLOATERS = 48;
const TETHER_DISTANCE = 2.6;
// Story → AI signals cross their link in about three seconds.
const SIGNAL_SPEED = 0.34;
// Impulses on the surface mesh, in scene units per second.
const IMPULSE_SPEED = 1.3;

function threeColor(css) {
  const [r, g, b] = toRgb(css);
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function logoMask(ai) {
  if (!ai.logo) return el('span', 'fx-map__dot');
  const icon = el('span', 'logo-mask');
  icon.style.webkitMaskImage = icon.style.maskImage = `url("logos/${encodeURIComponent(ai.logo)}.svg")`;
  return icon;
}

function buildSection() {
  const section = el('section', 'fx-map');
  section.setAttribute('aria-labelledby', 'fx-map-title');
  const head = el('div', 'fx-map__head');
  const pill = el('span', 'fx-map__pill', 'Mapa do dia');
  const title = el('h2', 'fx-map__title', 'Rede neural da edição');
  title.id = 'fx-map-title';
  const hint = el(
    'p',
    'fx-map__hint',
    finePointer.matches
      ? 'Cada neurônio aceso é uma notícia, ligado às IAs que ela cita, no centro. Arraste para girar; clique para ler.'
      : 'Cada neurônio aceso é uma notícia, ligado às IAs que ela cita, no centro. Toque para ler.',
  );
  head.append(pill, title, hint);
  const stage = el('div', 'fx-map__stage');
  const canvas = el('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const labels = el('div', 'fx-map__labels');
  const tip = el('div', 'fx-map__tip');
  tip.hidden = true;
  stage.append(canvas, labels, tip);
  const legend = el('div', 'fx-map__legend');
  for (const [key, label] of Object.entries(CATEGORY_LABEL)) legend.append(el('span', `cat cat--${key}`, label));
  legend.append(el('span', 'fx-map__legend-hub', 'IAs citadas'));
  section.append(head, stage, legend);
  // It sits right before "Filtrar por IA": clicking a hub selects that AI there.
  const filter = document.querySelector('#ai-filter');
  if (filter) filter.before(section);
  else document.querySelector('.front').after(section);
  return { section, stage, canvas, labels, tip };
}

/** Deterministic random numbers, so the brain looks the same on every visit. */
function seeded(seed) {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

function direction(random) {
  const y = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const ring = Math.sqrt(1 - y * y);
  return [ring * Math.cos(angle), y, ring * Math.sin(angle), angle];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Points on a stylized brain (front is +z): two folded hemispheres, the cerebellum and the stem. */
function brainPoints(random) {
  const points = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 250; i += 1) {
      let [x, y, z, angle] = direction(random);
      // Folds: small bumps all over the surface.
      const fold = 1 + 0.06 * Math.sin(8 * angle + 4 * y) * Math.cos(6 * y + 2 * z);
      x *= 2.1 * fold;
      y *= 2.4 * fold;
      z *= 4 * fold;
      if (x * side < 0) x *= 0.28; // flat inner wall between the hemispheres
      if (y < -0.8) y = -0.8 + (y + 0.8) * 0.5; // flatter base
      points.push([x + side * 0.72, y + 0.4, z]);
    }
  }
  for (let i = 0; i < 70; i += 1) {
    const [x, y, z] = direction(random);
    points.push([x * 1.9, y * 0.85 - 1.35, z * 1.15 - 2.9]);
  }
  for (let i = 0; i < 22; i += 1) {
    const t = random();
    const angle = random() * Math.PI * 2;
    points.push([Math.cos(angle) * 0.42, -1.2 - t * 2.1, Math.sin(angle) * 0.42 - 1.3 - t * 0.6]);
  }
  return points;
}

/** Each point joined to its nearest neighbors within reach, once per pair, plus who touches what. */
function weave(points) {
  const pairs = new Map();
  points.forEach((point, from) => {
    const near = [];
    points.forEach((other, to) => {
      if (to === from) return;
      const gap = distance(point, other);
      if (gap < LINK_DISTANCE) near.push([to, gap]);
    });
    near
      .sort((a, b) => a[1] - b[1])
      .slice(0, NEIGHBORS)
      .forEach(([to, gap]) => pairs.set(from < to ? `${from}:${to}` : `${to}:${from}`, [Math.min(from, to), Math.max(from, to), gap]));
  });
  const edges = [...pairs.values()];
  const touching = points.map(() => []);
  edges.forEach(([a, b], index) => {
    touching[a].push(index);
    touching[b].push(index);
  });
  return { edges, touching };
}

/** Stories take surface points in their section's region, alternating hemispheres; hubs go inside. */
function place(stories, ais, points) {
  const taken = [];
  const storyPoint = new Map();
  stories.forEach((story, index) => {
    const region = REGIONS[story.category] ?? [0, 0, 0];
    const target = [region[0] + (index % 2 ? 1.6 : -1.6), region[1], region[2]];
    const ranked = points.map((point, at) => [at, distance(point, target)]).sort((a, b) => a[1] - b[1]);
    const [at] = ranked.find(([candidate]) => taken.every((other) => distance(points[other], points[candidate]) > 0.95)) ?? ranked[0];
    taken.push(at);
    storyPoint.set(story.id, at);
  });
  const hubPosition = new Map(
    ais.map((ai, index) => {
      const angle = (index / Math.max(1, ais.length)) * Math.PI * 2;
      const reach = ais.length > 1 ? 1 : 0;
      return [ai.id, [Math.cos(angle) * 1.3 * reach, 0.6 + Math.sin(angle * 2) * 0.55 * reach, Math.sin(angle) * 2.8 * reach]];
    }),
  );
  return { storyPoint, hubPosition };
}

/** Linear luminance of a THREE.Color: how bright the card behind the network is. */
function luminance(color) {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

/** A soft glow (for light on dark) or, with `crisp`, a solid dot with a soft edge (for a light card). */
function haloTexture(crisp = false) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(crisp ? 0.55 : 0.35, crisp ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.35)');
  gradient.addColorStop(crisp ? 0.75 : 1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function goToStory(story) {
  const cards = [...document.querySelectorAll(`[data-story="${story.id}"]`)];
  const target = cards.find((card) => !card.hidden && card.offsetParent !== null);
  if (!target) {
    const url = story.sources?.[0]?.url;
    if (url) window.open(url, '_blank', 'noopener');
    return;
  }
  target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
  target.classList.remove('fx-flash');
  void target.offsetWidth;
  target.classList.add('fx-flash');
}

export function startMap(edition) {
  const stories = edition.stories ?? [];
  const ais = edition.ais ?? [];
  if (stories.length === 0) return;
  const { section, stage, canvas, labels, tip } = buildSection();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  // Seen from the side, the shape reads as a brain.
  camera.position.set(11, 1.8, 1);

  // Bloom makes the dark network glow; on a light card it would only wash it out.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.08, 0.32);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.rotateSpeed = 0.55;
  // Until the reader turns it, the brain sways around its side view; after that it spins slowly.
  let turned = false;
  const spinning = () => turned && !hovered && !reducedMotion.matches;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.4;
  controls.addEventListener('start', () => {
    turned = true;
  });
  controls.minPolarAngle = Math.PI * 0.25;
  controls.maxPolarAngle = Math.PI * 0.72;
  if (!finePointer.matches) {
    // On touch screens the page must keep scrolling over the map: no drag, taps still work.
    controls.enabled = false;
    canvas.style.touchAction = 'pan-y';
  }

  const random = seeded(7);
  const points = brainPoints(random);
  const { edges: web, touching } = weave(points);
  const { storyPoint, hubPosition } = place(stories, ais, points);
  const halo = haloTexture();
  const dot = haloTexture(true);
  const sprite = () => new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, transparent: true, depthWrite: false }));
  const brain = new THREE.Group();
  scene.add(brain);

  // Soft colored light behind the brain. It rides with the camera, so from any angle it stays
  // behind the brain as an aura instead of drifting across the view.
  scene.add(camera);
  const nebulae = [
    { at: [0, 0.2, -19], size: 11, token: 'glow-b' },
    { at: [4.5, 3, -22], size: 8, token: 'glow-a' },
  ].map(({ at, size, token }) => {
    const glow = sprite();
    glow.position.fromArray(at);
    glow.scale.setScalar(size);
    glow.userData.token = token;
    camera.add(glow);
    return glow;
  });

  // The brain surface: points that twinkle and flash when an impulse reaches them…
  const surfaceGeometry = new THREE.BufferGeometry();
  surfaceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  surfaceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(points.length * 4), 4));
  const surface = new THREE.Points(surfaceGeometry, new THREE.PointsMaterial({ map: halo, size: 0.16, vertexColors: true, transparent: true, depthWrite: false }));
  brain.add(surface);
  const twinkle = points.map(() => [random() * Math.PI * 2, 0.6 + random() * 1.8, random()]);
  const flash = new Float32Array(points.length);

  // …and the mesh between them.
  const meshGeometry = new THREE.BufferGeometry();
  meshGeometry.setAttribute('position', new THREE.Float32BufferAttribute(web.flatMap(([a, b]) => [...points[a], ...points[b]]), 3));
  meshGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(web.length * 8), 4));
  const mesh = new THREE.LineSegments(meshGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
  brain.add(mesh);

  // Impulses wandering the mesh, hopping from edge to edge.
  const impulses = Array.from({ length: WALKERS }, () => ({ edge: Math.floor(random() * web.length), forward: random() > 0.5, progress: random() }));
  const impulseGeometry = new THREE.BufferGeometry();
  impulseGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(WALKERS * 3), 3));
  const impulsePoints = new THREE.Points(impulseGeometry, new THREE.PointsMaterial({ map: halo, size: 0.34, transparent: true, depthWrite: false }));
  brain.add(impulsePoints);

  // Stories and AIs: a colored halo, a bright core and an invisible, larger target for the pointer.
  const target = new THREE.SphereGeometry(1, 12, 8);
  const nodes = [];
  const addNode = (entry, position, radius, glowSize, coreSize) => {
    const hit = new THREE.Mesh(target, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.fromArray(position);
    hit.scale.setScalar(radius);
    const glow = sprite();
    glow.position.fromArray(position);
    const core = sprite();
    core.position.fromArray(position);
    brain.add(hit, glow, core);
    const node = { ...entry, position, hit, glow, core, glowSize, coreSize, scale: 0, opacity: 1 };
    hit.userData.node = node;
    nodes.push(node);
    return node;
  };
  for (const story of stories) {
    const importance = story.importance ?? 3;
    addNode({ kind: 'story', id: story.id, story }, points[storyPoint.get(story.id)], 0.34, 0.55 + importance * 0.07, 0.15 + importance * 0.015);
  }
  for (const ai of ais) addNode({ kind: 'ai', id: ai.id, ai }, hubPosition.get(ai.id), 0.5, 1.3, 0.3);
  const nodeById = new Map(nodes.map((node) => [`${node.kind}:${node.id}`, node]));

  // Story → AI wiring, one set per AI so a selected AI can light up its own, with signals on it.
  const byAi = new Map();
  for (const story of stories) {
    for (const aiId of story.ais ?? []) {
      if (!nodeById.has(`ai:${aiId}`)) continue;
      if (!byAi.has(aiId)) byAi.set(aiId, []);
      byAi.get(aiId).push([nodeById.get(`story:${story.id}`), nodeById.get(`ai:${aiId}`)]);
    }
  }
  const wiring = [...byAi.entries()].map(([aiId, links]) => {
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(links.flatMap(([from, to]) => [...from.position, ...to.position]), 3));
    lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(links.length * 6), 3));
    const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
    const signalGeometry = new THREE.BufferGeometry();
    signalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(links.length * 3), 3));
    const signals = new THREE.Points(signalGeometry, new THREE.PointsMaterial({ map: halo, size: 0.42, transparent: true, opacity: 0, depthWrite: false }));
    brain.add(lines, signals);
    return { aiId, links, lines, signals, phases: links.map((_, index) => (index * 0.618) % 1), opacity: 0 };
  });

  // Particles drifting around the brain, tethered to its nearest points when they come close.
  const floaters = Array.from({ length: FLOATERS }, () => {
    const [x, y, z] = direction(random);
    const reach = 5.4 + random() * 2.8;
    return { home: [x * reach, y * reach * 0.75, z * reach], phase: random() * Math.PI * 2, pace: 0.12 + random() * 0.22, at: [0, 0, 0] };
  });
  const floaterGeometry = new THREE.BufferGeometry();
  floaterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(FLOATERS * 3), 3));
  const floaterPoints = new THREE.Points(floaterGeometry, new THREE.PointsMaterial({ map: halo, size: 0.3, transparent: true, depthWrite: false }));
  const tetherGeometry = new THREE.BufferGeometry();
  tetherGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(FLOATERS * 2 * 6), 3));
  tetherGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(FLOATERS * 2 * 8), 4));
  const tethers = new THREE.LineSegments(tetherGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  brain.add(floaterPoints, tethers);

  // Far star field.
  const dustPoints = [];
  for (let i = 0; i < 520; i += 1) {
    const [x, y, z] = direction(random);
    const reach = 11 + random() * 9;
    dustPoints.push(x * reach, y * reach * 0.7, z * reach);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPoints, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ size: 0.05, transparent: true, depthWrite: false }));
  scene.add(dust);

  // HTML labels for the AI hubs, hidden until the first frame places them.
  const hubLabels = nodes
    .filter((node) => node.kind === 'ai')
    .map((node) => {
      const label = el('span', 'fx-map__label');
      label.style.setProperty('--ai', node.ai.color);
      label.style.opacity = '0';
      label.append(logoMask(node.ai), document.createTextNode(`${node.ai.label} · ${node.ai.count}`));
      labels.append(label);
      return { node, label };
    });

  let selectedAi = document.documentElement.dataset.ai ?? null;
  let dark = true;
  let tint = null; // surface and tether colors, per point
  const applyPalette = () => {
    const token = (name) => threeColor(cssVar(`--nm-${name}`, section));
    const card = token('card');
    dark = luminance(card) < 0.2;
    const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    const white = new THREE.Color(1, 1, 1);
    const link = token('link');
    const synapse = token('synapse');
    const categories = Object.fromEntries(Object.keys(CATEGORY_LABEL).map((key) => [key, token(key)]));

    // As the scene background (not the clear color) it gets the right color space through the composer.
    scene.background = card;
    bloom.enabled = dark;
    for (const glow of nebulae) {
      glow.material.color.copy(token(glow.userData.token));
      glow.material.blending = blending;
      glow.material.opacity = dark ? 0.22 : 0;
    }

    // The surface shades from violet at the base to pink at the crown; a few points run white-hot.
    tint = points.map((point, index) => {
      const shade = synapse.clone().lerp(link, Math.min(1, Math.max(0, (point[1] + 1.6) / 4.6)));
      return dark && twinkle[index][2] > 0.86 ? shade.lerp(white, 0.6) : shade;
    });
    const meshColors = meshGeometry.getAttribute('color');
    web.forEach(([a, b, gap], index) => {
      const alpha = (1 - gap / LINK_DISTANCE) * 0.75 + 0.25;
      meshColors.setXYZW(index * 2, tint[a].r, tint[a].g, tint[a].b, alpha);
      meshColors.setXYZW(index * 2 + 1, tint[b].r, tint[b].g, tint[b].b, alpha);
    });
    meshColors.needsUpdate = true;
    for (const layer of [surface, mesh, impulsePoints, floaterPoints, tethers, dust]) layer.material.blending = blending;
    impulsePoints.material.color.copy(dark ? token('pulse').lerp(white, 0.4) : link);
    // On a light card soft glows turn into smudges: points and cores become crisp dots.
    for (const material of [surface.material, impulsePoints.material, ...nodes.map((node) => node.core.material)]) {
      material.map = dark ? halo : dot;
      material.needsUpdate = true;
    }
    surface.material.size = dark ? 0.16 : 0.13;
    floaterPoints.material.color.copy(dark ? token('star') : synapse);
    dust.material.color.copy(token('star'));
    dust.material.opacity = dark ? 0.5 : 0.35;

    for (const node of nodes) {
      const base = node.kind === 'ai' ? threeColor(node.ai.color) : categories[node.story.category] ?? link;
      node.base = base;
      // Dark: a white-hot core in a colored halo. Light: a solid core in a soft tint.
      node.core.material.color.copy(dark ? base.clone().lerp(white, 0.65) : base);
      node.glow.material.color.copy(base);
      node.core.material.blending = node.glow.material.blending = blending;
      node.glowOpacity = dark ? 0.55 : 0.5;
    }
    for (const group of wiring) {
      const colors = group.lines.geometry.getAttribute('color');
      group.links.forEach(([from, to], index) => {
        colors.setXYZ(index * 2, from.base.r, from.base.g, from.base.b);
        colors.setXYZ(index * 2 + 1, to.base.r, to.base.g, to.base.b);
      });
      colors.needsUpdate = true;
      group.lines.material.blending = group.signals.material.blending = blending;
      group.signals.material.color.copy(dark ? token('pulse').lerp(white, 0.3) : link);
    }
    selectedAi = document.documentElement.dataset.ai ?? null;
  };
  applyPalette();
  onPaletteChange(applyPalette);

  const resize = () => {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    // Narrow stages (phones) need the camera further back so the brain fits sideways.
    camera.position.setLength(Math.max(11, 14 / camera.aspect));
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  // Hover, tooltip and click.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(2, 2);
  let hovered = null;
  let downAt = null;
  const targets = nodes.map((node) => node.hit);

  const pick = () => {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(targets, false)[0];
    return hit ? hit.object.userData.node : null;
  };
  const showTip = (node, x, y) => {
    tip.replaceChildren();
    if (node.kind === 'ai') {
      tip.append(el('b', null, node.ai.maker), document.createTextNode(`${node.ai.label}: ${node.ai.count} notícias. Clique para filtrar.`));
    } else {
      tip.append(el('b', null, CATEGORY_LABEL[node.story.category] ?? node.story.category), document.createTextNode(node.story.title));
    }
    tip.hidden = false;
    const maxX = stage.clientWidth - tip.offsetWidth - 16;
    tip.style.transform = `translate(${Math.min(x, maxX)}px, ${y}px)`;
  };

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    hovered = pick();
    canvas.style.cursor = hovered ? 'pointer' : finePointer.matches ? 'grab' : '';
    if (hovered) showTip(hovered, event.clientX - rect.left, event.clientY - rect.top);
    else tip.hidden = true;
    controls.autoRotate = spinning();
  });
  canvas.addEventListener('pointerleave', () => {
    hovered = null;
    tip.hidden = true;
    pointer.set(2, 2);
    controls.autoRotate = spinning();
  });
  canvas.addEventListener('pointerdown', (event) => {
    downAt = [event.clientX, event.clientY];
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 6) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const node = pick();
    if (!node) return;
    if (node.kind === 'ai') document.querySelector(`.ai-card[data-ai="${node.id}"]`)?.click();
    else goToStory(node.story);
  });

  // Render loop, only while the map is on screen.
  let visible = false;
  let running = false;
  let enteredAt = null;
  let last = performance.now();
  const projected = new THREE.Vector3();
  const world = new THREE.Vector3();
  const orbit = new THREE.Spherical();

  const moveImpulses = (step) => {
    const positions = impulseGeometry.getAttribute('position');
    impulses.forEach((impulse, index) => {
      let [a, b, gap] = web[impulse.edge];
      impulse.progress += (step * IMPULSE_SPEED) / Math.max(0.2, gap);
      if (impulse.progress >= 1) {
        const arrived = impulse.forward ? b : a;
        flash[arrived] = 1;
        const choices = touching[arrived].filter((edge) => edge !== impulse.edge);
        impulse.edge = choices.length ? choices[Math.floor(Math.random() * choices.length)] : impulse.edge;
        impulse.forward = web[impulse.edge][0] === arrived;
        impulse.progress = 0;
        [a, b] = web[impulse.edge];
      }
      const [from, to] = impulse.forward ? [points[a], points[b]] : [points[b], points[a]];
      const t = impulse.progress;
      positions.setXYZ(index, lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t));
    });
    positions.needsUpdate = true;
  };

  const moveFloaters = (seconds, fade) => {
    const positions = floaterGeometry.getAttribute('position');
    const ends = tetherGeometry.getAttribute('position');
    const colors = tetherGeometry.getAttribute('color');
    let count = 0;
    floaters.forEach((floater, index) => {
      const t = seconds * floater.pace + floater.phase;
      floater.at = [floater.home[0] + Math.sin(t) * 0.8, floater.home[1] + Math.cos(t * 0.8) * 0.5, floater.home[2] + Math.sin(t * 0.6 + 1) * 0.8];
      positions.setXYZ(index, ...floater.at);
      // The two closest brain points within reach.
      let first = [-1, TETHER_DISTANCE];
      let second = [-1, TETHER_DISTANCE];
      for (let i = 0; i < points.length; i += 1) {
        const gap = distance(floater.at, points[i]);
        if (gap < first[1]) [second, first] = [first, [i, gap]];
        else if (gap < second[1]) second = [i, gap];
      }
      for (const [at, gap] of [first, second]) {
        if (at < 0) continue;
        const alpha = (1 - gap / TETHER_DISTANCE) * 0.8 * fade;
        const color = tint[at];
        ends.setXYZ(count * 2, ...floater.at);
        ends.setXYZ(count * 2 + 1, ...points[at]);
        colors.setXYZW(count * 2, color.r, color.g, color.b, alpha * 0.4);
        colors.setXYZW(count * 2 + 1, color.r, color.g, color.b, alpha);
        count += 1;
      }
    });
    positions.needsUpdate = ends.needsUpdate = colors.needsUpdate = true;
    tetherGeometry.setDrawRange(0, count * 2);
  };

  const frame = () => {
    if (!visible || document.hidden) {
      running = false;
      return;
    }
    const now = performance.now();
    const step = Math.min(0.05, (now - last) / 1000);
    last = now;
    const seconds = now / 1000;
    const moving = !reducedMotion.matches;
    if (moving && !turned && !hovered) {
      // Sway around the side view (azimuth π/2 looks along +x).
      orbit.setFromVector3(camera.position.clone().sub(controls.target));
      orbit.theta = Math.PI / 2 + Math.sin(seconds * 0.17) * 0.75;
      camera.position.setFromSpherical(orbit).add(controls.target);
    }
    controls.update();
    // The brain fades in over a second and a half after it first comes into view.
    const appear = Math.min(1, (now - enteredAt) / 1500);
    const dim = selectedAi ? 0.35 : 1;

    // Surface: twinkle plus the flash of arriving impulses.
    const surfaceColors = surfaceGeometry.getAttribute('color');
    for (let i = 0; i < points.length; i += 1) {
      const glimmer = moving ? 0.5 + 0.5 * Math.sin(seconds * twinkle[i][1] + twinkle[i][0]) : 0.75;
      flash[i] *= 0.93;
      const alpha = Math.min(1, 0.25 + glimmer * 0.5 + flash[i]) * appear * dim;
      surfaceColors.setXYZW(i, tint[i].r, tint[i].g, tint[i].b, alpha);
    }
    surfaceColors.needsUpdate = true;
    mesh.material.opacity = (dark ? 0.55 : 0.85) * appear * dim;
    impulsePoints.visible = moving;
    if (moving) moveImpulses(step);
    impulsePoints.material.opacity = appear * dim;
    moveFloaters(moving ? seconds : 0, appear * dim);
    floaterPoints.material.opacity = (dark ? 0.8 : 0.6) * appear;
    brain.scale.setScalar(moving ? 1 + Math.sin(seconds * 0.9) * 0.012 : 1);

    nodes.forEach((node, index) => {
      const linked = !selectedAi || (node.kind === 'ai' ? node.id === selectedAi : node.story.ais?.includes(selectedAi));
      const ready = now - enteredAt > index * 30;
      const boost = node === hovered ? 1.4 : 1;
      node.scale = lerp(node.scale, ready ? boost * (linked ? 1 : 0.7) : 0, 0.1);
      node.opacity = lerp(node.opacity, linked ? 1 : 0.2, 0.1);
      const breath = moving ? 1 + Math.sin(seconds * (node.kind === 'ai' ? 1.4 : 2.2) + index) * 0.1 : 1;
      node.glow.scale.setScalar(Math.max(0.0001, node.glowSize * node.scale * breath));
      node.core.scale.setScalar(Math.max(0.0001, node.coreSize * node.scale));
      node.glow.material.opacity = node.glowOpacity * node.opacity;
      node.core.material.opacity = node.opacity;
    });

    for (const group of wiring) {
      const active = !selectedAi || group.aiId === selectedAi;
      const goal = (selectedAi ? (active ? 0.95 : 0.04) : dark ? 0.5 : 0.55) * appear;
      group.opacity = lerp(group.opacity, goal, 0.08);
      group.lines.material.opacity = group.opacity;
      group.signals.visible = moving;
      if (!moving) continue;
      const signal = group.signals.geometry.getAttribute('position');
      group.links.forEach(([from, to], index) => {
        const t = (seconds * SIGNAL_SPEED + group.phases[index]) % 1;
        signal.setXYZ(index, lerp(from.position[0], to.position[0], t), lerp(from.position[1], to.position[1], t), lerp(from.position[2], to.position[2], t));
      });
      signal.needsUpdate = true;
      group.signals.material.opacity = Math.min(1, group.opacity * 1.8);
    }
    if (moving) dust.rotation.y += 0.0004;

    const { width, height } = stage.getBoundingClientRect();
    for (const { node, label } of hubLabels) {
      node.hit.getWorldPosition(world);
      projected.copy(world).project(camera);
      const behind = projected.z > 1;
      label.style.transform = `translate(${((projected.x + 1) / 2) * width}px, ${((1 - projected.y) / 2) * height}px)`;
      const faded = selectedAi && node.id !== selectedAi;
      label.style.opacity = behind ? 0 : faded ? 0.35 : Math.min(1, node.scale);
    }
    composer.render();
    requestAnimationFrame(frame);
  };

  const wake = () => {
    if (running || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  };
  watchVisibility(stage, (isVisible) => {
    visible = isVisible;
    if (isVisible && enteredAt === null) enteredAt = performance.now();
    wake();
  });
  document.addEventListener('visibilitychange', wake);
}
