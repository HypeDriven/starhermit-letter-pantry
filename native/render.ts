// The pantry on starhermit:scene, as the browser build's render.js drew it
// with three.js r170: a board wall, the counter with the biscuit tray and
// its rims, two shelves of jars (glass shells over coloured contents, metal
// lids, paper labels) and tins, a soft contact shadow under the tray, and
// the letter biscuits (extruded rounded squares with a bevel, a letter face,
// speckled dough, docking holes and a debossed letter on detailed surfaces)
// that mirror the tray letter for letter, lean back towards the camera, and
// lift, glow and ring when picked; on the title they spell PANTRY. Sparks
// burst on found words, dust motes drift, the pantry bulb shimmers, and the
// camera — an authored pose, pulled back whenever the biscuits would not
// fit the visible width — kicks briefly on a found word and decays back.
//
// From three.js: light intensities are r170's ÷ π (the engine's
// convention); canvas textures are starhermit:canvas OffscreenCanvases;
// RoomEnvironment(renderer) + PMREM give the reflections at the game's own
// environmentIntensity 0.3 (r170 let scene.environment override the glass's
// envMapIntensity 1.6, so materials keep 1); the post chain (GTAO,
// UnrealBloom threshold 0.9, the GradeShader in display space, FXAA / SMAA /
// MSAA) is renderer.ao / bloom / grade / antialias; the fitted orthographic
// shadow box is the engine's `shadow.distance`. Adaptive resolution, the
// pixel-ratio cap and the frame-rate readout are the runtime's. Cosmetic
// randomness comes from the rules' decoration stream, never the rules'.
import {
  ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry,
  DirectionalLight, DoubleSide, ExtrudeGeometry, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, PointLight, Points, PointsMaterial,
  RepeatWrapping, RingGeometry, RoomEnvironment, Shape, SRGBColorSpace, Vector3, renderer, scene,
  type Material, type Texture,
} from "starhermit:scene";
import { OffscreenCanvas, type OffscreenCanvasRenderingContext2D } from "starhermit:canvas";
import { frame } from "starhermit:engine";
import { Content, Rules, type GameEvent, type Theme } from "./game.ts";
import type { Look } from "./quality.ts";

const PI = Math.PI;
/** render.js FRAMING: named camera framing constants. */
const FRAMING = {
  fov: 40, cameraPos: [0, 4.6, 8.4] as const, lookAt: [0, 0.9, -0.5] as const,
  biscuitSize: 1.0, biscuitGap: 0.18, biscuitTilt: 0.36, selectLift: 0.55, fitMargin: 1.4,
};
const PARTICLE_CAP = { off: 0, low: 300, high: 800 };
const DUST_COUNT = { off: 0, low: 60, high: 160 };

renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const camera = new PerspectiveCamera(FRAMING.fov, 16 / 9, 0.1, 120);
renderer.camera = camera;
const lookAt = new Vector3(...FRAMING.lookAt);
const viewDir = new Vector3(...FRAMING.cameraPos).sub(lookAt);
const baseDist = viewDir.length();
viewDir.normalize();
const camBase = new Vector3(...FRAMING.cameraPos);

let look: Look | null = null;
let reducedMotion = false;
let theme: Theme = Content.themeById("classic");
const IDLE = { letters: "pantry".split(""), selected: [] as number[] };
let shown: { letters: string[]; selected: number[] } = IDLE;

// -- lights: warm key with soft shadows, hemisphere fill, the pantry bulb (r170 ÷ π) -------------
const keyLight = new DirectionalLight(0xfff0dc, 2.0 / PI);
keyLight.position.set(5, 9, 6);
keyLight.target.position.set(0, 0.4, -0.8);
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.02;
keyLight.shadow.distance = 24;
const fillLight = new HemisphereLight(0xfff2dd, 0x3a2a1a, 0.6 / PI);
const bulb = new PointLight(0xffc27a, 22 / PI, 16, 1.6);
bulb.position.set(-4, 5.4, 1.2);
scene.add(keyLight, keyLight.target, fillLight, bulb);

const envGroup = new Group();
const biscuitGroup = new Group();
scene.add(envGroup, biscuitGroup);

// -- canvas helpers (render.js) ------------------------------------------------------------------------
const hex = (c: number): string => "#" + c.toString(16).padStart(6, "0");
function shade(c: number, f: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const m = (v: number): number => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return (m(r) << 16) | (m(g) << 8) | m(b);
}
const rgba = (c: number, a: number): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
type Ctx = OffscreenCanvasRenderingContext2D;

/** Wood grain drawn in 512 × 256 units at width `px` (height ½); `planks` boards with seams. */
function woodCanvas(base: number, rng: () => number, px: number, planks: number): OffscreenCanvas {
  const w = 512, h = 256;
  const c = new OffscreenCanvas(px, px / 2);
  const g = c.getContext("2d");
  g.scale(px / w, px / w);
  g.fillStyle = hex(base); g.fillRect(0, 0, w, h);
  const lanes = planks || 1;
  const lw = w / lanes;
  for (let p = 0; p < lanes; p++) {
    const tone = shade(base, (rng() - 0.5) * 0.18);
    g.fillStyle = hex(tone);
    g.fillRect(p * lw, 0, lw, h);
    for (let i = 0; i < 46; i++) {
      const y0 = rng() * h;
      g.strokeStyle = rng() < 0.5 ? rgba(shade(tone, -0.35), 0.18 + rng() * 0.2) : rgba(shade(tone, 0.25), 0.12 + rng() * 0.12);
      g.lineWidth = 0.6 + rng() * 1.6;
      g.beginPath();
      const amp = 1 + rng() * 3, freq = 0.01 + rng() * 0.02, ph = rng() * 6;
      for (let x = p * lw; x <= (p + 1) * lw; x += 8) g.lineTo(x, y0 + Math.sin(x * freq + ph) * amp);
      g.stroke();
    }
    if (planks) {
      g.fillStyle = rgba(shade(base, -0.6), 0.75);
      g.fillRect(p * lw, 0, 2, h);
    }
  }
  return c;
}
function speckle(g: Ctx, w: number, h: number, rng: () => number, base: number, n: number): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rng() < 0.6 ? rgba(shade(base, -0.45), 0.35) : rgba(shade(base, 0.35), 0.3);
    const r = 0.6 + rng() * 1.6;
    g.beginPath(); g.arc(rng() * w, rng() * h, r, 0, PI * 2); g.fill();
  }
}

// -- materials per budget ---------------------------------------------------------------------------
interface MatParams {
  color?: number; map?: Texture | null; bumpMap?: Texture | null; bumpScale?: number; roughness?: number; metalness?: number;
  emissive?: Color; emissiveMap?: Texture | null; emissiveIntensity?: number; transparent?: boolean; opacity?: number;
  side?: typeof DoubleSide; depthWrite?: boolean;
}
/** render.js mat(): Lambert (Low), Standard (Balanced), Physical where `phys` is given (High/Ultra). */
function mat(params: MatParams, phys?: { clearcoat: number; clearcoatRoughness: number }): MeshStandardMaterial | MeshLambertMaterial {
  const kind = look?.budget.material ?? "standard";
  if (kind === "lambert") {
    const { roughness: _r, metalness: _m, bumpMap: _b, bumpScale: _s, ...rest } = params;
    return new MeshLambertMaterial(rest);
  }
  if (kind === "physical" && phys) return new MeshPhysicalMaterial({ ...params, ...phys });
  return new MeshStandardMaterial(params);
}
const seg = (n: number, min = 3): number => Math.max(min, Math.round(n * (look?.budget.segments ?? 1)));
const shadowsOn = (): boolean => !!look && look.shadows > 0;

let envTextures: Texture[] = [];
function canvasTex(c: OffscreenCanvas, repeat: [number, number] | null, srgb = true): CanvasTexture {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  envTextures.push(t);
  return t;
}

// -- the pantry: plank wall, counter, shelves, jars, tins, tray ---------------------------------------------
const casters: Mesh[] = [];
const receivers: Mesh[] = [];
function clearGroup(g: Group): void {
  for (const o of [...g.children]) {
    g.remove(o);
    const m = o as Mesh;
    m.geometry?.dispose();
    const mats = m.material as Material | Material[] | undefined;
    if (mats) for (const x of Array.isArray(mats) ? mats : [mats]) x.dispose();
  }
}
function buildEnvironment(): void {
  clearGroup(envGroup);
  casters.length = 0;
  receivers.length = 0;
  for (const t of envTextures) t.dispose();
  envTextures = [];
  const detailed = !!look?.detailed;
  const rng = Rules.makeStreams("pantry-decor").decoration;
  scene.background = new Color(shade(theme.bg, -0.35));
  const add = (mesh: Mesh, cast = false, receive = true): Mesh => {
    if (cast) casters.push(mesh);
    if (receive) receivers.push(mesh);
    envGroup.add(mesh);
    return mesh;
  };
  const wood = (base: number, repeat: [number, number], planks: number, roughness = 0.72): MeshStandardMaterial | MeshLambertMaterial => {
    if (!detailed) return mat({ color: base, roughness: roughness === 0.72 ? 0.8 : roughness, metalness: 0.02 });
    const tex = canvasTex(woodCanvas(base, rng, look!.budget.wood, planks), repeat);
    return mat({ map: tex, bumpMap: tex, bumpScale: 1.2, roughness, metalness: 0.02 });
  };

  // Back wall: vertical boards.
  const wallMat = wood(shade(theme.bg, 0.12), [3, 1], 8, 0.92);
  if (detailed && wallMat.map) { wallMat.map.rotation = PI / 2; wallMat.map.center.set(0.5, 0.5); }
  add(new Mesh(new BoxGeometry(44, 30, 0.5), wallMat)).position.set(0, 7, -4.65);

  // Counter the tray sits on, and the cabinet front below it.
  add(new Mesh(new BoxGeometry(34, 0.4, 7.8), wood(theme.shelf, [3, 1], 0, 0.6))).position.set(0, -0.5, -0.7);
  add(new Mesh(new BoxGeometry(34, 14, 0.4), mat({ color: shade(theme.shelf, -0.35), roughness: 0.85 }))).position.set(0, -7.7, 3.0);

  // Upper shelves with brackets.
  const shelfMat = wood(shade(theme.shelf, 0.08), [4, 1], 0);
  for (const [y, depth] of [[3.3, 1.7], [6.5, 1.5]] as const) {
    add(new Mesh(new BoxGeometry(30, 0.24, depth), shelfMat), true).position.set(0, y, -4.4 + depth / 2);
    if (detailed) {
      for (const x of [-8, 0, 8]) add(new Mesh(new BoxGeometry(0.16, 0.7, depth * 0.8), shelfMat), true).position.set(x, y - 0.46, -4.4 + depth * 0.4);
    }
  }

  // Deterministic decoration: jars and tins from the decoration stream.
  const jarColors = [0xc96f4a, 0x7a9a5b, 0xc9a44a, 0x5b7a9a, 0x9a5b7a];
  const lidColors = [0xc9a14a, 0xb8b8b8, 0x9a6a3a];
  for (let i = 0; i < 9; i++) {
    const h = 0.7 + rng() * 0.9;
    const r = 0.3 + rng() * 0.14;
    const color = jarColors[Math.floor(rng() * jarColors.length)]!;
    const x = -9.2 + i * 2.3 + (rng() - 0.5) * 0.6;
    const z = -3.6 + (rng() - 0.5) * 0.5;
    const base = 3.42;
    if (!detailed) {
      add(new Mesh(new CylinderGeometry(r, r + 0.02, h, seg(16, 8)), mat({ color, roughness: 0.5, metalness: 0.1 })), true).position.set(x, base + h / 2, z);
      continue;
    }
    // Contents, glass shell, lid and paper label.
    const fillH = h * (0.55 + rng() * 0.35);
    const fillGeo = new CylinderGeometry(r * 0.9, r * 0.9, fillH, seg(20, 8));
    fillGeo.translate(0, fillH / 2, 0);
    add(new Mesh(fillGeo, mat({ color, roughness: 0.85 })), true).position.set(x, base + 0.02, z);
    const glass = add(new Mesh(new CylinderGeometry(r, r, h, seg(24, 8), 1, true),
      mat({ color: 0xe8f2f0, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.28, side: DoubleSide, depthWrite: false },
        { clearcoat: 1, clearcoatRoughness: 0.08 })), false, false);
    glass.position.set(x, base + h / 2, z);
    add(new Mesh(new CylinderGeometry(r * 1.04, r * 1.04, 0.14, seg(24, 8)),
      mat({ color: lidColors[i % lidColors.length]!, roughness: 0.3, metalness: 0.85 })), true).position.set(x, base + h + 0.07, z);
    add(new Mesh(new CylinderGeometry(r * 1.01, r * 1.01, h * 0.28, seg(24, 8), 1, true, -0.9, 1.8),
      mat({ color: 0xf1e3c4, roughness: 0.9 }))).position.set(x, base + h * 0.45, z);
  }
  // Tins on the high shelf.
  for (let i = 0; i < 6; i++) {
    const h = 0.8 + rng() * 0.5;
    add(new Mesh(new CylinderGeometry(0.42, 0.42, h, detailed ? seg(28, 10) : 14),
      mat({ color: jarColors[(i + 2) % jarColors.length]!, roughness: detailed ? 0.35 : 0.5, metalness: detailed ? 0.6 : 0.15 })), true)
      .position.set(-7.5 + i * 3 + (rng() - 0.5), 6.62 + h / 2, -3.8);
  }

  // Tray: base + four rims.
  add(new Mesh(new BoxGeometry(11, 0.3, 4.4), wood(theme.tray, [2, 1], 0, 0.55)), true).position.y = -0.15;
  const rimMat = wood(shade(theme.tray, -0.12), [2, 0.2], 0, 0.55);
  for (const [w, d, x, z] of [[11.3, 0.25, 0, 2.15], [11.3, 0.25, 0, -2.15], [0.25, 4.4, 5.55, 0], [0.25, 4.4, -5.55, 0]] as const) {
    add(new Mesh(new BoxGeometry(w, 0.5, d), rimMat), true).position.set(x, 0.1, z);
  }
  // Radial contact gradient under the tray (grounds it even with shadows off).
  const gc = new OffscreenCanvas(128, 128);
  const g2 = gc.getContext("2d");
  const grad = g2.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.5)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
  const shadowPlane = add(new Mesh(new PlaneGeometry(14, 7),
    new MeshBasicMaterial({ map: canvasTex(gc, null), transparent: true, depthWrite: false })), false, false);
  shadowPlane.rotation.x = -PI / 2;
  shadowPlane.position.y = -0.29;
  applyShadowFlags();
}

// -- biscuits ---------------------------------------------------------------------------------------
function roundedRectShape(size: number, radius: number): Shape {
  const s = size / 2, r = radius;
  const shape = new Shape();
  shape.moveTo(-s + r, -s);
  shape.lineTo(s - r, -s); shape.quadraticCurveTo(s, -s, s, -s + r);
  shape.lineTo(s, s - r); shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(-s + r, s); shape.quadraticCurveTo(-s, s, -s, s - r);
  shape.lineTo(-s, -s + r); shape.quadraticCurveTo(-s, -s, -s + r, -s);
  return shape;
}

/** Letter face: biscuit colour, toasted rim, speckles and docking holes on detailed surfaces; a matching
 * grey bump map debosses the letter. Cached per letter, theme, detail and size. */
const textureCache = new Map<string, { map: Texture; bump: Texture | null }>();
function letterTextures(letter: string, detailed: boolean): { map: Texture; bump: Texture | null } {
  const px = look?.budget.letter ?? 256;
  const key = `${letter}:${theme.id}:${detailed ? "d" : "p"}:${px}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const S = 256;
  const mk = (): OffscreenCanvas => { const c = new OffscreenCanvas(px, px); c.getContext("2d").scale(px / S, px / S); return c; };
  const c = mk();
  const ctx = c.getContext("2d");
  ctx.fillStyle = hex(theme.biscuit);
  ctx.fillRect(0, 0, S, S);
  const rng = Rules.makeStreams("biscuit:" + letter).decoration;
  if (detailed) {
    const edge = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
    edge.addColorStop(0, "rgba(0,0,0,0)");
    edge.addColorStop(1, rgba(shade(theme.biscuit, -0.5), 0.55));
    ctx.fillStyle = edge; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, rng, theme.biscuit, 140);
    ctx.fillStyle = rgba(shade(theme.biscuit, -0.55), 0.6);
    for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]] as const) { ctx.beginPath(); ctx.arc(x * S, y * S, 5, 0, PI * 2); ctx.fill(); }
  }
  ctx.font = "bold 168px serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (detailed) {
    ctx.fillStyle = rgba(shade(theme.biscuit, 0.45), 0.8);
    ctx.fillText(letter.toUpperCase(), S / 2 - 3, S / 2 + 8);
  }
  ctx.fillStyle = theme.letter;
  ctx.fillText(letter.toUpperCase(), S / 2, S / 2 + 11);
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.offset.set(0.5, 0.5); // extrude cap UVs span -0.5..0.5
  map.anisotropy = 4;
  let bump: Texture | null = null;
  if (detailed) {
    const b = mk();
    const bx = b.getContext("2d");
    bx.fillStyle = "#808080"; bx.fillRect(0, 0, S, S);
    speckle(bx, S, S, rng, 0x808080, 220);
    bx.fillStyle = "#303030";
    for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]] as const) { bx.beginPath(); bx.arc(x * S, y * S, 6, 0, PI * 2); bx.fill(); }
    bx.font = ctx.font; bx.textAlign = "center"; bx.textBaseline = "middle";
    bx.fillStyle = "#4a4a4a";
    bx.fillText(letter.toUpperCase(), S / 2, S / 2 + 11);
    bump = new CanvasTexture(b);
    bump.offset.set(0.5, 0.5);
  }
  const entry = { map, bump };
  textureCache.set(key, entry);
  return entry;
}
let doughTex: Texture | null = null;
let doughKey = "";
function doughTexture(): Texture {
  const px = look?.budget.dough ?? 128;
  const key = `${theme.id}:${px}`;
  if (doughTex && doughKey === key) return doughTex;
  doughTex?.dispose();
  const c = new OffscreenCanvas(px, px);
  const g = c.getContext("2d");
  g.scale(px / 128, px / 128);
  g.fillStyle = hex(shade(theme.biscuit, -0.12)); g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, Rules.makeStreams("dough").decoration, theme.biscuit, 90);
  doughTex = new CanvasTexture(c);
  doughTex.colorSpace = SRGBColorSpace;
  doughTex.wrapS = doughTex.wrapT = RepeatWrapping;
  doughTex.repeat.set(3, 3);
  doughKey = key;
  return doughTex;
}

let biscuitGeo: ExtrudeGeometry | null = null;
let markerGeo: RingGeometry | null = null;
let geoLod = 0;
function biscuitGeometry(): void {
  const k = look?.budget.segments ?? 1;
  if (biscuitGeo && geoLod === k) return;
  biscuitGeo?.dispose(); markerGeo?.dispose();
  geoLod = k;
  biscuitGeo = new ExtrudeGeometry(roundedRectShape(FRAMING.biscuitSize, 0.22),
    { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: seg(3, 1), curveSegments: seg(8, 3) });
  biscuitGeo.rotateX(-PI / 2);
  markerGeo = new RingGeometry(0.55, 0.72, seg(32, 16));
}
const restY = 0.08 + 0.5 * Math.sin(FRAMING.biscuitTilt);
interface Biscuit { mesh: Mesh<Material[]>; marker: Mesh; topMat: MeshStandardMaterial | MeshLambertMaterial; markerMat: MeshBasicMaterial; lift: number; letter: string; glow: number }
let biscuits: Biscuit[] = [];
let builtKey = "";

function buildBiscuits(letters: string[]): void {
  for (const b of biscuits) {
    biscuitGroup.remove(b.mesh, b.marker);
    for (const m of b.mesh.material as unknown as Material[]) m.dispose();
    b.markerMat.dispose();
  }
  biscuits = [];
  biscuitGeometry();
  const detailed = !!look?.detailed;
  const n = letters.length;
  const span = n * (FRAMING.biscuitSize + FRAMING.biscuitGap) - FRAMING.biscuitGap;
  letters.forEach((letter, i) => {
    const tex = letterTextures(letter, detailed);
    const topMat = detailed
      ? mat({ color: 0xffffff, map: tex.map, bumpMap: tex.bump, bumpScale: 2.5, roughness: 0.62, emissive: new Color(theme.accent), emissiveMap: tex.map, emissiveIntensity: 0 },
        { clearcoat: 0.3, clearcoatRoughness: 0.5 })
      : mat({ color: 0xffffff, map: tex.map, roughness: 0.55, emissive: new Color(theme.accent), emissiveMap: tex.map, emissiveIntensity: 0 });
    const sideMat = detailed
      ? mat({ color: 0xffffff, map: doughTexture(), roughness: 0.7 }, { clearcoat: 0.15, clearcoatRoughness: 0.6 })
      : mat({ color: shade(theme.biscuit, -0.12), roughness: 0.6 });
    const mesh = new Mesh(biscuitGeo!, [topMat, sideMat]);
    const x = -span / 2 + FRAMING.biscuitSize / 2 + i * (FRAMING.biscuitSize + FRAMING.biscuitGap);
    mesh.position.set(x, restY, 0);
    mesh.rotation.x = FRAMING.biscuitTilt;
    mesh.castShadow = shadowsOn(); mesh.receiveShadow = shadowsOn();
    biscuitGroup.add(mesh);
    // Grounded selection marker ring.
    const markerMat = new MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false });
    const marker = new Mesh(markerGeo!, markerMat);
    marker.rotation.x = -PI / 2;
    marker.position.set(x, 0.02, -0.4);
    biscuitGroup.add(marker);
    biscuits.push({ mesh, marker, topMat, markerMat, lift: 0, letter, glow: 0 });
  });
  builtKey = `${letters.join("")}:${theme.id}:${look?.preset}`;
}

// -- particles: celebration bursts + ambient dust motes ---------------------------------------------------
const spriteCanvas = new OffscreenCanvas(64, 64);
{
  const g = spriteCanvas.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,0.6)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
}
const spriteTex = new CanvasTexture(spriteCanvas);
spriteTex.colorSpace = SRGBColorSpace;
const MAX_PARTICLES = PARTICLE_CAP.high * 3;
const particleGeo = new BufferGeometry();
const particlePos = new Float32Array(MAX_PARTICLES * 3);
particleGeo.setAttribute("position", new BufferAttribute(particlePos, 3));
particleGeo.setDrawRange(0, 0);
// Colour above 1.0 so the sparks feed the bloom pass.
const SPARK_SIZE = 0.16;
const particleMat = new PointsMaterial({ color: new Color(0xffe2a0).multiplyScalar(2.2), size: SPARK_SIZE, map: spriteTex, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending });
const particles = new Points(particleGeo, particleMat);
particles.frustumCulled = false;
scene.add(particles);
interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }
const pool: Spark[] = [];

const MAX_DUST = DUST_COUNT.high;
const dustGeo = new BufferGeometry();
const dustPos = new Float32Array(MAX_DUST * 3);
const dustSeed = new Float32Array(MAX_DUST * 4);
{
  const rng = Rules.makeStreams("dust").decoration;
  for (let i = 0; i < MAX_DUST; i++) {
    dustSeed[i * 4] = -7 + rng() * 14;
    dustSeed[i * 4 + 1] = -0.2 + rng() * 6.5;
    dustSeed[i * 4 + 2] = -3.8 + rng() * 6;
    dustSeed[i * 4 + 3] = rng() * 100;
  }
}
dustGeo.setAttribute("position", new BufferAttribute(dustPos, 3));
const DUST_SIZE = 0.05;
const dustMat = new PointsMaterial({ color: 0xfff0d0, size: DUST_SIZE, map: spriteTex, transparent: true, opacity: 0.3, depthWrite: false, blending: AdditiveBlending });
const dust = new Points(dustGeo, dustMat);
dust.frustumCulled = false;
scene.add(dust);
// Blended points drawn before the opaque scene would show through it.
particles.renderOrder = 5;
dust.renderOrder = 4;

function updateDust(time: number, moving: boolean): void {
  const n = Math.round(DUST_COUNT[look?.particles ?? "off"] * (look?.budget.dust ?? 0));
  dust.visible = n > 0;
  if (!n) return;
  for (let i = 0; i < n; i++) {
    const s = dustSeed[i * 4 + 3]!;
    const t = moving ? time : 0;
    dustPos[i * 3] = dustSeed[i * 4]! + Math.sin(t * 0.13 + s) * 0.6;
    dustPos[i * 3 + 1] = dustSeed[i * 4 + 1]! + Math.sin(t * 0.09 + s * 1.7) * 0.4;
    dustPos[i * 3 + 2] = dustSeed[i * 4 + 2]! + Math.cos(t * 0.11 + s * 0.6) * 0.4;
  }
  (dustGeo.getAttribute("position") as BufferAttribute).needsUpdate = true;
  dustGeo.setDrawRange(0, n);
}
function burst(x: number, y: number, z: number, count: number): void {
  const k = look?.budget.sparks ?? 0;
  const cap = Math.min(MAX_PARTICLES, Math.round(PARTICLE_CAP[look?.particles ?? "off"] * k));
  const want = Math.round(count * k);
  if (cap === 0 || reducedMotion) return;
  const n = Math.max(0, Math.min(want, cap - pool.length));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * PI * 2;
    pool.push({ x, y, z, vx: Math.cos(a) * (0.5 + Math.random()), vy: 1.5 + Math.random() * 1.5, vz: Math.sin(a) * (0.5 + Math.random()), life: 1 });
  }
}

// -- camera: authored pose, pulled back when the biscuits would not fit -----------------------------------
let camKick = 0;
function fitCamera(): void {
  const n = biscuits.length || 3;
  const span = n * (FRAMING.biscuitSize + FRAMING.biscuitGap) - FRAMING.biscuitGap + FRAMING.fitMargin;
  // Wide layouts carry side rails over the scene, so fit to the middle part (render.js).
  const share = camera.aspect > 1.2 ? 0.56 : 0.94;
  const halfH = Math.atan(Math.tan((FRAMING.fov / 2) * PI / 180) * camera.aspect * share);
  const d = Math.max(baseDist, (span / 2) / Math.tan(halfH) + 1.2);
  camBase.copy(lookAt).addScaledVector(viewDir, d);
}

// -- graphics level ------------------------------------------------------------------------------------
let envMap: Texture | null = null;
function applyReflections(): void {
  if (!look?.reflections) { scene.environment = null; return; }
  if (!envMap) {
    try { envMap = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture; }
    catch (e) { console.warn(`environment: ${e instanceof Error ? e.message : String(e)}`); }
  }
  scene.environment = envMap;
  scene.environmentIntensity = 0.3;
}
function applyShadowFlags(): void {
  const on = shadowsOn();
  renderer.shadowMap.enabled = on;
  keyLight.castShadow = on;
  if (on) keyLight.shadow.mapSize = look!.shadows;
  for (const m of casters) { m.castShadow = on; m.receiveShadow = on; }
  for (const m of receivers) m.receiveShadow = on;
  for (const b of biscuits) { b.mesh.castShadow = on; b.mesh.receiveShadow = on; }
}
/** The graphics level's look (quality.ts): post effects at once, materials and textures rebuilt when the budget changes. */
export function applyLook(next: Look): void {
  if (look && JSON.stringify(look) === JSON.stringify(next)) return;
  const before = look;
  look = next;
  renderer.ao = next.ao === "off" ? null : {
    blendIntensity: 0.7, radius: 0.45, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: next.ao === "high" ? 16 : 8, resolution: next.budget.aoRes,
    denoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: next.ao === "high" ? 6 : 4, rings: 2, samples: next.ao === "high" ? 16 : 8, radiusExponent: 2 },
  };
  // High threshold: only the selection glow, sparks and bright highlights bloom.
  renderer.bloom = next.bloom ? { strength: 0.4, radius: 0.4, threshold: 0.9, resolution: next.budget.bloomRes } : null;
  // render.js GradeShader (display space): a gentle S-curve, +7 % saturation, warm highlights and cool
  // shadows, the 0.3 vignette.
  renderer.grade = next.grade ? {
    space: "display", contrast: 0.22, saturation: 1.07,
    shadows: [0.97, 0.98, 1.03], highlights: [1.04, 1.0, 0.95], split: [0.25, 0.85],
    vignette: { amount: 0.3, inner: 0.3, outer: 0.8, scale: [1, 0.85] },
  } : null;
  renderer.antialias = next.antialias;
  const b = before?.budget, nb = next.budget;
  const assets = !b || before!.detailed !== next.detailed || b.material !== nb.material || b.wood !== nb.wood || b.letter !== nb.letter
    || b.dough !== nb.dough || b.segments !== nb.segments;
  if (assets) {
    for (const { map, bump } of textureCache.values()) { map.dispose(); bump?.dispose(); }
    textureCache.clear();
    buildEnvironment();
    buildBiscuits(shown.letters);
  } else applyShadowFlags();
  applyReflections();
}
export function setReducedMotion(on: boolean): void { reducedMotion = on; }
/** A theme (content.js THEMES) for the materials; geometry, layout and rules never change. */
export function setTheme(id: string): void {
  const t = Content.themeById(id);
  if (t.id === theme.id) return;
  theme = t;
  if (!look) return;
  buildEnvironment();
  buildBiscuits(shown.letters);
}
export function themeId(): string { return theme.id; }
/** The tray to mirror (null: the title's PANTRY). */
export function show(snapshot: { letters: string[]; selected: number[] } | null): void {
  shown = snapshot ?? IDLE;
  if (look && builtKey !== `${shown.letters.join("")}:${theme.id}:${look.preset}`) buildBiscuits(shown.letters);
}
export function resetCamera(): void { camKick = 0; }
/** render.js onCommandEvents: sparks and a camera kick on found words and a completed round. */
export function onEvents(events: GameEvent[]): void {
  for (const ev of events) {
    if (ev.type === "word-target" || ev.type === "word-bonus") {
      const mid = biscuits[Math.floor(biscuits.length / 2)];
      if (mid) burst(mid.mesh.position.x, 1, 0, ev.type === "word-target" ? 120 : 60);
      if (!reducedMotion) camKick = ev.type === "word-target" ? 0.12 : 0.05;
    } else if (ev.type === "terminal" && ev.reason === "completed") {
      for (const b of biscuits) burst(b.mesh.position.x, 1.2, 0, 40);
      if (!reducedMotion) camKick = 0.2;
    }
  }
}

// -- the frame ---------------------------------------------------------------------------------------------
let time = 0;
/** render.js frame(): cosmetic animation from the shown tray and the frame time. */
export function update(dtIn: number): void {
  const f = frame();
  const dt = Math.min(0.05, Math.max(0, dtIn));
  if (f.width > 0 && f.height > 0) {
    const aspect = f.width / f.height;
    if (aspect !== camera.aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
  }
  fitCamera();
  const ambient = !reducedMotion && !!look?.animated;
  if (ambient) time += dt;
  const sel = new Set(shown.selected);
  biscuits.forEach((b, i) => {
    const isSel = sel.has(i);
    const order = isSel ? shown.selected.indexOf(i) : -1;
    b.lift += ((isSel ? FRAMING.selectLift : 0) - b.lift) * Math.min(1, dt * 14);
    const idle = !ambient ? 0 : Math.sin(time * 1.4 + i * 0.9) * 0.02;
    b.mesh.position.y = restY + b.lift + idle;
    b.mesh.position.z = isSel ? -0.4 - order * 0.02 : 0;
    b.glow = isSel ? 0.3 : Math.max(0, b.glow - dt * 3);
    b.topMat.emissiveIntensity = b.glow;
    b.markerMat.opacity = isSel ? 0.85 : Math.max(0, b.markerMat.opacity - dt * 4);
    b.marker.scale.setScalar(isSel && !reducedMotion ? 1 + Math.sin(f.time * 4) * 0.04 : 1);
  });
  bulb.intensity = (22 / PI) * (ambient ? 1 + Math.sin(time * 2.1) * 0.04 + Math.sin(time * 5.3) * 0.025 : 1);
  updateDust(time, ambient);
  // Sparks fall and fade.
  let write = 0;
  for (const p of pool) {
    p.life -= dt * 1.4;
    if (p.life <= 0) continue;
    p.vy -= dt * 3.5;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    pool[write++] = p;
    particlePos[write * 3 - 3] = p.x; particlePos[write * 3 - 2] = p.y; particlePos[write * 3 - 1] = p.z;
  }
  pool.length = write;
  (particleGeo.getAttribute("position") as BufferAttribute).needsUpdate = true;
  particleGeo.setDrawRange(0, write);
  particles.visible = write > 0;
  // KNOWN ENGINE BUG at engine.minor ≤ 19: attenuated Points count the pixel ratio twice: divide it out.
  particleMat.size = SPARK_SIZE / Math.max(1, f.scale);
  dustMat.size = DUST_SIZE / Math.max(1, f.scale);
  // Camera: authored base pose + decaying event kick. Never a cumulative lerp.
  camKick = Math.max(0, camKick - dt * 0.6);
  const kick = reducedMotion ? 0 : camKick;
  camera.position.set(camBase.x, camBase.y + kick * 0.4, camBase.z - kick);
  camera.lookAt(lookAt);
}
