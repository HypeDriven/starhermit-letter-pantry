// Letter Pantry — Three.js presentation layer. Cosmetic only: consumes
// immutable state snapshots, never mutates rules state. If THREE is missing
// or WebGL is unavailable, every method no-ops and the DOM UI stays playable.

import { themeById } from './content.mjs';
import { makeStreams } from './rules.mjs';

// Named camera framing constants (no magic offsets).
export const FRAMING = {
  fov: 36,
  trayY: 0,
  cameraPos: [0, 5.2, 7.4],
  lookAt: [0, 0.4, 0],
  biscuitSize: 1.0,
  biscuitGap: 0.18,
  selectLift: 0.55,
};

const LAYERS = { environment: 0, gameplay: 1, selection: 2, effects: 3 };

export const QUALITY_TIERS = {
  low: { shadows: false, pixelRatioCap: 1, particles: 0, renderScale: 0.85, antialias: false },
  medium: { shadows: true, pixelRatioCap: 1.5, particles: 300, renderScale: 1, antialias: true },
  high: { shadows: true, pixelRatioCap: 2, particles: 800, renderScale: 1, antialias: true },
};

function makeNullRenderer(reason) {
  return {
    available: false, reason,
    update() {}, setQuality() {}, setReducedMotion() {}, setTheme() {},
    resize() {}, resetCamera() {}, onCommandEvents() {}, dispose() {},
  };
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

  const state = {
    quality: 'medium',
    reducedMotion: false,
    theme: themeById(opts.theme || 'classic'),
    snapshot: null,
    biscuits: [],
    contextLost: false,
    disposed: false,
  };

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FRAMING.fov, 1, 0.1, 60);
  camera.position.set(...FRAMING.cameraPos);
  camera.lookAt(...FRAMING.lookAt);

  // --- Lights: one key, soft fill, ambient floor ----------------------------
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(4, 8, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -8; keyLight.shadow.camera.right = 8;
  keyLight.shadow.camera.top = 8; keyLight.shadow.camera.bottom = -8;
  keyLight.layers.enableAll();
  scene.add(keyLight);
  const fillLight = new THREE.HemisphereLight(0xfff2dd, 0x40301c, 0.7);
  scene.add(fillLight);

  // --- Layer groups ----------------------------------------------------------
  const groups = {};
  for (const name of Object.keys(LAYERS)) {
    const g = new THREE.Group();
    g.name = 'layer-' + name;
    scene.add(g);
    groups[name] = g;
  }

  // --- Environment: shelf wall, shelf boards, jars, tray --------------------
  const envParts = [];
  function buildEnvironment(theme) {
    for (const m of envParts) { m.geometry && m.geometry.dispose(); groups.environment.remove(m); }
    envParts.length = 0;
    const add = (mesh) => { envParts.push(mesh); groups.environment.add(mesh); return mesh; };

    const wallMat = new THREE.MeshStandardMaterial({ color: theme.bg, roughness: 0.95 });
    const wall = add(new THREE.Mesh(new THREE.BoxGeometry(24, 14, 0.5), wallMat));
    wall.position.set(0, 4, -4.5);
    wall.receiveShadow = true;

    const shelfMat = new THREE.MeshStandardMaterial({ color: theme.shelf, roughness: 0.8, metalness: 0.05 });
    for (const y of [-0.6, 3.4]) {
      const board = add(new THREE.Mesh(new THREE.BoxGeometry(20, 0.35, 3.4), shelfMat));
      board.position.set(0, y, -2.5);
      board.receiveShadow = true; board.castShadow = true;
    }
    // Deterministic decoration: jars & tins from the decoration stream.
    const rng = makeStreams('pantry-decor').decoration;
    const jarColors = [0xc96f4a, 0x7a9a5b, 0xc9a44a, 0x5b7a9a, 0x9a5b7a];
    for (let i = 0; i < 7; i++) {
      const h = 0.7 + rng() * 0.9;
      const jar = add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.28 + rng() * 0.14, 0.32 + rng() * 0.14, h, 14),
        new THREE.MeshStandardMaterial({ color: jarColors[Math.floor(rng() * jarColors.length)], roughness: 0.5, metalness: 0.15 })
      ));
      jar.position.set(-7 + i * 2.3 + rng() * 0.8, 3.4 + 0.18 + h / 2, -2.6 + (rng() - 0.5));
      jar.castShadow = true;
    }
    // Floor: contact grounding via large soft-shaded plane.
    const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(40, 24),
      new THREE.MeshStandardMaterial({ color: theme.bg, roughness: 1 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.25;
    floor.receiveShadow = true;

    // Tray: base + four rims.
    const trayMat = new THREE.MeshStandardMaterial({ color: theme.tray, roughness: 0.65, metalness: 0.05 });
    const tray = add(new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 4.4), trayMat));
    tray.position.y = -0.15;
    tray.receiveShadow = true; tray.castShadow = true;
    const rimGeoLong = new THREE.BoxGeometry(11.3, 0.5, 0.25);
    const rimGeoShort = new THREE.BoxGeometry(0.25, 0.5, 4.4);
    for (const [geo, x, z] of [[rimGeoLong, 0, 2.15], [rimGeoLong, 0, -2.15], [rimGeoShort, 5.55, 0], [rimGeoShort, -5.55, 0]]) {
      const rim = add(new THREE.Mesh(geo, trayMat));
      rim.position.set(x, 0.1, z);
      rim.castShadow = true;
    }
    // Radial contact gradient under the tray (works even with shadows off).
    const gradCanvas = document.createElement('canvas');
    gradCanvas.width = gradCanvas.height = 128;
    const g2 = gradCanvas.getContext('2d');
    const grad = g2.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
    const gradTex = new THREE.CanvasTexture(gradCanvas);
    const shadowPlane = add(new THREE.Mesh(new THREE.PlaneGeometry(14, 7),
      new THREE.MeshBasicMaterial({ map: gradTex, transparent: true, depthWrite: false })));
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.2;
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

  const textureCache = new Map();
  function letterTexture(letter, theme) {
    const key = letter + ':' + theme.id;
    if (textureCache.has(key)) return textureCache.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = theme.letter;
    ctx.font = 'bold 84px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(letter.toUpperCase(), 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(key, tex);
    return tex;
  }

  const biscuitGeo = new THREE.ExtrudeGeometry(roundedRectShape(FRAMING.biscuitSize, 0.22),
    { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 6 });
  biscuitGeo.rotateX(-Math.PI / 2);

  function buildBiscuits(letters, theme) {
    for (const b of state.biscuits) {
      groups.gameplay.remove(b.mesh);
      groups.selection.remove(b.marker);
      b.mesh.material.forEach((m) => m.dispose());
      b.marker.material.dispose(); b.marker.geometry.dispose();
    }
    state.biscuits = [];
    const n = letters.length;
    const span = n * (FRAMING.biscuitSize + FRAMING.biscuitGap) - FRAMING.biscuitGap;
    letters.forEach((letter, i) => {
      const sideMat = new THREE.MeshStandardMaterial({ color: theme.biscuit, roughness: 0.55, metalness: 0.02 });
      const topMat = new THREE.MeshStandardMaterial({
        color: theme.biscuit, roughness: 0.5,
        map: letterTexture(letter, theme),
        emissive: new THREE.Color(theme.accent), emissiveIntensity: 0,
      });
      const mesh = new THREE.Mesh(biscuitGeo, [topMat, sideMat]);
      const x = -span / 2 + FRAMING.biscuitSize / 2 + i * (FRAMING.biscuitSize + FRAMING.biscuitGap);
      mesh.position.set(x, 0.22, 0);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.layers.set(LAYERS.gameplay);
      groups.gameplay.add(mesh);
      // Grounded selection marker ring.
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.72, 28),
        new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(x, 0.02, 0);
      marker.raycast = () => {};
      marker.layers.set(LAYERS.selection);
      groups.selection.add(marker);
      state.biscuits.push({ mesh, marker, topMat, x, lift: 0, letter, index: i });
    });
  }

  // --- Particle pool (bounded, never raycastable) ---------------------------
  const MAX_PARTICLES = 800;
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(MAX_PARTICLES * 3);
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const particleMat = new THREE.PointsMaterial({ color: 0xffe2a0, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.raycast = () => {};
  particles.frustumCulled = false;
  particles.layers.set(LAYERS.effects);
  groups.effects.add(particles);
  const particlePool = []; // {x,y,z,vx,vy,vz,life}
  let activeParticles = 0;

  function burst(x, y, z, count) {
    const cap = QUALITY_TIERS[state.quality].particles;
    if (cap === 0 || state.reducedMotion) return;
    const n = Math.min(count, cap - activeParticles);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      particlePool.push({
        x, y, z,
        vx: Math.cos(a) * (0.5 + Math.random()), vy: 1.5 + Math.random() * 1.5, vz: Math.sin(a) * (0.5 + Math.random()),
        life: 1,
      });
    }
  }

  // --- Camera nudge (event-tiered, disabled by reduced motion) ---------------
  let camKick = 0;
  const camBase = FRAMING.cameraPos.slice();

  function applyQuality(tier) {
    const q = QUALITY_TIERS[tier] || QUALITY_TIERS.medium;
    state.quality = tier in QUALITY_TIERS ? tier : 'medium';
    renderer.shadowMap.enabled = q.shadows;
    keyLight.castShadow = q.shadows;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatioCap) * q.renderScale;
    renderer.setPixelRatio(pr);
    resize();
  }

  function resize() {
    const w = canvas.clientWidth || canvas.width || 1;
    const h = canvas.clientHeight || canvas.height || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
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
    if (state.snapshot) refreshFromSnapshot(state.snapshot);
    if (opts.onContextRestored) opts.onContextRestored();
  });

  function refreshFromSnapshot(snapshot) {
    const theme = themeById(snapshot.theme);
    if (theme.id !== state.theme.id) { state.theme = theme; buildEnvironment(theme); }
    const lettersKey = snapshot.letters.join('');
    if (!state.biscuits.length || state.biscuits.map((b) => b.letter).join('') !== lettersKey) {
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
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    const snap = state.snapshot;
    if (snap) {
      const selectedSet = new Set(snap.selected);
      const time = t / 1000;
      state.biscuits.forEach((b, i) => {
        const isSel = selectedSet.has(i);
        const order = isSel ? snap.selected.indexOf(i) : -1;
        const targetLift = isSel ? FRAMING.selectLift : 0;
        b.lift += (targetLift - b.lift) * Math.min(1, dt * 14); // critically-damped-ish settle
        const idle = state.reducedMotion ? 0 : Math.sin(time * 1.4 + i * 0.9) * 0.02;
        b.mesh.position.y = 0.22 + b.lift + idle;
        b.mesh.position.z = isSel ? -0.4 - order * 0.02 : 0;
        b.topMat.emissiveIntensity = isSel ? 0.55 : Math.max(0, b.topMat.emissiveIntensity - dt * 3);
        b.marker.material.opacity = isSel ? 0.85 : Math.max(0, b.marker.material.opacity - dt * 4);
        b.marker.scale.setScalar(isSel ? 1 + Math.sin(time * 4) * 0.04 : 1);
      });
    }
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
      particleGeo.setDrawRange(0, write);
    }
    // Camera: authored base pose + decaying event kick. Never cumulative lerp.
    camKick = Math.max(0, camKick - dt * 0.6);
    const kick = state.reducedMotion ? 0 : camKick;
    camera.position.set(camBase[0], camBase[1] + kick * 0.4, camBase[2] - kick);
    camera.lookAt(...FRAMING.lookAt);
    renderer.render(scene, camera);
  }

  function resetCamera() {
    camKick = 0;
    camera.position.set(...camBase);
    camera.lookAt(...FRAMING.lookAt);
  }

  function setTheme(themeId) {
    state.theme = themeById(themeId);
    buildEnvironment(state.theme);
    if (state.snapshot) buildBiscuits(state.snapshot.letters, state.theme);
  }

  function dispose() {
    state.disposed = true;
    cancelAnimationFrame(rafId);
    for (const b of state.biscuits) {
      b.mesh.material.forEach((m) => m.dispose());
      b.marker.material.dispose(); b.marker.geometry.dispose();
    }
    for (const m of envParts) { m.geometry.dispose(); m.material.dispose(); }
    biscuitGeo.dispose(); particleGeo.dispose(); particleMat.dispose();
    for (const tex of textureCache.values()) tex.dispose();
    textureCache.clear();
    renderer.dispose();
  }

  buildEnvironment(state.theme);
  applyQuality(opts.quality || 'medium');
  if (opts.reducedMotion) state.reducedMotion = true;
  resize();
  rafId = requestAnimationFrame(frame);

  return {
    available: true,
    update,
    onCommandEvents,
    setQuality: applyQuality,
    setReducedMotion(v) { state.reducedMotion = !!v; },
    setTheme,
    resize,
    resetCamera,
    dispose,
  };
}
