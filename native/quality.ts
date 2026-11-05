// The look per graphics level. The engine-owned effects (shadows and their
// map size, ambient occlusion, bloom, the grade, anti-aliasing) are the
// level's own (levelSettings(): the same table every StarHermit game reads).
// The game's art (materials, textures, geometry LOD, reflections, detail,
// particles, ambient motion) is the browser build's four presets and budgets
// (gfx.js TABLE / BUDGETS) keyed by the level's quality tier, with the sparks
// scaled within the tier by the level's particle budget against the tier's
// anchor level (quantum, molecular, terrestrial, galactic), at most 2×. The
// runtime owns the rest of what the old Graphics section did: Auto and the
// level choice, render scale and the pixel-ratio cap, adaptive resolution, the
// frame-rate limit and readout. The old section's per-effect overrides are
// not offered (the runtime's Options choose a level).
import { levelSettings, type GraphicsLevel, type LevelSettings, type QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export interface Budget {
  /** Biscuits, pantry wood, jars and tins: Lambert, standard, or physical (clear-coated biscuits, glass jars). */
  material: "lambert" | "standard" | "physical";
  /** Wood texture width in px (height ½); biscuit face texture size; biscuit side (dough) texture size. */
  wood: number; letter: number; dough: number;
  /** Geometry LOD: biscuit bevel/curve, jar, lid, label, tin and ring segments. */
  segments: number;
  /** Celebration burst counts and cap multiplier; ambient dust multiplier. */
  sparks: number; dust: number;
}
export interface Look {
  preset: QualityTier;
  /** The level's key-light shadow map size, 0 when the level draws no shadows. */
  shadows: number;
  /** The level's ambient occlusion (null: off). */
  ao: { resolution: number; samples: number; denoiseSamples: number } | null;
  /** The level's bloom resolution (null: off). */
  bloom: number | null;
  grade: boolean;
  antialias: AntialiasMode;
  reflections: boolean;
  /** Surface detail: procedural wood, speckled dough with debossed letters, glass jars. */
  detailed: boolean;
  /** Particles tier: spark cap 0 / 300 / 800, dust motes 0 / 60 / 160. */
  particles: "off" | "low" | "high";
  /** Ambient motion: idle bob, dust drift, bulb shimmer. */
  animated: boolean;
  budget: Budget;
}

type Art = Pick<Look, "reflections" | "detailed" | "particles" | "animated">;
const ART: Record<QualityTier, Art> = {
  low: { reflections: false, detailed: false, particles: "off", animated: false },
  balanced: { reflections: true, detailed: true, particles: "low", animated: true },
  high: { reflections: true, detailed: true, particles: "high", animated: true },
  ultra: { reflections: true, detailed: true, particles: "high", animated: true },
};
const BUDGETS: Record<QualityTier, Budget> = {
  low: { material: "lambert", wood: 256, letter: 128, dough: 64, segments: 0.5, sparks: 0.5, dust: 0.5 },
  balanced: { material: "standard", wood: 512, letter: 256, dough: 128, segments: 0.75, sparks: 0.75, dust: 0.75 },
  high: { material: "physical", wood: 512, letter: 256, dough: 128, segments: 1, sparks: 1, dust: 1 },
  ultra: { material: "physical", wood: 1024, letter: 512, dough: 256, segments: 1.5, sparks: 1.5, dust: 1 },
};
/** The level whose settings are each tier's preset. */
const ANCHOR: Record<QualityTier, GraphicsLevel> = { low: "quantum", balanced: "molecular", high: "terrestrial", ultra: "galactic" };

/** The look for a graphics level (the frame's by default). */
export function lookFor(s: LevelSettings = levelSettings()): Look {
  const preset = s.quality;
  const b = { ...BUDGETS[preset] };
  // Sparks grow with the level's particle budget above the tier's anchor, at most 2× (gfx.js budget()).
  const k = Math.min(2, s.particles / levelSettings(ANCHOR[preset]).particles);
  b.sparks = Math.round(b.sparks * k * 100) / 100;
  b.wood = Math.min(b.wood, s.maxTextureSize);
  b.letter = Math.min(b.letter, s.maxTextureSize);
  b.dough = Math.min(b.dough, s.maxTextureSize);
  return {
    preset, ...ART[preset],
    shadows: s.shadows ? s.shadowMapSize : 0,
    ao: s.ao && { resolution: s.ao.resolution, samples: s.ao.samples, denoiseSamples: s.ao.denoiseSamples },
    bloom: s.bloom ? s.bloom.resolution : null,
    grade: s.grade,
    // Engine 1.36.1 bug: antialias "off" recolours fog, haze and translucent overlays; the old Low's MSAA
    // stays until engine 1.36.2 (drop this clamp when pinning 1.36.2+).
    antialias: s.antialias === "off" ? "msaa" : s.antialias,
    budget: b,
  };
}
