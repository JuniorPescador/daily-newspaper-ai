// Neural network behind the masthead: neurons fly in and link up until they draw a newspaper page,
// then signals keep running through it. Tinted with the page accent, so it follows the selected
// AI's color. Plain 2D canvas with a small hand-rolled 3D projection, no library.
import { cssVar, finePointer, isDarkTheme, lerp, onPaletteChange, reducedMotion, toRgb, varRgb, watchVisibility } from './shared.js';

const TAU = Math.PI * 2;
const PAGE_H = 1.36; // page height in page units; the width is 1
const FLY = 1.1; // seconds a neuron takes to reach its place
const GROW = 0.35; // seconds a link takes to reach the next neuron
// Link kinds: the strokes that draw the page, the web between them, and a few long axons.
const INK = 0;
const MESH = 1;
const AXON = 2;

/** Small seeded PRNG, so the page comes out the same on every visit and resize. */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

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

const rgba = ([r, g, b], alpha) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha.toFixed(3)})`;

/** Points covering the "Gazeta Neural" nameplate, `width` page units wide, sampled from the page's serif. */
function nameplatePoints(width, spacing, random) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const size = 120;
  const serif = cssVar('--serif') || 'Georgia, serif';
  const fonts = [`${size}px ${serif}`, `italic ${size}px ${serif}`];
  context.font = fonts[0];
  const first = context.measureText('Gazeta ').width;
  context.font = fonts[1];
  const second = context.measureText('Neural').width;
  const pad = 8;
  canvas.width = Math.ceil(first + second) + pad * 2;
  canvas.height = Math.ceil(size * 1.05);
  // A stroke on top of the fill thickens the hairlines, so the grid below doesn't miss them.
  context.lineWidth = 7;
  context.lineJoin = 'round';
  [['Gazeta ', pad], ['Neural', pad + first]].forEach(([text, x], index) => {
    context.font = fonts[index];
    context.fillText(text, x, size * 0.8);
    context.strokeText(text, x, size * 0.8);
  });
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const scale = width / canvas.width;
  const grid = Math.max(3, spacing / scale);
  const points = [];
  for (let y = grid / 2; y < canvas.height; y += grid) {
    for (let x = grid / 2; x < canvas.width; x += grid) {
      const px = Math.round(x + (random() - 0.5) * grid * 0.3);
      const py = Math.round(y + (random() - 0.5) * grid * 0.3);
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      if (data[(py * canvas.width + px) * 4 + 3] > 120) points.push([(px - canvas.width / 2) * scale, (py - canvas.height / 2) * scale]);
    }
  }
  return points;
}

/**
 * The newspaper page as neurons and links, in page units (width 1, centered on 0,0): a dog-eared
 * sheet, the nameplate, a double rule with the dateline, a two-line headline, a photo and three
 * columns of text. `step` is the spacing between neurons along a line.
 */
function buildPage(step) {
  const random = seeded(20261002);
  const xs = [];
  const ys = [];
  const groups = [];
  const sizes = [];
  const edges = [];
  const seen = new Set();
  const lines = [];
  let group = 0;

  const add = (x, y, wobble = 0, size = 1) => {
    xs.push(x + (random() - 0.5) * wobble);
    ys.push(y + (random() - 0.5) * wobble);
    groups.push(group);
    sizes.push(size);
    return xs.length - 1;
  };
  const link = (a, b, kind = INK) => {
    const key = a < b ? a * 16384 + b : b * 16384 + a;
    if (a === b || seen.has(key)) return;
    seen.add(key);
    edges.push([a, b, kind]);
  };
  const nearest = (ids, x, y) => ids.reduce((best, id) => (Math.hypot(xs[id] - x, ys[id] - y) < Math.hypot(xs[best] - x, ys[best] - y) ? id : best));
  /** Neurons along a polyline, each linked to the next. */
  const path = (points, { closed = false, wobble = 0, spacing = step, kind = INK } = {}) => {
    group++;
    const ids = [];
    const corners = closed ? [...points, points[0]] : points;
    for (let s = 0; s < corners.length - 1; s++) {
      const [x0, y0] = corners[s];
      const [x1, y1] = corners[s + 1];
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / spacing));
      for (let i = s ? 1 : 0; i <= n; i++) {
        if (closed && s === corners.length - 2 && i === n) break;
        ids.push(add(lerp(x0, x1, i / n), lerp(y0, y1, i / n), wobble));
      }
    }
    for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i], kind);
    if (closed) link(ids.at(-1), ids[0], kind);
    return ids;
  };
  /** A heavy line (headline, subhead): two rows of neurons braided together. */
  const bar = (x0, x1, y, thickness) => {
    const top = path([[x0, y - thickness / 2], [x1, y - thickness / 2]], { wobble: step * 0.12 });
    const bottom = path([[x0, y + thickness / 2], [x1, y + thickness / 2]], { wobble: step * 0.12 });
    for (let i = 0; i < Math.min(top.length, bottom.length); i++) {
      link(top[i], bottom[i]);
      if (i + 1 < bottom.length) link(top[i], bottom[i + 1]);
    }
    lines.push(top);
  };

  const W = 0.5;
  const H = PAGE_H / 2;
  const margin = 0.07;
  const ear = 0.08;
  const left = -W + margin;
  const right = W - margin;
  const width = right - left;

  // The sheet, with its top-right corner folded over.
  const frame = path([[-W, -H], [W - ear, -H], [W, -H + ear], [W, H], [-W, H]], { closed: true });
  const frameCount = xs.length;
  group++;
  const fold = add(W - ear, -H + ear);
  link(fold, nearest(frame, W - ear, -H));
  link(fold, nearest(frame, W, -H + ear));

  // Nameplate, drawn by a dense grid of small neurons sampled from the real "Gazeta Neural" letters.
  group++;
  const plateY = -H + 0.115;
  const plateGrid = step * 0.26;
  const plate = nameplatePoints(width * 0.9, plateGrid, random).map(([x, y]) => add(x - 0.015, plateY + y, 0, 0.6));
  for (const id of plate) {
    const near = plate
      .filter((other) => other !== id)
      .map((other) => [other, Math.hypot(xs[other] - xs[id], ys[other] - ys[id])])
      .filter(([, distance]) => distance < plateGrid * 1.6)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2);
    for (const [other] of near) link(id, other);
  }

  // Double rule with the dateline between.
  const rule = -H + 0.2;
  path([[left, rule], [right, rule]]);
  for (const [from, to] of [[0, 0.24], [0.38, 0.62], [0.78, 1]]) {
    path([[left + width * from, rule + 0.025], [left + width * to, rule + 0.025]], { spacing: step * 0.8, kind: MESH });
  }
  path([[left, rule + 0.05], [right, rule + 0.05]]);

  // Headline.
  const headline = rule + 0.115;
  bar(left, right, headline, 0.024);
  bar(left, left + width * 0.64, headline + 0.06, 0.024);

  // Body: a photo across the first two columns, three columns of text, rules between them.
  const top = headline + 0.125;
  const bottom = H - margin;
  const gap = 0.045;
  const column = (width - 2 * gap) / 3;
  const columns = [0, 1, 2].map((index) => left + index * (column + gap));
  const lineHeight = Math.max(0.042, step * 1.2);

  const photoRight = columns[1] + column;
  const photoBottom = top + 0.3;
  const photo = path([[left, top], [photoRight, top], [photoRight, photoBottom], [left, photoBottom]], { closed: true });
  const photoWidth = photoRight - left;
  const ridge = path(
    [[0.12, 0.62], [0.3, 0.32], [0.42, 0.52], [0.62, 0.18], [0.82, 0.48], [0.9, 0.38]].map(([x, y]) => [left + photoWidth * x, top + 0.3 * y]),
    { wobble: step * 0.1 },
  );
  link(ridge[0], nearest(photo, left, top + 0.3 * 0.7));
  link(ridge.at(-1), nearest(photo, photoRight, top + 0.3 * 0.38));
  const sun = { x: left + photoWidth * 0.2, y: top + 0.075, r: 0.032 };
  path(
    Array.from({ length: 7 }, (_, index) => [sun.x + sun.r * Math.cos((index / 7) * TAU), sun.y + sun.r * Math.sin((index / 7) * TAU)]),
    { closed: true, spacing: 1 },
  );
  path([[left, photoBottom + 0.03], [left + column * 1.15, photoBottom + 0.03]], { spacing: step * 0.8, kind: MESH });

  path([[columns[0] + column + gap / 2, photoBottom + 0.07], [columns[0] + column + gap / 2, bottom]], { spacing: step * 1.4, kind: MESH });
  path([[columns[1] + column + gap / 2, top], [columns[1] + column + gap / 2, bottom]], { spacing: step * 1.4, kind: MESH });

  const text = (x, from, to) => {
    let line = 0;
    let paragraph = 3 + Math.floor(random() * 4);
    for (let y = from; y <= to + 1e-6; y += lineHeight) {
      line++;
      const last = line === paragraph || y + lineHeight > to;
      const start = x + (line === 1 ? column * 0.12 : 0);
      const end = x + column * (last ? 0.35 + random() * 0.45 : 1);
      lines.push(path([[start, y], [end, y]], { wobble: step * 0.22 }));
      if (line === paragraph) {
        line = 0;
        paragraph = 3 + Math.floor(random() * 4);
      }
    }
  };
  text(columns[0], photoBottom + 0.075, bottom);
  text(columns[1], photoBottom + 0.075, bottom);
  bar(columns[2], columns[2] + column * 0.8, top + 0.012, 0.016);
  text(columns[2], top + 0.07, bottom);

  const count = xs.length;

  // The web: a share of neurons reach for the closest one in another stroke…
  for (let i = frameCount; i < count; i++) {
    if (random() > 0.45) continue;
    let best = -1;
    let bestDistance = step * 1.8;
    for (let j = frameCount; j < count; j++) {
      if (groups[j] === groups[i]) continue;
      const distance = Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
      if (distance < bestDistance) {
        best = j;
        bestDistance = distance;
      }
    }
    if (best >= 0) link(i, best, MESH);
  }
  // …and a few long axons cross the page.
  for (let made = 0, tries = 0; made < 26 && tries < 2000; tries++) {
    const a = Math.floor(random() * count);
    const b = Math.floor(random() * count);
    const distance = Math.hypot(xs[a] - xs[b], ys[a] - ys[b]);
    if (distance < 0.2 || distance > 0.5) continue;
    link(a, b, AXON);
    made++;
  }

  // Assembly order: the sheet is traced first, then the page is printed top to bottom.
  const delay = new Float32Array(count);
  const offsetX = new Float32Array(count);
  const offsetY = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    delay[i] = i < frameCount ? 0.7 * (i / frameCount) : 0.45 + 1.9 * ((ys[i] + H) / (2 * H)) + 0.35 * (xs[i] + W) + random() * 0.15;
    const angle = random() * TAU;
    const distance = 0.25 + random() * 0.6;
    offsetX[i] = Math.cos(angle) * distance;
    offsetY[i] = Math.sin(angle) * distance;
  }

  // Each link grows from the neuron that lands first.
  const edgeA = new Uint16Array(edges.length);
  const edgeB = new Uint16Array(edges.length);
  const edgeKind = new Uint8Array(edges.length);
  const adjacency = Array.from({ length: count }, () => []);
  edges.forEach(([a, b, kind], index) => {
    const [first, second] = delay[a] <= delay[b] ? [a, b] : [b, a];
    edgeA[index] = first;
    edgeB[index] = second;
    edgeKind[index] = kind;
    adjacency[a].push(index);
    adjacency[b].push(index);
  });

  return {
    step,
    count,
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    size: Float32Array.from(sizes),
    delay,
    offsetX,
    offsetY,
    edgeA,
    edgeB,
    edgeKind,
    adjacency,
    lines,
    finish: Math.max(...delay) + FLY + GROW,
  };
}

// The canvas starts under the sticky top bar; the page stays below it and the edition line.
const TOP_CLEAR = 150;

/**
 * Where the page stands: to the right, behind the trends, on wide screens. On phones it is smaller,
 * tucked into the top corner and fainter, since the headline sits right over it.
 */
function placement(width, height) {
  if (width < 760) {
    const size = Math.min(width * 0.62, 260);
    return { cx: width * 0.8, cy: TOP_CLEAR + 24 + size * 0.5, size, strength: 0.6 };
  }
  const container = Math.min(1240, width - 64);
  const size = Math.min(height * 0.62, 560);
  return { cx: width / 2 + container * 0.27, cy: Math.max(height * 0.5, TOP_CLEAR + size * 0.56), size, strength: 1 };
}

export async function startNeural() {
  const host = document.querySelector('.masthead');
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-neural';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');

  // The nameplate is sampled from the page's serif: wait for the web font, but not for long.
  try {
    const serif = cssVar('--serif');
    await Promise.race([
      Promise.all([document.fonts.load(`120px ${serif}`), document.fonts.load(`italic 120px ${serif}`)]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // Fallback fonts sample just as well.
  }
  host.prepend(canvas);

  let width = 0;
  let height = 0;
  let view = placement(1, 1);
  let page = null;
  let px = new Float32Array(0); // where each neuron is drawn this frame
  let py = new Float32Array(0);
  let pz = new Float32Array(0); // perspective scale, ~1 at the page's center
  let shown = new Float32Array(0); // 0 before the neuron appears, 1 once it lands
  let energy = new Float32Array(0); // flash when a signal or a landing lights it up
  let landed = new Uint8Array(0);
  let free = [];
  const pulses = [];
  const fires = []; // [neuron, at] — scheduled flashes for the "reading" sweeps
  // Seconds of animation; only advances while the canvas is on screen, so nobody misses the assembly.
  let elapsed = reducedMotion.matches ? 1e4 : 0;

  const seedFree = () => {
    const random = seeded(7);
    const count = Math.round(Math.min(70, Math.max(18, (width * height) / 15000)));
    free = Array.from({ length: count }, () => {
      const angle = random() * TAU;
      const speed = 6 + random() * 10;
      return { x: random() * width, y: random() * height, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
    });
  };

  const resize = () => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    view = placement(width, height);
    // Keep neurons ~13px apart on screen: a small page gets fewer of them.
    const step = Math.min(0.075, Math.max(0.032, 13 / (view.size / PAGE_H)));
    if (!page || Math.abs(step - page.step) > 0.004) {
      const wasDone = page && elapsed > page.finish;
      page = buildPage(step);
      if (wasDone) page.delay.fill(-10);
      px = new Float32Array(page.count);
      py = new Float32Array(page.count);
      pz = new Float32Array(page.count);
      shown = new Float32Array(page.count);
      energy = new Float32Array(page.count);
      landed = new Uint8Array(page.count);
      pulses.length = 0;
      fires.length = 0;
    }
    seedFree();
    wake();
  };

  // Colors are sampled from CSS, so the network eases along with the page's own color transition.
  const palette = () => {
    const dark = isDarkTheme();
    const accent = varRgb('--accent');
    // In the light theme the strokes read as printing ink: the accent pulled toward the text color.
    const ink = dark ? accent : accent.map((value, index) => lerp(value, toRgb(cssVar('--ink'))[index], 0.35));
    return { ink, spark: dark ? companion(accent) : accent, strength: dark ? 1 : 0.8, dark };
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

  /** Projects the bent, tilted page onto the screen and moves neurons that are still flying in. */
  const place = (t) => {
    const still = reducedMotion.matches;
    const ry = -0.42 + pointer.x * 0.22 + (still ? 0 : 0.05 * Math.sin(t * 0.13));
    const rx = 0.16 - pointer.y * 0.16 + (still ? 0 : 0.03 * Math.sin(t * 0.17 + 1));
    const rz = 0.05;
    const [sy, cy, sx, cx, sz, cz] = [Math.sin(ry), Math.cos(ry), Math.sin(rx), Math.cos(rx), Math.sin(rz), Math.cos(rz)];
    const scale = view.size / PAGE_H;
    const camera = 2.4;
    for (let i = 0; i < page.count; i++) {
      const X = page.x[i];
      const Y = page.y[i];
      // A held newspaper bows: the side edges come toward the reader, and the paper ripples.
      const Z = -0.08 * (2 * X) ** 2 + (still ? 0 : 0.014 * Math.sin(t * 0.7 + Y * 4 + X * 2));
      const x1 = X * cy + Z * sy;
      const z1 = -X * sy + Z * cy;
      const y2 = Y * cx - z1 * sx;
      const z2 = Y * sx + z1 * cx;
      const x3 = x1 * cz - y2 * sz;
      const y3 = x1 * sz + y2 * cz;
      const perspective = camera / (camera + z2);
      let x = view.cx + x3 * scale * perspective;
      let y = view.cy + y3 * scale * perspective;
      const progress = clamp01((elapsed - page.delay[i]) / FLY);
      if (progress < 1) {
        const away = 1 - easeInOut(progress);
        x += page.offsetX[i] * view.size * away;
        y += page.offsetY[i] * view.size * away;
      } else if (!landed[i]) {
        landed[i] = 1;
        if (elapsed - page.delay[i] < FLY + 0.5) energy[i] = Math.max(energy[i], 0.8);
      }
      px[i] = x;
      py[i] = y;
      pz[i] = perspective;
      shown[i] = elapsed >= page.delay[i] ? Math.min(1, progress * 3) : 0;
    }
  };

  const edgeProgress = (index) => clamp01((elapsed - page.delay[page.edgeB[index]] - FLY) / GROW);

  const sendPulse = (from, previousEdge, hops) => {
    const options = page.adjacency[from].filter((index) => index !== previousEdge && edgeProgress(index) >= 1);
    if (!options.length) return;
    // Signals prefer the strokes of the page over the web between them.
    const inked = options.filter((index) => page.edgeKind[index] === INK);
    const pool = inked.length && Math.random() < 0.7 ? inked : options;
    const edge = pool[Math.floor(Math.random() * pool.length)];
    const to = page.edgeA[edge] === from ? page.edgeB[edge] : page.edgeA[edge];
    const length = Math.hypot(px[to] - px[from], py[to] - py[from]);
    pulses.push({ from, to, edge, t: 0, duration: Math.max(0.18, length / 150), hops });
  };

  let nextPulse = 0;
  let nextSweep = 2;
  const simulate = (dt) => {
    for (let i = 0; i < page.count; i++) energy[i] *= Math.exp(-dt * 2.6);
    if (reducedMotion.matches) return;

    for (const particle of free) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (particle.x < -20) particle.x = width + 20;
      if (particle.x > width + 20) particle.x = -20;
      if (particle.y < -20) particle.y = height + 20;
      if (particle.y > height + 20) particle.y = -20;
    }

    const live = elapsed > 1.2;
    const maxPulses = width < 760 ? 12 : 26;
    if (live && elapsed > nextPulse && pulses.length < maxPulses) {
      nextPulse = elapsed + 0.08 + Math.random() * 0.25;
      const from = Math.floor(Math.random() * page.count);
      if (landed[from]) sendPulse(from, -1, 0);
    }
    for (let index = pulses.length - 1; index >= 0; index--) {
      const pulse = pulses[index];
      pulse.t += dt / pulse.duration;
      if (pulse.t < 1) continue;
      pulses.splice(index, 1);
      energy[pulse.to] = 1;
      if (pulse.hops < 9 && Math.random() < 0.72) sendPulse(pulse.to, pulse.edge, pulse.hops + 1);
    }

    // Now and then a line of the page "reads" itself, left to right.
    if (elapsed > page.finish && elapsed > nextSweep) {
      nextSweep = elapsed + 3 + Math.random() * 4;
      const line = page.lines[Math.floor(Math.random() * page.lines.length)];
      line.forEach((neuron, order) => fires.push([neuron, elapsed + order * 0.05]));
    }
    for (let index = fires.length - 1; index >= 0; index--) {
      if (elapsed < fires[index][1]) continue;
      energy[fires[index][0]] = 1;
      fires.splice(index, 1);
    }
  };

  const draw = () => {
    const { ink, spark } = current;
    const strength = current.strength * view.strength;
    const dark = target.dark;
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    context.lineCap = 'round';

    // Loose neurons drift around and link to each other, and to the page, when they come close.
    if (!reducedMotion.matches) {
      context.lineWidth = 0.7;
      for (let i = 0; i < free.length; i++) {
        const a = free[i];
        for (let j = i + 1; j < free.length; j++) {
          const b = free[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (dx * dx + dy * dy > 130 * 130) continue;
          const distance = Math.sqrt(dx * dx + dy * dy);
          context.strokeStyle = rgba(ink, (1 - distance / 130) * 0.16 * strength);
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
        // Plain squared distances: this loop runs for every loose neuron against the whole page.
        let best = -1;
        let bestSquared = 90 * 90;
        for (let n = 0; n < page.count; n++) {
          if (shown[n] < 1) continue;
          const dx = a.x - px[n];
          const dy = a.y - py[n];
          const squared = dx * dx + dy * dy;
          if (squared < bestSquared) {
            best = n;
            bestSquared = squared;
          }
        }
        if (best >= 0) {
          context.strokeStyle = rgba(ink, (1 - Math.sqrt(bestSquared) / 90) * 0.22 * strength);
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(px[best], py[best]);
          context.stroke();
        }
      }
      context.fillStyle = rgba(ink, 0.45 * strength);
      context.beginPath();
      for (const particle of free) {
        context.moveTo(particle.x + 1.3, particle.y);
        context.arc(particle.x, particle.y, 1.3, 0, TAU);
      }
      context.fill();
    }

    // The page's links, by kind, each growing out of the neuron that landed first.
    const styles = [
      [dark ? 0.34 : 0.3, 1],
      [dark ? 0.14 : 0.13, 0.75],
      [dark ? 0.09 : 0.08, 0.7],
    ];
    styles.forEach(([alpha, lineWidth], kind) => {
      context.beginPath();
      for (let index = 0; index < page.edgeA.length; index++) {
        if (page.edgeKind[index] !== kind) continue;
        const progress = edgeProgress(index);
        if (progress <= 0) continue;
        const a = page.edgeA[index];
        const b = page.edgeB[index];
        context.moveTo(px[a], py[a]);
        context.lineTo(lerp(px[a], px[b], progress), lerp(py[a], py[b], progress));
      }
      context.strokeStyle = rgba(ink, alpha * strength);
      context.lineWidth = lineWidth;
      context.stroke();
    });

    // Links next to a flashing neuron light up with it.
    context.lineWidth = 1.2;
    for (let index = 0; index < page.edgeA.length; index++) {
      const a = page.edgeA[index];
      const b = page.edgeB[index];
      const glow = Math.max(energy[a], energy[b]);
      if (glow < 0.06 || edgeProgress(index) < 1) continue;
      context.strokeStyle = rgba(spark, glow * (dark ? 0.55 : 0.45) * strength);
      context.beginPath();
      context.moveTo(px[a], py[a]);
      context.lineTo(px[b], py[b]);
      context.stroke();
    }

    // Neurons: landed ones in one batch, the ones still flying in one by one as they fade in.
    context.fillStyle = rgba(ink, (dark ? 0.75 : 0.62) * strength);
    context.beginPath();
    for (let i = 0; i < page.count; i++) {
      if (shown[i] < 1) continue;
      const radius = 1.25 * page.size[i] * pz[i];
      context.moveTo(px[i] + radius, py[i]);
      context.arc(px[i], py[i], radius, 0, TAU);
    }
    context.fill();
    for (let i = 0; i < page.count; i++) {
      if (shown[i] <= 0 || shown[i] >= 1) continue;
      context.fillStyle = rgba(ink, shown[i] * (dark ? 0.75 : 0.62) * strength);
      context.beginPath();
      context.arc(px[i], py[i], 1.25 * page.size[i] * pz[i], 0, TAU);
      context.fill();
    }

    // Flashes and the signals traveling between neurons.
    const glow = (x, y, amount, radius) => {
      context.fillStyle = rgba(spark, amount * (dark ? 0.22 : 0.16) * strength);
      context.beginPath();
      context.arc(x, y, radius * 4.5, 0, TAU);
      context.fill();
      context.fillStyle = rgba(dark ? spark.map((value) => lerp(value, 1, 0.55)) : spark, amount * 0.9 * strength);
      context.beginPath();
      context.arc(x, y, radius * 1.5, 0, TAU);
      context.fill();
    };
    for (let i = 0; i < page.count; i++) if (energy[i] > 0.04 && shown[i] > 0) glow(px[i], py[i], energy[i], 1.3 * page.size[i] * pz[i]);
    context.lineWidth = 1.6;
    for (const pulse of pulses) {
      const head = easeInOut(clamp01(pulse.t));
      const tail = Math.max(0, head - 0.35);
      const x = lerp(px[pulse.from], px[pulse.to], head);
      const y = lerp(py[pulse.from], py[pulse.to], head);
      context.strokeStyle = rgba(spark, 0.6 * strength);
      context.beginPath();
      context.moveTo(lerp(px[pulse.from], px[pulse.to], tail), lerp(py[pulse.from], py[pulse.to], tail));
      context.lineTo(x, y);
      context.stroke();
      glow(x, y, 1, 1.4);
    }

    // The pointer joins the network: it links to the neurons around it.
    if (finePointer.matches && pointer.clientX >= 0) {
      const rect = canvas.getBoundingClientRect();
      const x = pointer.clientX - rect.left;
      const y = pointer.clientY - rect.top;
      if (x >= 0 && y >= 0 && x <= width && y <= height) {
        const near = [];
        for (let i = 0; i < page.count; i++) {
          if (shown[i] < 1) continue;
          const dx = px[i] - x;
          const dy = py[i] - y;
          if (dx * dx + dy * dy < 150 * 150) near.push([px[i], py[i], Math.sqrt(dx * dx + dy * dy)]);
        }
        for (const particle of free) {
          const distance = Math.hypot(particle.x - x, particle.y - y);
          if (distance < 150) near.push([particle.x, particle.y, distance]);
        }
        near.sort((a, b) => a[2] - b[2]);
        context.lineWidth = 0.8;
        for (const [nx, ny, distance] of near.slice(0, 6)) {
          context.strokeStyle = rgba(spark, (1 - distance / 150) * 0.5 * strength);
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(nx, ny);
          context.stroke();
        }
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
      pointer.x = lerp(pointer.x, pointer.tx, 0.03);
      pointer.y = lerp(pointer.y, pointer.ty, 0.03);
    }
    simulate(dt);
    place(elapsed);
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
    // With reduced motion the page is drawn still; redraw only while a color change eases in.
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
    elapsed = 1e4;
    wake();
  });
  requestAnimationFrame(() => canvas.classList.add('is-ready'));
}
