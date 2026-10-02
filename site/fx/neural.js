// Neural network behind the masthead: a loose 3D cloud of neurons that keep drifting, wiring and
// unwiring at random like synapses, with signals firing through them. The cloud sways slowly (and
// with the pointer), so near links slide past far ones. Tinted with the page accent, so it follows
// the selected AI's color. Plain 2D canvas with a small perspective projection, no library.
import { cssVar, finePointer, isDarkTheme, lerp, onPaletteChange, reducedMotion, toRgb, varRgb, watchVisibility } from './shared.js';

const TAU = Math.PI * 2;
const GROW = 0.7; // seconds a synapse takes to reach the other neuron
const UNDO = 0.9; // seconds it takes to come undone
const MAX_HOPS = 4; // how far a signal is relayed before it dies out
const LINKS = 1.8; // synapses per neuron, on average
const SAMPLES = 8; // points per synapse curve; each piece gets the width and strength of its depth
const LAYERS = 6; // depth layers the link pieces are batched in, far to near

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Second hue for the signals: the accent rotated ~40° and a touch lighter. */
function companion([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  hue = (hue * 60 + 40 + 360) % 360;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  const l = Math.min(0.75, lightness + 0.08);
  const c = (1 - Math.abs(2 * l - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return [r1 + m, g1 + m, b1 + m];
}

const rgba = ([r, g, b], alpha) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${clamp01(alpha).toFixed(3)})`;

/** Random unit vector. */
function direction() {
  const z = Math.random() * 2 - 1;
  const angle = Math.random() * TAU;
  const ring = Math.sqrt(1 - z * z);
  return [ring * Math.cos(angle), ring * Math.sin(angle), z];
}

export function startNeural() {
  const host = document.querySelector('.masthead');
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-neural';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  host.prepend(canvas);

  let width = 0;
  let height = 0;
  // The cloud: a box centered on the canvas, deep enough to read as 3D. Its middle plane spans the
  // canvas, so few neurons are wasted off screen up front.
  const box = { x: 0, y: 0, z: 0, focal: 1 };
  let neurons = [];
  let synapses = [];
  const pulses = [];
  const wired = new Set();
  // Seconds of animation; only advances while the canvas is on screen.
  let elapsed = 0;
  // Where each neuron lands on screen this frame: position, perspective scale and depth (0 far, 1 near).
  let screen = [];

  const pairKey = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a);
  const isPhone = () => width < 760;
  const reach = () => Math.min(340, Math.max(220, width * 0.24));
  const alive = (synapse) => synapse.undoAt === Infinity;
  const ready = (synapse) => alive(synapse) && elapsed - synapse.born >= GROW;
  const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  /**
   * Wires neuron `a` to a random neuron in reach — not simply the closest one: random wiring is what
   * makes it read as a brain, not a mesh. Of two random picks the closer wins, so most links stay short.
   */
  const wire = (a, born, life) => {
    const from = neurons[a];
    const range = reach();
    const options = [];
    neurons.forEach((to, b) => {
      if (b === a || to.born > elapsed || wired.has(pairKey(a, b))) return;
      const distance = distance3(from, to);
      if (distance > 30 && distance < range) options.push(b);
    });
    if (!options.length) return;
    const first = options[Math.floor(Math.random() * options.length)];
    const second = options[Math.floor(Math.random() * options.length)];
    const b = distance3(from, neurons[first]) <= distance3(from, neurons[second]) ? first : second;
    wired.add(pairKey(a, b));
    from.links++;
    neurons[b].links++;
    // Curves bend toward a random side in 3D, so they turn as the cloud sways.
    synapses.push({ a, b, born, life, undoAt: Infinity, bend: 0.1 + Math.random() * 0.2, side: direction(), glow: 0 });
  };

  /** A neuron that is on screen, preferring one with few links, so nobody stays alone for long. */
  const pickNeuron = () => {
    const first = Math.floor(Math.random() * neurons.length);
    const second = Math.floor(Math.random() * neurons.length);
    const pick = neurons[first].links <= neurons[second].links ? first : second;
    return neurons[pick].born <= elapsed ? pick : -1;
  };

  const populate = () => {
    const still = reducedMotion.matches;
    // Phones get a denser cloud: their masthead is tall and narrow, so links would hardly ever reach.
    const count = Math.round(Math.min(42, Math.max(12, (width * height) / (isPhone() ? 17000 : 26000))));
    neurons = [];
    for (let i = 0; i < count; i++) {
      // Best of a few random spots, so no corner ends up crowded or empty.
      let spot = null;
      let bestGap = -1;
      for (let tries = 0; tries < 8; tries++) {
        const candidate = { x: (Math.random() * 2 - 1) * box.x, y: (Math.random() * 2 - 1) * box.y, z: (Math.random() * 2 - 1) * box.z };
        const gap = neurons.reduce((nearest, other) => Math.min(nearest, distance3(other, candidate)), Infinity);
        if (gap > bestGap) {
          spot = candidate;
          bestGap = gap;
        }
      }
      neurons.push({
        ...spot,
        heading: direction(),
        steer: [0, 0, 0],
        speed: 10 + Math.random() * 14,
        energy: 0,
        rest: 0,
        links: 0,
        born: still ? -1 : elapsed + Math.random() * 1.2,
      });
    }
    synapses = [];
    wired.clear();
    pulses.length = 0;
    if (still) {
      for (let tries = 0; synapses.length < count * LINKS && tries < 600; tries++) {
        const a = pickNeuron();
        if (a >= 0) wire(a, -10, Infinity);
      }
    }
  };

  let populatedWidth = 0;
  const resize = () => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    box.z = Math.min(300, Math.max(150, width * 0.25));
    box.focal = box.z * 3.7;
    box.x = (width / 2) * 1.08;
    box.y = (height / 2) * 1.08;
    // Neurons that end up outside the box swim back on their own; only a big change starts over.
    if (!neurons.length || Math.abs(width - populatedWidth) > populatedWidth * 0.2) {
      populatedWidth = width;
      populate();
    }
    wake();
  };

  // Colors are sampled from CSS, so the network eases along with the page's own color transition.
  const palette = () => {
    const dark = isDarkTheme();
    const accent = varRgb('--accent');
    // In the light theme the strokes read as printing ink: the accent pulled toward the text color.
    const ink = dark ? accent : accent.map((value, index) => lerp(value, toRgb(cssVar('--ink'))[index], 0.35));
    return { ink, spark: dark ? companion(accent) : accent, strength: dark ? 1 : 0.85, dark };
  };
  const target = palette();
  const current = { ink: [...target.ink], spark: [...target.spark], strength: target.strength };
  let lastSample = 0;
  const sample = (now) => {
    if (now - lastSample < 120) return;
    lastSample = now;
    Object.assign(target, palette());
  };

  const pointer = { x: 0, y: 0, tx: 0, ty: 0, clientX: -1, clientY: -1 };
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.tx = event.clientX / window.innerWidth - 0.5;
      pointer.ty = 0.5 - event.clientY / window.innerHeight;
      pointer.clientX = event.clientX;
      pointer.clientY = event.clientY;
    },
    { passive: true },
  );
  /** The pointer in canvas coordinates, or null when it is outside. */
  const localPointer = () => {
    if (!finePointer.matches || pointer.clientX < 0) return null;
    const rect = canvas.getBoundingClientRect();
    const x = pointer.clientX - rect.left;
    const y = pointer.clientY - rect.top;
    return x >= 0 && y >= 0 && x <= width && y <= height ? [x, y] : null;
  };

  // The camera: the cloud sways left and right (and a little up and down), and leans with the pointer.
  const camera = { sinY: 0, cosY: 1, sinX: 0, cosX: 1 };
  const aim = () => {
    const still = reducedMotion.matches;
    const yaw = (still ? 0.12 : 0.22 * Math.sin(elapsed * 0.05)) + pointer.x * 0.2;
    const pitch = (still ? 0.05 : 0.1 * Math.sin(elapsed * 0.037 + 1)) - pointer.y * 0.12;
    camera.sinY = Math.sin(yaw);
    camera.cosY = Math.cos(yaw);
    camera.sinX = Math.sin(pitch);
    camera.cosX = Math.cos(pitch);
  };
  /** A point of the cloud on screen: [x, y, perspective scale, depth 0 (far) … 1 (near)]. */
  const project = (x, y, z) => {
    const x1 = x * camera.cosY + z * camera.sinY;
    const z1 = -x * camera.sinY + z * camera.cosY;
    const y2 = y * camera.cosX - z1 * camera.sinX;
    const z2 = y * camera.sinX + z1 * camera.cosX;
    const scale = box.focal / Math.max(box.focal * 0.25, box.focal + z2);
    return [width / 2 + x1 * scale, height / 2 + y2 * scale, scale, clamp01((box.z - z2) / (2 * box.z))];
  };

  /** Point at `t` along a synapse's curve, in the cloud's coordinates. */
  const along = (synapse, t) => {
    const a = neurons[synapse.a];
    const b = neurons[synapse.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    // Push the middle out along `side`, minus its part along the link, so the bend is sideways.
    const [sx, sy, sz] = synapse.side;
    const dot = (sx * dx + sy * dy + sz * dz) / length;
    const push = synapse.bend * length;
    const cx = (a.x + b.x) / 2 + (sx - (dot * dx) / length) * push;
    const cy = (a.y + b.y) / 2 + (sy - (dot * dy) / length) * push;
    const cz = (a.z + b.z) / 2 + (sz - (dot * dz) / length) * push;
    const u = 1 - t;
    return [u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y, u * u * a.z + 2 * u * t * cz + t * t * b.z];
  };

  /** Fires a neuron: it lights up and sends signals down its synapses (a relayed signal takes only some branches). */
  const fire = (index, hops, from) => {
    neurons[index].energy = 1;
    if (hops > MAX_HOPS || pulses.length > 30) return;
    for (const synapse of synapses) {
      if (synapse === from || !ready(synapse) || (synapse.a !== index && synapse.b !== index)) continue;
      if (hops > 0 && Math.random() > 0.5) continue;
      pulses.push({ synapse, forward: synapse.a === index, t: 0, hops });
    }
  };

  let nextWire = 0.3;
  let nextFire = 1.4;
  const simulate = (dt) => {
    for (const neuron of neurons) neuron.energy *= Math.exp(-dt * 2.4);
    for (const synapse of synapses) synapse.glow *= Math.exp(-dt * 2.4);
    if (reducedMotion.matches) return;

    // Neurons wander along smooth 3D curves (the steering itself drifts) and swim back into the box.
    for (const neuron of neurons) {
      const { heading, steer } = neuron;
      for (let axis = 0; axis < 3; axis++) {
        steer[axis] += (Math.random() - 0.5) * dt * 5 - steer[axis] * dt * 0.8;
        heading[axis] += steer[axis] * dt;
      }
      const outside = [neuron.x / box.x, neuron.y / box.y, neuron.z / box.z];
      outside.forEach((ratio, axis) => {
        if (Math.abs(ratio) > 1) heading[axis] -= Math.sign(ratio) * dt * 2.5;
      });
      const norm = Math.hypot(...heading) || 1;
      neuron.x += (heading[0] / norm) * neuron.speed * dt;
      neuron.y += (heading[1] / norm) * neuron.speed * dt;
      neuron.z += (heading[2] / norm) * neuron.speed * dt;
      heading.forEach((value, axis) => (heading[axis] = value / norm));
    }

    // Synapses come undone when they get old or stretched too far, and new ones keep wiring up.
    const range = reach();
    for (const synapse of synapses) {
      if (!alive(synapse)) continue;
      if (elapsed - synapse.born > synapse.life || distance3(neurons[synapse.a], neurons[synapse.b]) > range * 1.35) synapse.undoAt = elapsed;
    }
    const kept = [];
    for (const synapse of synapses) {
      if (elapsed - synapse.undoAt < UNDO) {
        kept.push(synapse);
        continue;
      }
      wired.delete(pairKey(synapse.a, synapse.b));
      neurons[synapse.a].links--;
      neurons[synapse.b].links--;
    }
    synapses = kept;
    if (elapsed > nextWire && synapses.filter(alive).length < neurons.length * LINKS) {
      // Fast at first, so the network visibly wires itself up when the page opens.
      nextWire = elapsed + (elapsed < 3 ? 0.05 : 0.15 + Math.random() * 0.3);
      const a = pickNeuron();
      if (a >= 0) wire(a, elapsed, 4 + Math.random() * 8);
    }

    // Signals travel along the curves; when one arrives, the neuron fires and may relay it.
    for (let index = pulses.length - 1; index >= 0; index--) {
      const pulse = pulses[index];
      const { synapse } = pulse;
      if (!alive(synapse)) {
        pulses.splice(index, 1);
        continue;
      }
      pulse.t += (dt * 190) / Math.max(40, distance3(neurons[synapse.a], neurons[synapse.b]));
      if (pulse.t < 1) continue;
      pulses.splice(index, 1);
      synapse.glow = 1;
      fire(pulse.forward ? synapse.b : synapse.a, pulse.hops + 1, synapse);
    }
    if (elapsed > nextFire) {
      nextFire = elapsed + 0.5 + Math.random() * 0.8;
      const neuron = pickNeuron();
      if (neuron >= 0) fire(neuron, 0, null);
    }

    // Hovering a neuron fires it.
    const spot = localPointer();
    if (spot) {
      neurons.forEach((neuron, index) => {
        if (neuron.rest > elapsed || neuron.born > elapsed || !screen[index]) return;
        if (Math.hypot(screen[index][0] - spot[0], screen[index][1] - spot[1]) > 50) return;
        neuron.rest = elapsed + 2;
        fire(index, 0, null);
      });
    }
  };

  // Link pieces of each depth layer, as flat [x0, y0, x1, y1, …] lists, drawn far to near in one stroke each.
  const layers = Array.from({ length: LAYERS }, () => []);

  const draw = () => {
    const { ink, spark } = current;
    const dark = target.dark;
    const strength = current.strength * (isPhone() ? 0.85 : 1);
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    context.lineCap = 'round';
    const shown = neurons.map((neuron) => clamp01((elapsed - neuron.born) / 0.6));

    // Synapses: each curve is cut in pieces that take the width and strength of their depth, so a link
    // running toward the viewer swells and one running away thins out and fades.
    for (const layer of layers) layer.length = 0;
    const glowing = [];
    for (const synapse of synapses) {
      const grow = clamp01((elapsed - synapse.born) / GROW);
      const undo = alive(synapse) ? 0 : clamp01((elapsed - synapse.undoAt) / UNDO);
      if (grow <= undo) continue;
      // It grows out of one neuron and comes undone toward the other.
      const points = [];
      for (let step = 0; step <= SAMPLES; step++) points.push(project(...along(synapse, lerp(undo, grow, step / SAMPLES))));
      for (let step = 0; step < SAMPLES; step++) {
        const [x0, y0, , d0] = points[step];
        const [x1, y1, , d1] = points[step + 1];
        layers[Math.min(LAYERS - 1, Math.floor(((d0 + d1) / 2) * LAYERS))].push(x0, y0, x1, y1);
      }
      if (synapse.glow > 0.05) glowing.push([synapse, points]);
    }
    layers.forEach((layer, index) => {
      if (!layer.length) return;
      const depth = (index + 0.5) / LAYERS;
      context.beginPath();
      for (let i = 0; i < layer.length; i += 4) {
        context.moveTo(layer[i], layer[i + 1]);
        context.lineTo(layer[i + 2], layer[i + 3]);
      }
      context.strokeStyle = rgba(ink, (dark ? 0.5 : 0.42) * (0.22 + 0.78 * depth) * strength);
      context.lineWidth = 0.35 + 1.6 * depth;
      context.stroke();
    });
    for (const [synapse, points] of glowing) {
      context.beginPath();
      context.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points.slice(1)) context.lineTo(x, y);
      const depth = (points[0][3] + points[SAMPLES][3]) / 2;
      context.strokeStyle = rgba(spark, synapse.glow * (dark ? 0.55 : 0.45) * (0.3 + 0.7 * depth) * strength);
      context.lineWidth = 0.8 + 1.6 * depth;
      context.stroke();
    }

    // Glow for firing neurons and traveling signals.
    const glow = (x, y, amount, radius) => {
      context.fillStyle = rgba(spark, amount * (dark ? 0.22 : 0.16) * strength);
      context.beginPath();
      context.arc(x, y, radius * 4.5, 0, TAU);
      context.fill();
      context.fillStyle = rgba(dark ? spark.map((value) => lerp(value, 1, 0.55)) : spark, amount * 0.9 * strength);
      context.beginPath();
      context.arc(x, y, radius * 1.4, 0, TAU);
      context.fill();
    };

    // Neurons, far to near: far ones small and faint, near ones bigger with a faint cell body around them.
    neurons
      .map((neuron, index) => index)
      .filter((index) => shown[index] > 0)
      .sort((a, b) => screen[a][2] - screen[b][2])
      .forEach((index) => {
        const [x, y, , depth] = screen[index];
        const radius = 0.9 + 2.2 * depth;
        if (depth > 0.7) {
          context.fillStyle = rgba(ink, 0.08 * shown[index] * strength);
          context.beginPath();
          context.arc(x, y, radius * 3.2, 0, TAU);
          context.fill();
        }
        context.fillStyle = rgba(ink, (dark ? 0.85 : 0.7) * (0.3 + 0.7 * depth) * shown[index] * strength);
        context.beginPath();
        context.arc(x, y, radius, 0, TAU);
        context.fill();
        if (neurons[index].energy > 0.04) glow(x, y, neurons[index].energy, radius);
      });

    context.lineWidth = 1.6;
    for (const pulse of pulses) {
      const at = (t) => project(...along(pulse.synapse, pulse.forward ? t : 1 - t));
      const head = at(pulse.t);
      context.strokeStyle = rgba(spark, 0.55 * (0.3 + 0.7 * head[3]) * strength);
      context.lineWidth = 0.8 + 1.4 * head[3];
      context.beginPath();
      const tail = at(Math.max(0, pulse.t - 0.18));
      context.moveTo(tail[0], tail[1]);
      for (const t of [pulse.t - 0.12, pulse.t - 0.06]) {
        if (t <= 0) continue;
        const point = at(t);
        context.lineTo(point[0], point[1]);
      }
      context.lineTo(head[0], head[1]);
      context.stroke();
      glow(head[0], head[1], 0.5 + 0.5 * head[3], 0.8 + 1.2 * head[3]);
    }

    // The pointer joins the network: faint links to the neurons around it.
    const spot = localPointer();
    if (spot) {
      const near = screen
        .map(([x, y], index) => [x, y, Math.hypot(x - spot[0], y - spot[1]), index])
        .filter(([, , distance, index]) => distance < 160 && shown[index] >= 1)
        .sort((a, b) => a[2] - b[2])
        .slice(0, 3);
      context.lineWidth = 0.8;
      for (const [x, y, distance] of near) {
        context.strokeStyle = rgba(spark, (1 - distance / 160) * 0.5 * strength);
        context.beginPath();
        context.moveTo(spot[0], spot[1]);
        context.lineTo(x, y);
        context.stroke();
      }
    }
    context.globalCompositeOperation = 'source-over';
  };

  let visible = true;
  let running = false;
  let last = 0;

  const frame = (now) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!reducedMotion.matches) elapsed += dt;
    sample(now);
    current.ink = current.ink.map((value, index) => lerp(value, target.ink[index], 0.06));
    current.spark = current.spark.map((value, index) => lerp(value, target.spark[index], 0.06));
    current.strength = lerp(current.strength, target.strength, 0.06);
    if (finePointer.matches) {
      pointer.x = lerp(pointer.x, pointer.tx, 0.04);
      pointer.y = lerp(pointer.y, pointer.ty, 0.04);
    }
    simulate(dt);
    aim();
    screen = neurons.map((neuron) => project(neuron.x, neuron.y, neuron.z));
    draw();
  };

  const settled = () =>
    [...current.ink.map((value, index) => value - target.ink[index]), current.strength - target.strength].every((delta) => Math.abs(delta) < 0.002);

  const loop = (now) => {
    if (!visible || document.hidden) {
      running = false;
      return;
    }
    // 60 fps is plenty for motion this slow, and halves the work on 120 Hz screens.
    if (last && now - last < 15) {
      requestAnimationFrame(loop);
      return;
    }
    frame(now);
    // With reduced motion the web is drawn still; redraw only while a color change eases in.
    if (reducedMotion.matches && settled()) {
      running = false;
      return;
    }
    requestAnimationFrame(loop);
  };
  function wake() {
    if (running || !visible || document.hidden) return;
    running = true;
    last = 0;
    requestAnimationFrame(loop);
  }

  new ResizeObserver(resize).observe(canvas);
  resize();
  watchVisibility(canvas, (isVisible) => {
    visible = isVisible;
    wake();
  });
  document.addEventListener('visibilitychange', wake);
  onPaletteChange(() => {
    lastSample = 0;
    wake();
  });
  reducedMotion.addEventListener('change', () => {
    populate();
    wake();
  });
  requestAnimationFrame(() => canvas.classList.add('is-ready'));
}
