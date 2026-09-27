// 3D logo of the selected AI: the brand SVG extruded with a glossy finish, floating in the
// background while a filter is on. Three.js is loaded on demand.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { lerp, reducedMotion, toRgb } from './shared.js';

const SIZE = 11; // world units for the logo's largest side

function easeOutBack(t) {
  const c = 1.4;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

async function buildLogo(ai) {
  const text = await fetch(`logos/${encodeURIComponent(ai.logo)}.svg`).then((response) => {
    if (!response.ok) throw new Error(`logo ${ai.logo}: HTTP ${response.status}`);
    return response.text();
  });
  // The icons use fill="currentColor", which three.js cannot parse; the material sets the color anyway.
  const { paths } = new SVGLoader().parse(text.replaceAll('currentColor', '#000'));
  const [r, g, b] = toRgb(ai.color);
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace),
    metalness: 0.25,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    transparent: true,
  });
  const shapeGroup = new THREE.Group();
  for (const path of paths) {
    for (const shape of path.toShapes()) {
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 2.6,
        bevelEnabled: true,
        bevelThickness: 0.45,
        bevelSize: 0.3,
        bevelSegments: 6,
        curveSegments: 28,
      });
      shapeGroup.add(new THREE.Mesh(geometry, material));
    }
  }
  // Center, fit and turn upright (SVG's y axis points down; a half-turn on x fixes it without mirroring).
  const box = new THREE.Box3().setFromObject(shapeGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  shapeGroup.children.forEach((mesh) => mesh.geometry.translate(-center.x, -center.y, -center.z));
  shapeGroup.scale.setScalar(SIZE / Math.max(size.x, size.y));
  shapeGroup.rotation.x = Math.PI;

  const pivot = new THREE.Group();
  pivot.add(shapeGroup);
  pivot.userData = { ai, material, appear: 0, target: 1, spin: Math.random() * Math.PI };
  return pivot;
}

export function startLogo3d(edition) {
  const aiById = new Map((edition.ais ?? []).map((ai) => [ai.id, ai]));
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-logo';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(6, 10, 12);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.35));
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  camera.position.set(0, 0, 32);

  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.tx = event.clientX / window.innerWidth - 0.5;
      pointer.ty = event.clientY / window.innerHeight - 0.5;
    },
    { passive: true },
  );

  const cache = new Map();
  const shown = new Set();
  let wanted = null;
  let running = false;

  const frame = (now) => {
    if (document.hidden) {
      running = false;
      return;
    }
    pointer.x = lerp(pointer.x, pointer.tx, 0.04);
    pointer.y = lerp(pointer.y, pointer.ty, 0.04);
    for (const pivot of [...shown]) {
      const data = pivot.userData;
      data.appear = reducedMotion.matches ? data.target : lerp(data.appear, data.target, 0.07);
      const eased = data.target === 1 ? easeOutBack(Math.min(1, data.appear)) : data.appear;
      pivot.scale.setScalar(Math.max(0.0001, eased));
      data.material.opacity = Math.min(1, data.appear * 1.4);
      const idle = reducedMotion.matches ? 0 : now / 1000;
      pivot.rotation.y = data.spin + Math.sin(idle * 0.5) * 0.55 + (1 - data.appear) * Math.PI * (data.target ? -1 : 1) + pointer.x * 0.5;
      pivot.rotation.x = Math.sin(idle * 0.4) * 0.12 + pointer.y * 0.3;
      pivot.position.y = Math.sin(idle * 0.8) * 0.4;
      if (data.target === 0 && data.appear < 0.01) {
        scene.remove(pivot);
        shown.delete(pivot);
      }
    }
    renderer.render(scene, camera);
    canvas.classList.toggle('is-active', shown.size > 0);
    if (shown.size === 0) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
  };
  const wake = () => {
    if (running || document.hidden) return;
    running = true;
    requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', wake);

  const show = async (id) => {
    wanted = id;
    for (const pivot of shown) if (pivot.userData.ai.id !== id) pivot.userData.target = 0;
    const ai = id ? aiById.get(id) : null;
    if (ai?.logo) {
      if (!cache.has(id)) cache.set(id, buildLogo(ai));
      const pivot = await cache.get(id).catch((error) => {
        console.warn('[fx] logo', error);
        return null;
      });
      if (pivot && wanted === id) {
        pivot.userData.target = 1;
        if (!shown.has(pivot)) {
          pivot.userData.appear = 0;
          scene.add(pivot);
          shown.add(pivot);
        }
      }
    }
    wake();
  };

  new MutationObserver(() => {
    const id = document.documentElement.dataset.ai ?? null;
    if (id !== wanted) show(id);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-ai'] });
  show(document.documentElement.dataset.ai ?? null);
}
