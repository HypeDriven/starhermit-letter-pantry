// Letter Pantry — Three.js presentation layer. Cosmetic only: consumes
// immutable state snapshots, never mutates rules state. If THREE is missing
// or WebGL is unavailable, every method no-ops and the DOM UI stays playable.
//
// Graphics quality comes from gfx.js (presets + per-category overrides) and is
// applied live through setGraphics(). Post-processing addons are loaded lazily
// from the same-revision vendored three/addons; if they fail, the scene renders
// directly and graphicsInfo() reports postFailed.

import { themeById } from './content.js';
import { makeStreams } from './rules.js';
import { resolve, detectPreset, describe, SHADOW_MAP, PARTICLE_CAP, DUST_COUNT } from './gfx.js';

// Named camera framing constants (no magic offsets).
export const FRAMING = {
  fov: 40,
  cameraPos: [0, 4.6, 8.4],
  lookAt: [0, 0.9, -0.5],
  biscuitSize: 1.0,
  biscuitGap: 0.18,
  biscuitTilt: 0.36, // biscuits lean back so their letters face the camera
  selectLift: 0.55,
  fitMargin: 1.4,
};

// Region the key light's shadow frustum is fitted to: tray, counter and the jar shelf.
const SHADOW_REGION = { x: [-8, 8], y: [-0.4, 4.6], z: [-4.4, 2.6] };

const LAYERS = { environment: 0, gameplay: 1, selection: 2, effects: 3 };

function makeNullRenderer(reason) {
  return {
    available: false, reason,
    update() {}, setGraphics() {}, graphicsInfo() { return null; }, setReducedMotion() {}, setTheme() {},
    resize() {}, resetCamera() {}, onCommandEvents() {}, dispose() {},
  };
}

// Colour grade + vignette (display-space in, display-space out): gentle S-curve,
// a touch of saturation, warm highlights and a soft pantry vignette.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 1.0 }, uVignette: { value: 0.3 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = clamp(src.rgb, 0.0, 1.0);
      vec3 s = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
      float l = dot(s, vec3(0.299, 0.587, 0.114));
      s = mix(vec3(l), s, 1.07);
      s *= mix(vec3(0.97, 0.98, 1.03), vec3(1.04, 1.0, 0.95), smoothstep(0.25, 0.85, l));
      c = mix(c, s, uAmount);
      float d = length((vUv - 0.5) * vec2(1.0, 0.85));
      c *= 1.0 - uVignette * smoothstep(0.3, 0.8, d);
      gl_FragColor = vec4(c, src.a);
    }`,
};

function gpuName(gl) {
  try {
    // Firefox deprecates the debug extension (and warns); its RENDERER is already unmasked.
    if (!/firefox/i.test(navigator.userAgent)) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    }
    return String(gl.getParameter(gl.RENDERER) || '');
  } catch { return ''; }
}

function isTouchDevice() {
  try {
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  } catch { return false; }
}

function prefersReducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// --- Procedural canvas textures ------------------------------------------------
function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
function shade(c, f) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const m = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return (m(r) << 16) | (m(g) << 8) | m(b);
}
function rgba(c, a) { return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`; }

function woodCanvas(base, rng, w = 512, h = 256, planks = 0) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = hex(base); g.fillRect(0, 0, w, h);
  const lanes = planks || 1;
  const lw = w / lanes;
  for (let p = 0; p < lanes; p++) {
    const tone = shade(base, (rng() - 0.5) * 0.18);
    g.fillStyle = hex(tone);
    g.fillRect(p * lw, 0, lw, h);
    // Grain: long wavy strokes along the board.
    for (let i = 0; i < 46; i++) {
      const y0 = rng() * h;
      g.strokeStyle = rng() < 0.5 ? rgba(shade(tone, -0.35), 0.18 + rng() * 0.2) : rgba(shade(tone, 0.25), 0.12 + rng() * 0.12);
      g.lineWidth = 0.6 + rng() * 1.6;
      g.beginPath();
      const amp = 1 + rng() * 3, freq = 0.01 + rng() * 0.02, ph = rng() * 6;
      for (let x = p * lw; x <= (p + 1) * lw; x += 8) g.lineTo(x, y0 + Math.sin(x * freq + ph) * amp);
      g.stroke();
    }
    if (planks) { // seams between boards
      g.fillStyle = rgba(shade(base, -0.6), 0.75);
      g.fillRect(p * lw, 0, 2, h);
    }
  }
  return c;
}

function speckle(g, w, h, rng, base, n) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rng() < 0.6 ? rgba(shade(base, -0.45), 0.35) : rgba(shade(base, 0.35), 0.3);
    const r = 0.6 + rng() * 1.6;
    g.beginPath(); g.arc(rng() * w, rng() * h, r, 0, Math.PI * 2); g.fill();
  }
}

export function createRenderer(canvas, opts = {}) {
  const THREE = globalThis.THREE;
  if (!THREE) return makeNullRenderer('three-missing');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) return makeNullRenderer('webgl-unavailable');
  } catch {
    return makeNullRenderer('webgl-unavailable');
  }

  const gpu = gpuName(renderer.getContext());
  const detected = detectPreset(gpu, { mobile: isTouchDevice() });

  const state = {
    q: resolve({}, detected),
    savedJson: null,
    reducedMotion: false,
    theme: themeById(opts.theme || 'classic'),
    snapshot: null,
    biscuits: [],
    contextLost: false,
    disposed: false,
    time: 0,
  };
  const idleSnapshot = { letters: 'pantry'.split(''), selected: [] };

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FRAMING.fov, 1, 0.1, 120);
  camera.layers.enableAll(); // biscuits, markers and particles live on their own layers
  const lookAt = new THREE.Vector3(...FRAMING.lookAt);
  const viewDir = new THREE.Vector3(...FRAMING.cameraPos).sub(lookAt);
  const baseDist = viewDir.length();
  viewDir.normalize();
  const camBase = new THREE.Vector3(...FRAMING.cameraPos);

  // --- Lights: warm key with fitted PCF shadows, hemisphere fill, pantry bulb ---
  const keyLight = new THREE.DirectionalLight(0xfff0dc, 2.0);
  keyLight.position.set(5, 9, 6);
  keyLight.target.position.set(0, 0.4, -0.8);
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.02;
  keyLight.shadow.radius = 3;
  keyLight.layers.enableAll();
  scene.add(keyLight, keyLight.target);
  fitShadowFrustum();
  const fillLight = new THREE.HemisphereLight(0xfff2dd, 0x3a2a1a, 0.6);
  scene.add(fillLight);
  const bulb = new THREE.PointLight(0xffc27a, 22, 16, 1.6);
  bulb.position.set(-4, 5.4, 1.2);
  scene.add(bulb);

  // Orthographic shadow box fitted tightly around SHADOW_REGION in light space.
  function fitShadowFrustum() {
    const m = new THREE.Matrix4().lookAt(keyLight.position, keyLight.target.position, new THREE.Vector3(0, 1, 0));
    m.setPosition(keyLight.position);
    const inv = m.invert();
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const v = new THREE.Vector3();
    for (const x of SHADOW_REGION.x) for (const y of SHADOW_REGION.y) for (const z of SHADOW_REGION.z) {
      v.set(x, y, z).applyMatrix4(inv);
      lo.min(v); hi.max(v);
    }
    const cam = keyLight.shadow.camera;
    Object.assign(cam, { left: lo.x, right: hi.x, bottom: lo.y, top: hi.y, near: Math.max(0.1, -hi.z - 1), far: -lo.z + 1 });
    cam.updateProjectionMatrix();
  }

  // --- Layer groups ----------------------------------------------------------
  const groups = {};
  for (const name of Object.keys(LAYERS)) {
    const g = new THREE.Group();
    g.name = 'layer-' + name;
    scene.add(g);
    groups[name] = g;
  }

  // --- Environment textures (per theme, detailed tier only) -----------------
  let envTextures = [];
  function canvasTex(c, repeat, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    envTextures.push(t);
    return t;
  }

  // --- Environment: plank wall, counter, shelves, jars, tray -----------------
  const envParts = [];
  function disposeMaterial(m) {
    for (const mat of Array.isArray(m) ? m : [m]) mat.dispose();
  }
  function buildEnvironment(theme) {
    for (const m of envParts) { m.geometry && m.geometry.dispose(); m.material && disposeMaterial(m.material); groups.environment.remove(m); }
    envParts.length = 0;
    for (const t of envTextures) t.dispose();
    envTextures = [];
    const detailed = state.q.detail === 'detailed';
    const rng = makeStreams('pantry-decor').decoration;
    scene.background = new THREE.Color(shade(theme.bg, -0.35));
    const add = (mesh, cast = false, receive = true) => {
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      envParts.push(mesh); groups.environment.add(mesh); return mesh;
    };
    const wood = (base, repeat, planks, extra = {}) => {
      if (!detailed) return new THREE.MeshStandardMaterial({ color: base, roughness: extra.roughness ?? 0.8, metalness: 0.02 });
      const tex = canvasTex(woodCanvas(base, rng, 512, 256, planks), repeat);
      return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.2, roughness: extra.roughness ?? 0.72, metalness: 0.02 });
    };

    // Back wall: vertical boards.
    const wallMat = wood(shade(theme.bg, 0.12), [3, 1], 8, { roughness: 0.92 });
    if (detailed) { wallMat.map.rotation = Math.PI / 2; wallMat.map.center.set(0.5, 0.5); }
    const wall = add(new THREE.Mesh(new THREE.BoxGeometry(44, 30, 0.5), wallMat));
    wall.position.set(0, 7, -4.65);

    // Counter the tray sits on, and the cabinet front below it.
    const counterMat = wood(theme.shelf, [3, 1], 0, { roughness: 0.6 });
    const counter = add(new THREE.Mesh(new THREE.BoxGeometry(34, 0.4, 7.8), counterMat));
    counter.position.set(0, -0.5, -0.7);
    const cabinet = add(new THREE.Mesh(new THREE.BoxGeometry(34, 14, 0.4),
      new THREE.MeshStandardMaterial({ color: shade(theme.shelf, -0.35), roughness: 0.85 })));
    cabinet.position.set(0, -7.7, 3.0);

    // Upper shelves with brackets.
    const shelfMat = wood(shade(theme.shelf, 0.08), [4, 1], 0);
    for (const [y, depth] of [[3.3, 1.7], [6.5, 1.5]]) {
      const board = add(new THREE.Mesh(new THREE.BoxGeometry(30, 0.24, depth), shelfMat), true);
      board.position.set(0, y, -4.4 + depth / 2);
      if (detailed) {
        for (const x of [-8, 0, 8]) {
          const br = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, depth * 0.8), shelfMat), true);
          br.position.set(x, y - 0.46, -4.4 + depth * 0.4);
        }
      }
    }

    // Deterministic decoration: jars and tins from the decoration stream.
    const jarColors = [0xc96f4a, 0x7a9a5b, 0xc9a44a, 0x5b7a9a, 0x9a5b7a];
    const lidColors = [0xc9a14a, 0xb8b8b8, 0x9a6a3a];
    for (let i = 0; i < 9; i++) {
      const h = 0.7 + rng() * 0.9;
      const r = 0.3 + rng() * 0.14;
      const color = jarColors[Math.floor(rng() * jarColors.length)];
      const x = -9.2 + i * 2.3 + (rng() - 0.5) * 0.6;
      const z = -3.6 + (rng() - 0.5) * 0.5;
      const base = 3.42;
      if (!detailed) {
        const jar = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.02, h, 16),
          new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 })), true);
        jar.position.set(x, base + h / 2, z);
        continue;
      }
      // Contents, glass shell, lid and paper label.
      const fill = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, h * (0.55 + rng() * 0.35), 20),
        new THREE.MeshStandardMaterial({ color, roughness: 0.85 })), true);
      fill.geometry.translate(0, fill.geometry.parameters.height / 2, 0);
      fill.position.set(x, base + 0.02, z);
      const glass = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24, 1, true),
        new THREE.MeshPhysicalMaterial({ color: 0xe8f2f0, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false })), false, false);
      glass.position.set(x, base + h / 2, z);
      const lid = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.14, 24),
        new THREE.MeshStandardMaterial({ color: lidColors[i % lidColors.length], roughness: 0.3, metalness: 0.85 })), true);
      lid.position.set(x, base + h + 0.07, z);
      const label = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.28, 24, 1, true, -0.9, 1.8),
        new THREE.MeshStandardMaterial({ color: 0xf1e3c4, roughness: 0.9 })));
      label.position.set(x, base + h * 0.45, z);
    }
    // Tins on the high shelf.
    for (let i = 0; i < 6; i++) {
      const h = 0.8 + rng() * 0.5;
      const tin = add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, h, detailed ? 28 : 14),
        new THREE.MeshStandardMaterial({ color: jarColors[(i + 2) % jarColors.length], roughness: detailed ? 0.35 : 0.5, metalness: detailed ? 0.6 : 0.15 })), true);
      tin.position.set(-7.5 + i * 3 + (rng() - 0.5), 6.62 + h / 2, -3.8);
    }

    // Tray: base + four rims.
    const trayMat = wood(theme.tray, [2, 1], 0, { roughness: 0.55 });
    const tray = add(new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 4.4), trayMat), true);
    tray.position.y = -0.15;
    const rimMat = wood(shade(theme.tray, -0.12), [2, 0.2], 0, { roughness: 0.55 });
    const rimGeoLong = new THREE.BoxGeometry(11.3, 0.5, 0.25);
    const rimGeoShort = new THREE.BoxGeometry(0.25, 0.5, 4.4);
    for (const [geo, x, z] of [[rimGeoLong, 0, 2.15], [rimGeoLong.clone(), 0, -2.15], [rimGeoShort, 5.55, 0], [rimGeoShort.clone(), -5.55, 0]]) {
      const rim = add(new THREE.Mesh(geo, rimMat), true);
      rim.position.set(x, 0.1, z);
    }
    // Radial contact gradient under the tray (grounds it even with shadows off).
    const gradCanvas = document.createElement('canvas');
    gradCanvas.width = gradCanvas.height = 128;
    const g2 = gradCanvas.getContext('2d');
    const grad = g2.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
    const gradTex = new THREE.CanvasTexture(gradCanvas);
    envTextures.push(gradTex);
    const shadowPlane = add(new THREE.Mesh(new THREE.PlaneGeometry(14, 7),
      new THREE.MeshBasicMaterial({ map: gradTex, transparent: true, depthWrite: false })), false, false);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.29;
  }

  // --- Biscuit meshes --------------------------------------------------------
  function roundedRectShape(size, radius) {
    const s = size / 2, r = radius;
    const shape = new THREE.Shape();
    shape.moveTo(-s + r, -s);
    shape.lineTo(s - r, -s); shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r); shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s); shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r); shape.quadraticCurveTo(-s, -s, -s + r, -s);
    return shape;
  }

  // Letter face: biscuit colour, toasted rim, speckles and docking holes on the
  // detailed tier; a matching greyscale bump map debosses the letter.
  const textureCache = new Map();
  function letterTextures(letter, theme, detailed) {
    const key = letter + ':' + theme.id + ':' + (detailed ? 'd' : 'p');
    if (textureCache.has(key)) return textureCache.get(key);
    const S = 256;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
    const c = mk();
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(theme.biscuit);
    ctx.fillRect(0, 0, S, S);
    const rng = makeStreams('biscuit:' + letter).decoration;
    if (detailed) {
      const edge = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
      edge.addColorStop(0, 'rgba(0,0,0,0)');
      edge.addColorStop(1, rgba(shade(theme.biscuit, -0.5), 0.55));
      ctx.fillStyle = edge; ctx.fillRect(0, 0, S, S);
      speckle(ctx, S, S, rng, theme.biscuit, 140);
      ctx.fillStyle = rgba(shade(theme.biscuit, -0.55), 0.6);
      for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
        ctx.beginPath(); ctx.arc(x * S, y * S, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.font = 'bold 168px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (detailed) { // raised-edge highlight
      ctx.fillStyle = rgba(shade(theme.biscuit, 0.45), 0.8);
      ctx.fillText(letter.toUpperCase(), S / 2 - 3, S / 2 + 8);
    }
    ctx.fillStyle = theme.letter;
    ctx.fillText(letter.toUpperCase(), S / 2, S / 2 + 11);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.offset.set(0.5, 0.5); // extrude cap UVs span -0.5..0.5
    map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    let bump = null;
    if (detailed) {
      const b = mk();
      const bx = b.getContext('2d');
      bx.fillStyle = '#808080'; bx.fillRect(0, 0, S, S);
      speckle(bx, S, S, rng, 0x808080, 220);
      bx.fillStyle = '#303030';
      for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
        bx.beginPath(); bx.arc(x * S, y * S, 6, 0, Math.PI * 2); bx.fill();
      }
      bx.font = ctx.font; bx.textAlign = 'center'; bx.textBaseline = 'middle';
      bx.fillStyle = '#4a4a4a';
      bx.fillText(letter.toUpperCase(), S / 2, S / 2 + 11);
      bump = new THREE.CanvasTexture(b);
      bump.offset.set(0.5, 0.5);
    }
    const entry = { map, bump };
    textureCache.set(key, entry);
    return entry;
  }

  let doughTex = null;
  function doughTexture(theme) {
    if (doughTex && doughTex.userData.theme === theme.id) return doughTex;
    doughTex && doughTex.dispose();
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = hex(shade(theme.biscuit, -0.12)); g.fillRect(0, 0, 128, 128);
    speckle(g, 128, 128, makeStreams('dough').decoration, theme.biscuit, 90);
    doughTex = new THREE.CanvasTexture(c);
    doughTex.colorSpace = THREE.SRGBColorSpace;
    doughTex.wrapS = doughTex.wrapT = THREE.RepeatWrapping;
    doughTex.repeat.set(3, 3);
    doughTex.userData.theme = theme.id;
    return doughTex;
  }

  const biscuitGeo = new THREE.ExtrudeGeometry(roundedRectShape(FRAMING.biscuitSize, 0.22),
    { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 8 });
  biscuitGeo.rotateX(-Math.PI / 2);
  const markerGeo = new THREE.RingGeometry(0.55, 0.72, 32);
  const restY = 0.08 + 0.5 * Math.sin(FRAMING.biscuitTilt);

  function buildBiscuits(letters, theme) {
    for (const b of state.biscuits) {
      groups.gameplay.remove(b.mesh);
      groups.selection.remove(b.marker);
      b.mesh.material.forEach((m) => m.dispose());
      b.marker.material.dispose();
    }
    state.biscuits = [];
    const detailed = state.q.detail === 'detailed';
    const n = letters.length;
    const span = n * (FRAMING.biscuitSize + FRAMING.biscuitGap) - FRAMING.biscuitGap;
    letters.forEach((letter, i) => {
      const tex = letterTextures(letter, theme, detailed);
      const topMat = detailed
        ? new THREE.MeshPhysicalMaterial({
          color: 0xffffff, map: tex.map, bumpMap: tex.bump, bumpScale: 2.5, roughness: 0.62,
          clearcoat: 0.3, clearcoatRoughness: 0.5,
          emissive: new THREE.Color(theme.accent), emissiveMap: tex.map, emissiveIntensity: 0,
        })
        : new THREE.MeshStandardMaterial({
          color: 0xffffff, map: tex.map, roughness: 0.55,
          emissive: new THREE.Color(theme.accent), emissiveMap: tex.map, emissiveIntensity: 0,
        });
      const sideMat = detailed
        ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: doughTexture(theme), roughness: 0.7, clearcoat: 0.15, clearcoatRoughness: 0.6 })
        : new THREE.MeshStandardMaterial({ color: shade(theme.biscuit, -0.12), roughness: 0.6 });
      const mesh = new THREE.Mesh(biscuitGeo, [topMat, sideMat]);
      const x = -span / 2 + FRAMING.biscuitSize / 2 + i * (FRAMING.biscuitSize + FRAMING.biscuitGap);
      mesh.position.set(x, restY, 0);
      mesh.rotation.x = FRAMING.biscuitTilt;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.layers.set(LAYERS.gameplay);
      groups.gameplay.add(mesh);
      // Grounded selection marker ring.
      const marker = new THREE.Mesh(markerGeo,
        new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(x, 0.02, -0.4);
      marker.raycast = () => {};
      marker.layers.set(LAYERS.selection);
      groups.selection.add(marker);
      state.biscuits.push({ mesh, marker, topMat, x, lift: 0, letter, index: i });
    });
    fitCamera();
  }

  // --- Particles: celebration bursts + ambient dust motes -------------------
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = spriteCanvas.height = 64;
  {
    const g = spriteCanvas.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }
  const spriteTex = new THREE.CanvasTexture(spriteCanvas);

  const MAX_PARTICLES = PARTICLE_CAP.high;
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(MAX_PARTICLES * 3);
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  // Colour above 1.0 so the sparks feed the bloom pass.
  const particleMat = new THREE.PointsMaterial({ color: new THREE.Color(0xffe2a0).multiplyScalar(2.2), size: 0.16, map: spriteTex, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.raycast = () => {};
  particles.frustumCulled = false;
  particles.layers.set(LAYERS.effects);
  groups.effects.add(particles);
  const particlePool = []; // {x,y,z,vx,vy,vz,life}
  let activeParticles = 0;

  const MAX_DUST = DUST_COUNT.high;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(MAX_DUST * 3);
  const dustSeed = new Float32Array(MAX_DUST * 4);
  {
    const rng = makeStreams('dust').decoration;
    for (let i = 0; i < MAX_DUST; i++) {
      dustSeed[i * 4] = -7 + rng() * 14;
      dustSeed[i * 4 + 1] = -0.2 + rng() * 6.5;
      dustSeed[i * 4 + 2] = -3.8 + rng() * 6;
      dustSeed[i * 4 + 3] = rng() * 100;
    }
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xfff0d0, size: 0.05, map: spriteTex, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.raycast = () => {};
  dust.frustumCulled = false;
  dust.layers.set(LAYERS.effects);
  groups.effects.add(dust);

  function updateDust(time, moving) {
    const n = DUST_COUNT[state.q.particles] || 0;
    dust.visible = n > 0;
    if (!n) return;
    for (let i = 0; i < n; i++) {
      const s = dustSeed[i * 4 + 3];
      const t = moving ? time : 0;
      dustPos[i * 3] = dustSeed[i * 4] + Math.sin(t * 0.13 + s) * 0.6;
      dustPos[i * 3 + 1] = dustSeed[i * 4 + 1] + Math.sin(t * 0.09 + s * 1.7) * 0.4;
      dustPos[i * 3 + 2] = dustSeed[i * 4 + 2] + Math.cos(t * 0.11 + s * 0.6) * 0.4;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.setDrawRange(0, n);
  }

  function burst(x, y, z, count) {
    const cap = PARTICLE_CAP[state.q.particles] || 0;
    if (cap === 0 || state.reducedMotion) return;
    const n = Math.max(0, Math.min(count, cap - activeParticles));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      particlePool.push({
        x, y, z,
        vx: Math.cos(a) * (0.5 + Math.random()), vy: 1.5 + Math.random() * 1.5, vz: Math.sin(a) * (0.5 + Math.random()),
        life: 1,
      });
    }
    activeParticles = particlePool.length;
  }

  // --- Camera: authored pose, pulled back when the biscuits would not fit ------
  let camKick = 0;
  function fitCamera() {
    const n = state.biscuits.length || 3;
    const span = n * (FRAMING.biscuitSize + FRAMING.biscuitGap) - FRAMING.biscuitGap + FRAMING.fitMargin;
    // Wide layouts carry side rails over the canvas, so fit to the middle part.
    const usable = camera.aspect > 1.2 ? 0.56 : 0.94;
    const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(FRAMING.fov / 2)) * camera.aspect * usable);
    const d = Math.max(baseDist, (span / 2) / Math.tan(halfH) + 1.2);
    camBase.copy(lookAt).addScaledVector(viewDir, d);
  }

  // --- Graphics settings -----------------------------------------------------
  let envMap = null;
  let envLoading = false;
  function applyReflections() {
    if (state.q.reflections !== 'on') { scene.environment = null; return; }
    if (envMap) { scene.environment = envMap; return; }
    if (envLoading) return;
    envLoading = true;
    import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
      if (state.disposed) return;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      envMap = pmrem.fromScene(room, 0.04).texture;
      room.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && disposeMaterial(o.material); });
      pmrem.dispose();
      scene.environmentIntensity = 0.3;
      if (state.q.reflections === 'on') scene.environment = envMap;
    }).catch(() => { state.envFailed = true; });
  }

  function setFpsVisible(on) {
    let el = document.getElementById('lp-fps');
    if (on && !el) {
      el = document.createElement('div');
      el.id = 'lp-fps';
      el.className = 'lp-fps';
      el.setAttribute('aria-hidden', 'true');
      el.textContent = '… fps';
      document.body.append(el);
    }
    if (el) el.hidden = !on;
  }

  function setGraphics(saved) {
    const json = JSON.stringify(saved || {});
    if (json === state.savedJson) return;
    const prev = state.q;
    state.savedJson = json;
    const q = resolve(saved || {}, detected);
    state.q = q;
    const size = SHADOW_MAP[q.shadows];
    const shadowsChanged = renderer.shadowMap.enabled !== size > 0;
    renderer.shadowMap.enabled = size > 0;
    keyLight.castShadow = size > 0;
    if (size > 0 && keyLight.shadow.mapSize.x !== size) {
      keyLight.shadow.mapSize.set(size, size);
      if (keyLight.shadow.map) { keyLight.shadow.map.dispose(); keyLight.shadow.map = null; }
    }
    if (shadowsChanged) scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    if (prev.detail !== q.detail || !state.built) {
      state.built = true;
      buildEnvironment(state.theme);
      const snap = state.snapshot || idleSnapshot;
      buildBiscuits(snap.letters, state.theme);
    }
    applyReflections();
    adaptiveScale = 1;
    frameTimes.length = 0;
    postKey = null; // rebuild the post chain on the next frame
    setFpsVisible(q.showFps);
    canvas.dataset.gfxPreset = q.preset;
    document.body.dataset.gfxPreset = q.preset;
  }

  // --- Post-processing ---------------------------------------------------------
  let post = null; // loaded addon modules
  let postLoading = false;
  let postFailed = false;
  let composer = null;
  let postKey = null;
  function loadPost() {
    if (post || postLoading || postFailed) return;
    postLoading = true;
    const base = 'three/addons/';
    Promise.all([
      'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/ShaderPass.js',
      'postprocessing/OutputPass.js', 'postprocessing/UnrealBloomPass.js', 'postprocessing/GTAOPass.js',
      'postprocessing/SMAAPass.js', 'shaders/FXAAShader.js',
    ].map((p) => import(base + p))).then((mods) => {
      post = Object.assign({}, ...mods);
      postLoading = false;
      postKey = null;
    }).catch(() => { postFailed = true; postLoading = false; });
  }

  function buildPost(w, h, pr) {
    const q = state.q;
    if (composer) { composer.dispose(); composer = null; }
    if (!q.post || !post || postFailed) return;
    try {
      const W = Math.max(1, Math.round(w * pr)), H = Math.max(1, Math.round(h * pr));
      const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: q.antialias === 'msaa' ? 4 : 0 });
      const c = new post.EffectComposer(renderer, target);
      c.setPixelRatio(pr);
      c.setSize(w, h);
      c.addPass(new post.RenderPass(scene, camera));
      if (q.ao !== 'off') {
        const ao = new post.GTAOPass(scene, camera, W, H);
        ao.output = post.GTAOPass.OUTPUT.Default;
        ao.blendIntensity = 0.7;
        const hi = q.ao === 'high';
        ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: hi ? 16 : 8 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: hi ? 6 : 4, rings: 2, samples: hi ? 16 : 8 });
        c.addPass(ao);
      }
      if (q.bloom === 'on') {
        // High threshold: only the selection glow, sparks and bright highlights bloom.
        c.addPass(new post.UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.4, 0.9));
      }
      if (q.grade === 'on') c.addPass(new post.ShaderPass(GradeShader));
      c.addPass(new post.OutputPass());
      if (q.antialias === 'smaa') c.addPass(new post.SMAAPass(W, H));
      if (q.antialias === 'fxaa') {
        const fxaa = new post.ShaderPass(post.FXAAShader);
        fxaa.material.uniforms.resolution.value.set(1 / W, 1 / H);
        c.addPass(fxaa);
      }
      composer = c;
    } catch {
      // Post-processing is an enhancement: render directly if the chain cannot be built.
      postFailed = true;
      composer = null;
    }
  }

  // --- Adaptive resolution + frame-rate readout ------------------------------
  let adaptiveScale = 1;
  let fps = 0;
  const frameTimes = [];
  function adapt(dtMs) {
    frameTimes.push(dtMs);
    if (frameTimes.length < 90) return;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    frameTimes.length = 0;
    fps = 1000 / avg;
    const el = document.getElementById('lp-fps');
    if (el && !el.hidden) el.textContent = `${Math.round(fps)} fps · ${Math.round(pixelRatio * 100) / 100}×`;
    if (!state.q.adaptive) { adaptiveScale = 1; return; }
    if (avg > 26) adaptiveScale = Math.max(0.6, adaptiveScale - 0.1);
    else if (avg < 14 && adaptiveScale < 1) adaptiveScale = Math.min(1, adaptiveScale + 0.05);
  }

  let size = [0, 0];
  let pixelRatio = 0;
  function resize() {
    const w = canvas.clientWidth || canvas.width || 1;
    const h = canvas.clientHeight || canvas.height || 1;
    const q = state.q;
    const ratio = Math.min(window.devicePixelRatio || 1, q.dprCap) * q.scale * adaptiveScale;
    if (w === size[0] && h === size[1] && ratio === pixelRatio) return;
    size = [w, h];
    pixelRatio = ratio;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
  }

  // Context-loss handling.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    state.contextLost = true;
    if (opts.onContextLost) opts.onContextLost();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    state.contextLost = false;
    postKey = null;
    if (state.snapshot) refreshFromSnapshot(state.snapshot);
    if (opts.onContextRestored) opts.onContextRestored();
  });

  function refreshFromSnapshot(snapshot) {
    const theme = themeById(snapshot.theme);
    const themeChanged = theme.id !== state.theme.id;
    if (themeChanged) { state.theme = theme; buildEnvironment(theme); }
    const lettersKey = snapshot.letters.join('');
    if (themeChanged || !state.biscuits.length || state.biscuits.map((b) => b.letter).join('') !== lettersKey) {
      buildBiscuits(snapshot.letters, theme);
    }
    state.snapshot = snapshot;
  }

  // Public: consume an immutable snapshot.
  function update(snapshot) {
    if (state.disposed) return;
    refreshFromSnapshot(snapshot);
  }

  function onCommandEvents(events, snapshot) {
    if (state.disposed) return;
    if (snapshot) update(snapshot);
    for (const ev of events || []) {
      if (ev.type === 'word-target' || ev.type === 'word-bonus') {
        const mid = state.biscuits[Math.floor(state.biscuits.length / 2)];
        if (mid) burst(mid.mesh.position.x, 1, 0, ev.type === 'word-target' ? 120 : 60);
        if (!state.reducedMotion) camKick = ev.type === 'word-target' ? 0.12 : 0.05;
      } else if (ev.type === 'terminal' && ev.reason === 'completed') {
        for (const b of state.biscuits) burst(b.mesh.position.x, 1.2, 0, 40);
        if (!state.reducedMotion) camKick = 0.2;
      }
    }
  }

  // Render loop: cosmetic animation only, derived from snapshot + wall clock.
  let rafId = 0;
  let lastT = 0;
  function frame(t) {
    if (state.disposed) return;
    rafId = requestAnimationFrame(frame);
    if (document.hidden || state.contextLost) { lastT = t; return; }
    const dtMs = lastT ? Math.min(250, t - lastT) : 16;
    const dt = Math.min(0.05, dtMs / 1000);
    lastT = t;
    adapt(dtMs);
    resize();
    const ambient = !state.reducedMotion && !prefersReducedMotion() && state.q.background === 'animated';
    if (ambient) state.time += dt;
    const time = state.time;
    const snap = state.snapshot || idleSnapshot;
    const selectedSet = new Set(snap.selected);
    state.biscuits.forEach((b, i) => {
      const isSel = selectedSet.has(i);
      const order = isSel ? snap.selected.indexOf(i) : -1;
      const targetLift = isSel ? FRAMING.selectLift : 0;
      b.lift += (targetLift - b.lift) * Math.min(1, dt * 14); // critically-damped-ish settle
      const idle = state.reducedMotion || !ambient ? 0 : Math.sin(time * 1.4 + i * 0.9) * 0.02;
      b.mesh.position.y = restY + b.lift + idle;
      b.mesh.position.z = isSel ? -0.4 - order * 0.02 : 0;
      b.topMat.emissiveIntensity = isSel ? 0.3 : Math.max(0, b.topMat.emissiveIntensity - dt * 3);
      b.marker.material.opacity = isSel ? 0.85 : Math.max(0, b.marker.material.opacity - dt * 4);
      b.marker.scale.setScalar(isSel && !state.reducedMotion ? 1 + Math.sin(t / 250) * 0.04 : 1);
    });
    // Pantry bulb shimmer.
    bulb.intensity = 22 * (ambient ? 1 + Math.sin(time * 2.1) * 0.04 + Math.sin(time * 5.3) * 0.025 : 1);
    updateDust(time, ambient);
    // Particles.
    if (particlePool.length) {
      let write = 0;
      for (let i = 0; i < particlePool.length; i++) {
        const p = particlePool[i];
        p.life -= dt * 1.4;
        if (p.life <= 0) continue;
        p.vy -= dt * 3.5;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        particlePool[write++] = p;
        particlePos[write * 3 - 3] = p.x; particlePos[write * 3 - 2] = p.y; particlePos[write * 3 - 1] = p.z;
      }
      particlePool.length = write;
      activeParticles = write;
      particleGeo.attributes.position.needsUpdate = true;
    }
    particleGeo.setDrawRange(0, activeParticles);
    // Camera: authored base pose + decaying event kick. Never cumulative lerp.
    camKick = Math.max(0, camKick - dt * 0.6);
    const kick = state.reducedMotion ? 0 : camKick;
    camera.position.set(camBase.x, camBase.y + kick * 0.4, camBase.z - kick);
    camera.lookAt(lookAt);
    // Post chain: rebuilt only when its inputs change; composer used only when non-empty.
    if (state.q.post) loadPost();
    const key = state.q.post && post && !postFailed
      ? [state.q.ao, state.q.bloom, state.q.grade, state.q.antialias, size[0], size[1], pixelRatio].join('|') : 'none';
    if (key !== postKey) { postKey = key; buildPost(size[0], size[1], pixelRatio); }
    if (composer) {
      try { composer.render(dt); } catch { postFailed = true; composer.dispose(); composer = null; renderer.render(scene, camera); }
    } else {
      renderer.render(scene, camera);
    }
  }

  function resetCamera() {
    camKick = 0;
    camera.position.copy(camBase);
    camera.lookAt(lookAt);
  }

  function setTheme(themeId) {
    state.theme = themeById(themeId);
    buildEnvironment(state.theme);
    buildBiscuits((state.snapshot || idleSnapshot).letters, state.theme);
  }

  function graphicsInfo() {
    const px = [Math.round(size[0] * pixelRatio), Math.round(size[1] * pixelRatio)];
    return {
      gpu: gpu || '',
      detected,
      resolved: state.q,
      summary: describe(state.q, px),
      fps: Math.round(fps),
      adaptiveScale: Math.round(adaptiveScale * 100) / 100,
      postFailed: postFailed && state.q.post,
      postActive: !!composer,
    };
  }

  function dispose() {
    state.disposed = true;
    cancelAnimationFrame(rafId);
    for (const b of state.biscuits) {
      b.mesh.material.forEach((m) => m.dispose());
      b.marker.material.dispose();
    }
    for (const m of envParts) { m.geometry.dispose(); disposeMaterial(m.material); }
    for (const t of envTextures) t.dispose();
    biscuitGeo.dispose(); markerGeo.dispose(); particleGeo.dispose(); particleMat.dispose();
    dustGeo.dispose(); dustMat.dispose(); spriteTex.dispose();
    doughTex && doughTex.dispose();
    envMap && envMap.dispose();
    composer && composer.dispose();
    for (const { map, bump } of textureCache.values()) { map.dispose(); bump && bump.dispose(); }
    textureCache.clear();
    renderer.dispose();
  }

  setGraphics(opts.graphics || {});
  if (opts.reducedMotion) state.reducedMotion = true;
  resize();
  rafId = requestAnimationFrame(frame);

  return {
    available: true,
    update,
    onCommandEvents,
    setGraphics,
    graphicsInfo,
    setReducedMotion(v) { state.reducedMotion = !!v; },
    setTheme,
    resize,
    resetCamera,
    dispose,
  };
}
