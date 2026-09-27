// Aurora behind the masthead: a slow domain-warped noise field tinted with the page accent,
// so it follows the selected AI's color. Plain WebGL, no library.
import { isDarkTheme, lerp, onPaletteChange, reducedMotion, varRgb, watchVisibility } from './shared.js';

const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAGMENT = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec2 u_pointer;
uniform float u_strength;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = vec2(uv.x * u_resolution.x / u_resolution.y, uv.y) * 1.35;
  float t = u_time * 0.035;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(
    fbm(p + 2.8 * q + vec2(1.7, 9.2) + 0.6 * t + u_pointer * 0.35),
    fbm(p + 2.8 * q + vec2(8.3, 2.8) - 0.4 * t)
  );
  float field = fbm(p + 2.2 * r);
  float glow = smoothstep(0.32, 0.9, field);
  float veins = smoothstep(0.58, 0.92, fbm(p * 1.6 + 3.0 * r - t));
  vec3 color = mix(u_colorA, u_colorB, smoothstep(0.2, 0.8, r.y));
  float alpha = clamp(glow * 0.85 + veins * 0.4, 0.0, 1.0) * u_strength;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

/** Second hue of the gradient: the accent rotated ~40° and a touch lighter. */
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

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

export function startAurora() {
  const host = document.querySelector('.masthead');
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-aurora';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);

  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) {
    canvas.remove();
    throw new Error('WebGL unavailable');
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniform = (name) => gl.getUniformLocation(program, name);
  const u = {
    resolution: uniform('u_resolution'),
    time: uniform('u_time'),
    colorA: uniform('u_colorA'),
    colorB: uniform('u_colorB'),
    pointer: uniform('u_pointer'),
    strength: uniform('u_strength'),
  };

  // Half resolution: the field is soft anyway and it keeps the GPU cost tiny.
  const SCALE = 0.5;
  const resize = () => {
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * SCALE));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Colors are sampled from CSS, so the aurora eases along with the page's own color transition.
  const target = { a: varRgb('--accent'), strength: isDarkTheme() ? 0.7 : 0.62 };
  const current = { a: [...target.a], b: companion(target.a), strength: target.strength };
  let lastSample = 0;
  const sample = (now) => {
    if (now - lastSample < 120) return;
    lastSample = now;
    target.a = varRgb('--accent');
    target.strength = isDarkTheme() ? 0.7 : 0.62;
  };

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.tx = event.clientX / window.innerWidth - 0.5;
      pointer.ty = 0.5 - event.clientY / window.innerHeight;
    },
    { passive: true },
  );

  let visible = true;
  let running = false;
  const start = performance.now();

  const draw = (now) => {
    sample(now);
    current.a = current.a.map((value, index) => lerp(value, target.a[index], 0.06));
    current.b = companion(current.a);
    current.strength = lerp(current.strength, target.strength, 0.06);
    pointer.x = lerp(pointer.x, pointer.tx, 0.03);
    pointer.y = lerp(pointer.y, pointer.ty, 0.03);
    gl.uniform2f(u.resolution, canvas.width, canvas.height);
    gl.uniform1f(u.time, reducedMotion.matches ? 12 : (now - start) / 1000);
    gl.uniform3fv(u.colorA, current.a);
    gl.uniform3fv(u.colorB, current.b);
    gl.uniform2f(u.pointer, pointer.x, pointer.y);
    gl.uniform1f(u.strength, current.strength);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const settled = () =>
    Math.max(...current.a.map((value, index) => Math.abs(value - target.a[index]))) < 0.002 &&
    Math.abs(current.strength - target.strength) < 0.002;

  const loop = (now) => {
    if (!visible || document.hidden) {
      running = false;
      return;
    }
    draw(now);
    // With reduced motion the field is still; redraw only while a color change eases in.
    if (reducedMotion.matches && settled()) {
      running = false;
      return;
    }
    requestAnimationFrame(loop);
  };
  const wake = () => {
    if (running || !visible || document.hidden) return;
    running = true;
    requestAnimationFrame(loop);
  };

  watchVisibility(canvas, (isVisible) => {
    visible = isVisible;
    wake();
  });
  document.addEventListener('visibilitychange', wake);
  onPaletteChange(() => {
    lastSample = 0;
    wake();
  });
  wake();
  requestAnimationFrame(() => canvas.classList.add('is-ready'));
}
