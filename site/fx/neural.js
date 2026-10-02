// Neural network behind the masthead: a loose web of neurons that keep drifting, wiring and
// unwiring at random like synapses, with signals firing through them. Tinted with the page accent,
// so it follows the selected AI's color. Plain 2D canvas, no library.
import { cssVar, finePointer, isDarkTheme, lerp, onPaletteChange, reducedMotion, toRgb, varRgb, watchVisibility } from './shared.js';

const TAU = Math.PI * 2;
const GROW = 0.7; // seconds a synapse takes to reach the other neuron
const UNDO = 0.9; // seconds it takes to come undone
const MAX_HOPS = 5; // how far a signal is relayed before it dies out
const LINKS = 1.9; // synapses per neuron, on average

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

/** Point at `t` on the quadratic curve a → c → b. */
const curvePoint = (a, c, b, t) => [
  (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
  (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
];

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
  let neurons = [];
  let synapses = [];
  const pulses = [];
  const wired = new Set();
  // Seconds of animation; only advances while the canvas is on screen.
  let elapsed = 0;

  const pairKey = (a, b) => (a < b ? a * 4096 + b : b * 4096 + a);
  const reach = () => Math.min(260, Math.max(150, width * 0.18));
  const isPhone = () => width < 760;
  const alive = (synapse) => synapse.undoAt === Infinity;
  const ready = (synapse) => alive(synapse) && elapsed - synapse.born >= GROW;

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
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      if (distance > 24 && distance < range) options.push(b);
    });
    if (!options.length) return;
    const distanceTo = (index) => Math.hypot(neurons[index].x - from.x, neurons[index].y - from.y);
    const first = options[Math.floor(Math.random() * options.length)];
    const second = options[Math.floor(Math.random() * options.length)];
    const b = distanceTo(first) <= distanceTo(second) ? first : second;
    wired.add(pairKey(a, b));
    from.links++;
    neurons[b].links++;
    synapses.push({ a, b, born, life, undoAt: Infinity, bend: (Math.random() - 0.5) * 0.36, glow: 0 });
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
    // Phones get a denser web: their masthead is tall and narrow, so links would hardly ever reach.
    const count = Math.round(Math.min(56, Math.max(14, (width * height) / (isPhone() ? 12000 : 19000))));
    neurons = [];
    for (let i = 0; i < count; i++) {
      // Best of a few random spots, so no corner ends up crowded or empty.
      let spot = null;
      let bestGap = -1;
      for (let tries = 0; tries < 8; tries++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const gap = neurons.reduce((nearest, other) => Math.min(nearest, Math.hypot(other.x - x, other.y - y)), Infinity);
        if (gap > bestGap) {
          spot = { x, y };
          bestGap = gap;
        }
      }
      const z = 0.45 + Math.random() * 0.55; // depth: near neurons are bigger, brighter and faster
      neurons.push({
        ...spot,
        z,
        heading: Math.random() * TAU,
        turn: 0,
        speed: (12 + Math.random() * 18) * z,
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
    // Neurons that end up off the edge swim back on their own; only a big change starts over.
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

  /** Parallax: near neurons shift more with the pointer, which gives the web some depth. */
  const drawnAt = (neuron) => [neuron.x - pointer.x * 28 * neuron.z, neuron.y + pointer.y * 18 * neuron.z];

  /** Fires a neuron: it lights up and sends signals down its synapses (a relayed signal takes only some branches). */
  const fire = (index, hops, from) => {
    neurons[index].energy = 1;
    if (hops > MAX_HOPS || pulses.length > 40) return;
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

    // Neurons wander along smooth curves (the turn rate itself drifts) and swim back near the edges.
    const margin = 30;
    for (const neuron of neurons) {
      neuron.turn += (Math.random() - 0.5) * dt * 5 - neuron.turn * dt * 0.8;
      neuron.turn = Math.max(-1.4, Math.min(1.4, neuron.turn));
      neuron.heading += neuron.turn * dt;
      if (neuron.x < -margin || neuron.x > width + margin || neuron.y < -margin || neuron.y > height + margin) {
        const home = Math.atan2(height / 2 - neuron.y, width / 2 - neuron.x);
        neuron.heading += Math.sin(home - neuron.heading) * dt * 2.5;
      }
      neuron.x += Math.cos(neuron.heading) * neuron.speed * dt;
      neuron.y += Math.sin(neuron.heading) * neuron.speed * dt;
    }

    // Synapses come undone when they get old or stretched too far, and new ones keep wiring up.
    const range = reach();
    for (const synapse of synapses) {
      if (!alive(synapse)) continue;
      const a = neurons[synapse.a];
      const b = neurons[synapse.b];
      if (elapsed - synapse.born > synapse.life || Math.hypot(a.x - b.x, a.y - b.y) > range * 1.35) synapse.undoAt = elapsed;
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
      nextWire = elapsed + (elapsed < 3 ? 0.04 : 0.12 + Math.random() * 0.25);
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
      const a = neurons[synapse.a];
      const b = neurons[synapse.b];
      pulse.t += (dt * 170) / Math.max(40, Math.hypot(a.x - b.x, a.y - b.y));
      if (pulse.t < 1) continue;
      pulses.splice(index, 1);
      synapse.glow = 1;
      fire(pulse.forward ? synapse.b : synapse.a, pulse.hops + 1, synapse);
    }
    if (elapsed > nextFire) {
      nextFire = elapsed + 0.3 + Math.random() * 0.7;
      const neuron = pickNeuron();
      if (neuron >= 0) fire(neuron, 0, null);
    }

    // Hovering a neuron fires it.
    const spot = localPointer();
    if (spot) {
      neurons.forEach((neuron, index) => {
        if (neuron.rest > elapsed || neuron.born > elapsed) return;
        const [x, y] = drawnAt(neuron);
        if (Math.hypot(x - spot[0], y - spot[1]) > 50) return;
        neuron.rest = elapsed + 2;
        fire(index, 0, null);
      });
    }
  };

  const draw = () => {
    const { ink, spark } = current;
    const dark = target.dark;
    const strength = current.strength * (isPhone() ? 0.85 : 1);
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    context.lineCap = 'round';

    const at = neurons.map(drawnAt);
    const shown = neurons.map((neuron) => clamp01((elapsed - neuron.born) / 0.6));

    // Synapses: a slightly bent curve that grows out of one neuron and comes undone toward the other.
    for (const synapse of synapses) {
      const grow = clamp01((elapsed - synapse.born) / GROW);
      const undo = alive(synapse) ? 0 : clamp01((elapsed - synapse.undoAt) / UNDO);
      if (grow <= 0 || undo >= 1) continue;
      const a = at[synapse.a];
      const b = at[synapse.b];
      const c = [(a[0] + b[0]) / 2 - (b[1] - a[1]) * synapse.bend, (a[1] + b[1]) / 2 + (b[0] - a[0]) * synapse.bend];
      // The stretch of the curve between `undo` and `grow`, as its own quadratic.
      const start = curvePoint(a, c, b, undo);
      const end = curvePoint(a, c, b, grow);
      const mid = [
        (1 - undo) * (1 - grow) * a[0] + ((1 - undo) * grow + undo * (1 - grow)) * c[0] + undo * grow * b[0],
        (1 - undo) * (1 - grow) * a[1] + ((1 - undo) * grow + undo * (1 - grow)) * c[1] + undo * grow * b[1],
      ];
      const depth = (neurons[synapse.a].z + neurons[synapse.b].z) / 2;
      const fade = 1 - undo;
      context.beginPath();
      context.moveTo(start[0], start[1]);
      context.quadraticCurveTo(mid[0], mid[1], end[0], end[1]);
      context.strokeStyle = rgba(ink, (dark ? 0.42 : 0.38) * (0.4 + 0.6 * depth) * fade * strength);
      context.lineWidth = 0.6 + 0.6 * depth;
      context.stroke();
      if (synapse.glow > 0.05) {
        context.strokeStyle = rgba(spark, synapse.glow * (dark ? 0.5 : 0.4) * fade * strength);
        context.lineWidth = 1.4;
        context.stroke();
      }
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

    // Neurons: a core and, for the near ones, a faint cell body around it.
    neurons.forEach((neuron, index) => {
      if (shown[index] <= 0) return;
      const [x, y] = at[index];
      const radius = 1.1 + 1.7 * neuron.z;
      if (neuron.z > 0.75) {
        context.fillStyle = rgba(ink, 0.07 * shown[index] * strength);
        context.beginPath();
        context.arc(x, y, radius * 3.2, 0, TAU);
        context.fill();
      }
      context.fillStyle = rgba(ink, ((dark ? 0.3 : 0.25) + (dark ? 0.5 : 0.4) * neuron.z) * shown[index] * strength);
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fill();
      if (neuron.energy > 0.04) glow(x, y, neuron.energy, radius);
    });

    context.lineWidth = 1.6;
    for (const pulse of pulses) {
      const a = at[pulse.synapse.a];
      const b = at[pulse.synapse.b];
      const c = [(a[0] + b[0]) / 2 - (b[1] - a[1]) * pulse.synapse.bend, (a[1] + b[1]) / 2 + (b[0] - a[0]) * pulse.synapse.bend];
      const along = (t) => curvePoint(a, c, b, pulse.forward ? t : 1 - t);
      const head = along(pulse.t);
      context.strokeStyle = rgba(spark, 0.55 * strength);
      context.beginPath();
      const tail = along(Math.max(0, pulse.t - 0.18));
      context.moveTo(tail[0], tail[1]);
      for (const t of [pulse.t - 0.12, pulse.t - 0.06]) {
        if (t <= 0) continue;
        const point = along(t);
        context.lineTo(point[0], point[1]);
      }
      context.lineTo(head[0], head[1]);
      context.stroke();
      glow(head[0], head[1], 1, 1.4);
    }

    // The pointer joins the network: faint links to the neurons around it.
    const spot = localPointer();
    if (spot) {
      const near = at
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
