// "Mapa do dia": a 3D graph of the edition. Stories are dots colored by category and grouped by it;
// AIs are larger hubs; each story links to the AIs it mentions. Three.js is loaded on demand.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cssVar, finePointer, isDarkTheme, lerp, onPaletteChange, reducedMotion, toRgb, watchVisibility } from './shared.js';

const CATEGORY_LABEL = { novidades: 'Novidades', mercado: 'Mercado', achados: 'Achados' };
const ANCHORS = { novidades: [-4.2, 1.4, 0.6], mercado: [4.2, 1.2, -0.4], achados: [0, -3.6, 1.2] };

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
  const title = el('h2', 'section-label', 'Mapa do dia');
  title.id = 'fx-map-title';
  const hint = el(
    'p',
    'fx-map__hint',
    finePointer.matches ? 'Cada ponto é uma notícia, ligada às IAs que ela cita. Arraste para girar; clique para ler.' : 'Cada ponto é uma notícia, ligada às IAs que ela cita. Toque para ler.',
  );
  head.append(title, hint);
  const stage = el('div', 'fx-map__stage');
  const canvas = el('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const labels = el('div', 'fx-map__labels');
  const tip = el('div', 'fx-map__tip');
  tip.hidden = true;
  stage.append(canvas, labels, tip);
  const legend = el('div', 'fx-map__legend');
  for (const [key, label] of Object.entries(CATEGORY_LABEL)) {
    const item = el('span', `cat cat--${key}`, label);
    legend.append(item);
  }
  section.append(head, stage, legend);
  document.querySelector('.front').after(section);
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
  const { stage, canvas, labels, tip } = buildSection();

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 2, 15.5);

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
  const sphere = new THREE.SphereGeometry(1, 28, 18);
  const aiById = new Map(ais.map((ai) => [ai.id, ai]));

  const nodeObjects = nodes.map((node, index) => {
    const radius = node.kind === 'ai' ? 0.5 : 0.16 + (node.story.importance ?? 3) * 0.045;
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    const mesh = new THREE.Mesh(sphere, material);
    mesh.position.fromArray(position[index]);
    mesh.userData = { node, radius, scale: 0, targetScale: 1, opacity: 1 };
    mesh.scale.setScalar(0.0001);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, transparent: true, depthWrite: false }));
    glow.scale.setScalar(radius * (node.kind === 'ai' ? 7 : 6));
    mesh.add(glow);
    scene.add(mesh);
    return { mesh, glow };
  });

  // One line set per AI, drawn in that AI's color.
  const lineGroups = new Map();
  for (const edge of edges) {
    if (!lineGroups.has(edge.ai)) lineGroups.set(edge.ai, []);
    lineGroups.get(edge.ai).push(...position[edge.from], ...position[edge.to]);
  }
  const lines = [...lineGroups.entries()].map(([aiId, points]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({ transparent: true, opacity: 0 });
    const segments = new THREE.LineSegments(geometry, material);
    segments.userData = { aiId, opacity: 0 };
    scene.add(segments);
    return segments;
  });

  // Dust for depth.
  const dustPositions = [];
  for (let i = 0; i < 420; i += 1) {
    const radius = 9 + Math.random() * 9;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dustPositions.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi) * 0.7, radius * Math.sin(phi) * Math.sin(theta));
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ size: 0.06, transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(dust);

  // HTML labels for the AI hubs.
  const hubLabels = nodeObjects
    .filter(({ mesh }) => mesh.userData.node.kind === 'ai')
    .map(({ mesh }) => {
      const ai = mesh.userData.node.ai;
      const label = el('span', 'fx-map__label');
      label.style.setProperty('--ai', ai.color);
      label.append(logoMask(ai), document.createTextNode(`${ai.label} · ${ai.count}`));
      labels.append(label);
      return { mesh, label };
    });

  let selectedAi = document.documentElement.dataset.ai ?? null;
  let dark = false;
  const applyPalette = () => {
    const categories = Object.fromEntries(Object.keys(CATEGORY_LABEL).map((key) => [key, threeColor(cssVar(`--cat-${key}`))]));
    const ink = threeColor(cssVar('--ink'));
    const muted = threeColor(cssVar('--muted'));
    dark = isDarkTheme();
    for (const { mesh, glow } of nodeObjects) {
      const { node } = mesh.userData;
      const color = node.kind === 'ai' ? threeColor(node.ai.color) : categories[node.story.category] ?? ink;
      mesh.material.color.copy(color);
      glow.material.color.copy(color);
      glow.material.opacity = dark ? 0.55 : 0.32;
      glow.material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    }
    for (const segments of lines) segments.material.color.copy(threeColor(aiById.get(segments.userData.aiId)?.color ?? cssVar('--ink')));
    dust.material.color.copy(muted);
    dust.material.opacity = dark ? 0.55 : 0.4;
    selectedAi = document.documentElement.dataset.ai ?? null;
  };
  applyPalette();
  onPaletteChange(applyPalette);

  const resize = () => {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height, false);
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
    nodeObjects.forEach(({ mesh }, index) => {
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
      mesh.children[0].material.opacity = (dark ? 0.55 : 0.32) * data.opacity;
    });
    for (const segments of lines) {
      const active = !selectedAi || segments.userData.aiId === selectedAi;
      const goal = selectedAi ? (active ? 0.9 : 0.05) : dark ? 0.45 : 0.55;
      segments.userData.opacity = lerp(segments.userData.opacity, goal, 0.06);
      segments.material.opacity = segments.userData.opacity;
    }
    dust.rotation.y += reducedMotion.matches ? 0 : 0.0006;

    const { width, height } = stage.getBoundingClientRect();
    for (const { mesh, label } of hubLabels) {
      projected.copy(mesh.position).project(camera);
      const behind = projected.z > 1;
      label.style.transform = `translate(${((projected.x + 1) / 2) * width}px, ${((1 - projected.y) / 2) * height}px)`;
      const dim = selectedAi && mesh.userData.node.id !== selectedAi;
      label.style.opacity = behind ? 0 : dim ? 0.35 : Math.min(1, mesh.userData.scale);
    }
    renderer.render(scene, camera);
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
