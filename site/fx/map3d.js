// "Mapa do dia": the edition as a glowing neural network. Stories are nodes colored by category and
// grouped by it; AIs are larger hubs; each story links to the AIs it mentions and signals run along
// those links; faint synapses join nearby stories. Colors come from the section's --nm-* tokens, so
// the map follows the light and dark themes (bloom and additive light only in the dark one).
// Three.js is loaded on demand.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { cssVar, finePointer, lerp, onPaletteChange, reducedMotion, toRgb, watchVisibility } from './shared.js';

const CATEGORY_LABEL = { novidades: 'Novidades', mercado: 'Mercado', achados: 'Achados' };
const ANCHORS = { novidades: [-4.2, 1.4, 0.6], mercado: [4.2, 1.2, -0.4], achados: [0, -3.6, 1.2] };
const SYNAPSES_PER_STORY = 3;
// Signals cross a link in about four seconds.
const SIGNAL_SPEED = 0.24;

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
      ? 'Cada ponto é uma notícia, ligada às IAs que ela cita; os sinais correm por essas ligações. Arraste para girar; clique para ler.'
      : 'Cada ponto é uma notícia, ligada às IAs que ela cita; os sinais correm por essas ligações. Toque para ler.',
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

/** Small deterministic force layout: repulsion, springs story→AI, pull toward the category anchor. */
function layout(stories, ais) {
  const nodes = [
    ...ais.map((ai) => ({ kind: 'ai', id: ai.id, ai, mass: 2.5 })),
    ...stories.map((story) => ({ kind: 'story', id: story.id, story, mass: 1 })),
  ];
  const indexOf = new Map(nodes.map((node, index) => [`${node.kind}:${node.id}`, index]));
  const edges = [];
  for (const story of stories) {
    for (const aiId of story.ais ?? []) {
      if (indexOf.has(`ai:${aiId}`)) edges.push({ from: indexOf.get(`story:${story.id}`), to: indexOf.get(`ai:${aiId}`), ai: aiId });
    }
  }

  // AI hubs sit on an upright ring facing the camera, so their labels spread out on screen.
  const hubAnchor = new Map(
    ais.map((ai, index) => {
      const angle = (index / Math.max(1, ais.length)) * Math.PI * 2 + Math.PI / 2;
      return [ai.id, [Math.cos(angle) * 4.6, Math.sin(angle) * 3, index % 2 ? 1 : -1]];
    }),
  );
  const anchorOf = (node) => (node.kind === 'story' ? ANCHORS[node.story.category] ?? [0, 0, 0] : hubAnchor.get(node.id));

  let seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const position = nodes.map((node) => anchorOf(node).map((value) => value + random() * 4));
  const velocity = nodes.map(() => [0, 0, 0]);

  for (let step = 0; step < 420; step += 1) {
    const cooling = 1 - step / 420;
    const force = nodes.map(() => [0, 0, 0]);
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const delta = [0, 1, 2].map((axis) => position[i][axis] - position[j][axis]);
        const distanceSq = Math.max(0.04, delta[0] ** 2 + delta[1] ** 2 + delta[2] ** 2);
        const push = 2.4 / distanceSq;
        const distance = Math.sqrt(distanceSq);
        for (let axis = 0; axis < 3; axis += 1) {
          force[i][axis] += (delta[axis] / distance) * push;
          force[j][axis] -= (delta[axis] / distance) * push;
        }
      }
    }
    for (const edge of edges) {
      const delta = [0, 1, 2].map((axis) => position[edge.to][axis] - position[edge.from][axis]);
      const distance = Math.max(0.01, Math.hypot(...delta));
      const pull = (distance - 2.6) * 0.07;
      for (let axis = 0; axis < 3; axis += 1) {
        force[edge.from][axis] += (delta[axis] / distance) * pull;
        force[edge.to][axis] -= (delta[axis] / distance) * pull;
      }
    }
    nodes.forEach((node, index) => {
      const anchor = anchorOf(node);
      // Hubs hold their ring; linked stories follow their AIs, loose ones stay near their category.
      const strength = node.kind === 'ai' ? 0.08 : node.story.ais?.length ? 0.012 : 0.05;
      for (let axis = 0; axis < 3; axis += 1) {
        force[index][axis] += (anchor[axis] - position[index][axis]) * strength;
        velocity[index][axis] = (velocity[index][axis] + force[index][axis] / node.mass) * 0.82;
        position[index][axis] += velocity[index][axis] * cooling;
      }
    });
  }
  // Fit everything inside a sphere of radius 6.5 around the center of mass.
  const center = [0, 1, 2].map((axis) => position.reduce((sum, point) => sum + point[axis], 0) / position.length);
  const radius = Math.max(...position.map((point) => Math.hypot(...point.map((value, axis) => value - center[axis]))));
  const fit = 6.5 / Math.max(radius, 0.001);
  for (const point of position) for (let axis = 0; axis < 3; axis += 1) point[axis] = (point[axis] - center[axis]) * fit;
  return { nodes, edges, position };
}

/** Pairs of story nodes joined by a synapse: each story to its nearest neighbors, once per pair. */
function synapses(nodes, position) {
  const stories = nodes.flatMap((node, index) => (node.kind === 'story' ? [index] : []));
  const pairs = new Map();
  for (const from of stories) {
    const nearest = stories
      .filter((to) => to !== from)
      .map((to) => [to, Math.hypot(...position[from].map((value, axis) => value - position[to][axis]))])
      .sort((a, b) => a[1] - b[1])
      .slice(0, SYNAPSES_PER_STORY);
    for (const [to] of nearest) pairs.set(from < to ? `${from}:${to}` : `${to}:${from}`, [from, to]);
  }
  return [...pairs.values()];
}

/** Linear luminance of a THREE.Color: how bright the card behind the network is. */
function luminance(color) {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function haloTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
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
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 2, 15.5);

  // Bloom makes the dark network glow; on a light card it would only wash it out.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.4, 0.22);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.rotateSpeed = 0.55;
  controls.autoRotate = !reducedMotion.matches;
  controls.autoRotateSpeed = 0.7;
  controls.minPolarAngle = Math.PI * 0.2;
  controls.maxPolarAngle = Math.PI * 0.8;
  if (!finePointer.matches) {
    // On touch screens the page must keep scrolling over the map: no drag, taps still work.
    controls.enabled = false;
    canvas.style.touchAction = 'pan-y';
  }

  const { nodes, edges, position } = layout(stories, ais);
  const halo = haloTexture();
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const sprite = () => new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, transparent: true, depthWrite: false }));

  // Soft colored light far behind the network.
  const nebulae = [
    { at: [7, 4.5, -7], size: 24, token: 'glow-a' },
    { at: [-8, -4, -6], size: 22, token: 'glow-b' },
  ].map(({ at, size, token }) => {
    const glow = sprite();
    glow.position.fromArray(at);
    glow.scale.setScalar(size);
    glow.userData.token = token;
    scene.add(glow);
    return glow;
  });

  const nodeObjects = nodes.map((node, index) => {
    const radius = node.kind === 'ai' ? 0.36 : 0.1 + (node.story.importance ?? 3) * 0.035;
    const mesh = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ transparent: true }));
    mesh.position.fromArray(position[index]);
    mesh.userData = { node, radius, scale: 0, targetScale: 1, opacity: 1, glowOpacity: 0.8 };
    mesh.scale.setScalar(0.0001);
    // The halo is a child, so it grows with the node: its size is relative to the node's radius.
    const glow = sprite();
    glow.userData.size = node.kind === 'ai' ? 5 : 4.2;
    glow.scale.setScalar(glow.userData.size);
    mesh.add(glow);
    scene.add(mesh);
    return { mesh, glow };
  });

  // Faint synapses between nearby stories make the graph read as a network.
  const synapsePairs = synapses(nodes, position);
  const synapseGeometry = new THREE.BufferGeometry();
  synapseGeometry.setAttribute('position', new THREE.Float32BufferAttribute(synapsePairs.flatMap(([from, to]) => [...position[from], ...position[to]]), 3));
  const synapseLines = new THREE.LineSegments(synapseGeometry, new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  synapseLines.userData.opacity = 0;
  scene.add(synapseLines);

  // Links and signals, one set per AI so a selected AI can light up its own.
  const byAi = new Map();
  for (const edge of edges) {
    if (!byAi.has(edge.ai)) byAi.set(edge.ai, []);
    byAi.get(edge.ai).push(edge);
  }
  const linkGroups = [...byAi.entries()].map(([aiId, group]) => {
    const points = group.flatMap((edge) => [...position[edge.from], ...position[edge.to]]);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(points.length), 3));
    const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(lines);
    const signalGeometry = new THREE.BufferGeometry();
    signalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(group.length * 3), 3));
    const signals = new THREE.Points(signalGeometry, new THREE.PointsMaterial({ map: halo, size: 0.45, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(signals);
    // Each signal starts somewhere along its link so they don't move in lockstep.
    return { aiId, edges: group, lines, signals, phases: group.map((_, index) => (index * 0.618) % 1), opacity: 0 };
  });

  // Star field in two layers: fine dust and a few brighter sparks that twinkle.
  const starLayer = (count, size, map) => {
    const points = [];
    for (let i = 0; i < count; i += 1) {
      const radius = 9 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      points.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi) * 0.7, radius * Math.sin(phi) * Math.sin(theta));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const layer = new THREE.Points(geometry, new THREE.PointsMaterial({ size, map, transparent: true, depthWrite: false }));
    scene.add(layer);
    return layer;
  };
  const dust = starLayer(620, 0.04, null);
  const sparks = starLayer(90, 0.28, halo);

  // HTML labels for the AI hubs.
  const hubLabels = nodeObjects
    .filter(({ mesh }) => mesh.userData.node.kind === 'ai')
    .map(({ mesh }) => {
      const ai = mesh.userData.node.ai;
      const label = el('span', 'fx-map__label');
      label.style.setProperty('--ai', ai.color);
      // Hidden until the first frame places it next to its hub.
      label.style.opacity = '0';
      label.append(logoMask(ai), document.createTextNode(`${ai.label} · ${ai.count}`));
      labels.append(label);
      return { mesh, label };
    });

  let selectedAi = document.documentElement.dataset.ai ?? null;
  let dark = true;
  const applyPalette = () => {
    const token = (name) => threeColor(cssVar(`--nm-${name}`, section));
    const card = token('card');
    dark = luminance(card) < 0.2;
    const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    const white = new THREE.Color(1, 1, 1);
    const link = token('link');
    const categories = Object.fromEntries(Object.keys(CATEGORY_LABEL).map((key) => [key, token(key)]));

    renderer.setClearColor(card, 1);
    bloom.enabled = dark;
    for (const glow of nebulae) {
      glow.material.color.copy(token(glow.userData.token));
      glow.material.blending = blending;
      glow.material.opacity = dark ? 0.08 : 0.4;
    }
    for (const { mesh, glow } of nodeObjects) {
      const { node } = mesh.userData;
      const base = node.kind === 'ai' ? threeColor(node.ai.color) : categories[node.story.category] ?? link;
      mesh.userData.base = base;
      // Dark: a white-hot core inside a colored halo. Light: solid color with a soft tint around it.
      mesh.material.color.copy(dark ? base.clone().lerp(white, node.kind === 'ai' ? 0.2 : 0.3) : base);
      glow.material.color.copy(base);
      glow.material.blending = blending;
      mesh.userData.glowOpacity = dark ? 0.5 : 0.6;
      // Without additive light the halo has to be wider to read as a glow.
      glow.userData.size = node.kind === 'ai' ? (dark ? 5 : 6.5) : dark ? 4.2 : 5.6;
    }
    for (const group of linkGroups) {
      const colors = group.lines.geometry.getAttribute('color');
      group.edges.forEach((edge, index) => {
        const from = nodeObjects[edge.from].mesh.userData.base;
        colors.setXYZ(index * 2, from.r, from.g, from.b);
        colors.setXYZ(index * 2 + 1, link.r, link.g, link.b);
      });
      colors.needsUpdate = true;
      group.lines.material.blending = blending;
      group.signals.material.color.copy(token('pulse'));
      group.signals.material.blending = blending;
    }
    synapseLines.material.color.copy(token('synapse'));
    synapseLines.material.blending = blending;
    for (const layer of [dust, sparks]) {
      layer.material.color.copy(token('star'));
      layer.material.blending = blending;
    }
    dust.material.opacity = dark ? 0.45 : 0.35;
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
    // Narrow stages (phones) need the camera further back so the graph fits sideways.
    camera.position.setLength(Math.max(15.5, 20 / camera.aspect));
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  // Hover, tooltip and click.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(2, 2);
  let hovered = null;
  let downAt = null;
  const meshes = nodeObjects.map(({ mesh }) => mesh);

  const pick = () => {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return hit ? hit.object : null;
  };
  const showTip = (mesh, x, y) => {
    const { node } = mesh.userData;
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
    controls.autoRotate = !hovered && !reducedMotion.matches;
  });
  canvas.addEventListener('pointerleave', () => {
    hovered = null;
    tip.hidden = true;
    pointer.set(2, 2);
    controls.autoRotate = !reducedMotion.matches;
  });
  canvas.addEventListener('pointerdown', (event) => {
    downAt = [event.clientX, event.clientY];
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 6) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const target = pick();
    if (!target) return;
    const { node } = target.userData;
    if (node.kind === 'ai') document.querySelector(`.ai-card[data-ai="${node.id}"]`)?.click();
    else goToStory(node.story);
  });

  // Render loop, only while the map is on screen.
  let visible = false;
  let running = false;
  let entered = false;
  const projected = new THREE.Vector3();

  const frame = () => {
    if (!visible || document.hidden) {
      running = false;
      return;
    }
    controls.update();
    const now = performance.now();
    const seconds = now / 1000;
    const moving = !reducedMotion.matches;

    nodeObjects.forEach(({ mesh, glow }, index) => {
      const data = mesh.userData;
      const { node } = data;
      const linked = !selectedAi || (node.kind === 'ai' ? node.id === selectedAi : node.story.ais?.includes(selectedAi));
      const delay = entered ? 0 : index * 25;
      const ready = now - data.enteredAt > delay;
      const hoverBoost = mesh === hovered ? 1.45 : 1;
      data.scale = lerp(data.scale, ready ? data.targetScale * hoverBoost * (linked ? 1 : 0.7) : 0, 0.12);
      data.opacity = lerp(data.opacity, linked ? 1 : 0.18, 0.1);
      mesh.scale.setScalar(Math.max(0.0001, data.radius * data.scale));
      mesh.material.opacity = data.opacity;
      // Hubs breathe.
      const breath = node.kind === 'ai' && moving ? 1 + Math.sin(seconds * 1.6 + index) * 0.14 : 1;
      glow.scale.setScalar(glow.userData.size * breath);
      glow.material.opacity = data.glowOpacity * data.opacity;
    });

    for (const group of linkGroups) {
      const active = !selectedAi || group.aiId === selectedAi;
      const goal = selectedAi ? (active ? 0.95 : 0.05) : dark ? 0.65 : 0.75;
      group.opacity = lerp(group.opacity, goal, 0.06);
      group.lines.material.opacity = group.opacity;
      group.signals.visible = moving;
      if (!moving) continue;
      const signal = group.signals.geometry.getAttribute('position');
      group.edges.forEach((edge, index) => {
        const t = (seconds * SIGNAL_SPEED + group.phases[index]) % 1;
        const from = position[edge.from];
        const to = position[edge.to];
        signal.setXYZ(index, lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t));
      });
      signal.needsUpdate = true;
      group.signals.material.opacity = Math.min(1, group.opacity * 1.8);
    }

    synapseLines.userData.opacity = lerp(synapseLines.userData.opacity, selectedAi ? 0.05 : dark ? 0.28 : 0.4, 0.06);
    synapseLines.material.opacity = synapseLines.userData.opacity;
    if (moving) {
      dust.rotation.y += 0.0005;
      sparks.rotation.y = dust.rotation.y;
      sparks.material.opacity = (dark ? 0.85 : 0.5) * (0.7 + Math.sin(seconds * 2.2) * 0.3);
    } else {
      sparks.material.opacity = dark ? 0.85 : 0.5;
    }

    const { width, height } = stage.getBoundingClientRect();
    for (const { mesh, label } of hubLabels) {
      projected.copy(mesh.position).project(camera);
      const behind = projected.z > 1;
      label.style.transform = `translate(${((projected.x + 1) / 2) * width}px, ${((1 - projected.y) / 2) * height}px)`;
      const dim = selectedAi && mesh.userData.node.id !== selectedAi;
      label.style.opacity = behind ? 0 : dim ? 0.35 : Math.min(1, mesh.userData.scale);
    }
    composer.render();
    requestAnimationFrame(frame);
  };

  const wake = () => {
    if (running || !visible || document.hidden) return;
    running = true;
    requestAnimationFrame(frame);
  };
  watchVisibility(stage, (isVisible) => {
    visible = isVisible;
    if (isVisible && !entered) {
      const start = performance.now();
      for (const { mesh } of nodeObjects) mesh.userData.enteredAt = start;
      setTimeout(() => (entered = true), nodes.length * 25 + 400);
    }
    wake();
  });
  document.addEventListener('visibilitychange', wake);
}
