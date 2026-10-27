// The look per graphics level: the browser build's four presets and budgets
// (gfx.js TABLE / BUDGETS, each tuned to hold 60 FPS on the weakest GPU its
// Auto gave it) keyed by the runtime's quality tier (frame().quality), with
// the sparks scaled within the tier by the level (frame().levelIndex), as the
// browser build scaled them by its hardware level (at most 2×). The runtime
// owns the rest of what the old Graphics section did: Auto and the level
// choice, render scale and the pixel-ratio cap, adaptive resolution, the
// frame-rate limit and readout. The old section's per-effect overrides are
// not offered (the runtime's Options choose a level).
import type { QualityTier } from "starhermit:engine";
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
  bloomRes: number; aoRes: number;
}
export interface Look {
  preset: QualityTier;
  shadows: 0 | 1024 | 2048 | 4096;
  ao: "off" | "on" | "high";
  bloom: boolean;
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

const TABLE: Record<QualityTier, Omit<Look, "preset" | "budget">> = {
  low: { shadows: 0, ao: "off", bloom: false, grade: false, antialias: "msaa", reflections: false, detailed: false, particles: "off", animated: false },
  balanced: { shadows: 1024, ao: "off", bloom: true, grade: true, antialias: "fxaa", reflections: true, detailed: true, particles: "low", animated: true },
  high: { shadows: 2048, ao: "on", bloom: true, grade: true, antialias: "smaa", reflections: true, detailed: true, particles: "high", animated: true },
  ultra: { shadows: 4096, ao: "high", bloom: true, grade: true, antialias: "msaa", reflections: true, detailed: true, particles: "high", animated: true },
};
const BUDGETS: Record<QualityTier, Budget> = {
  low: { material: "lambert", wood: 256, letter: 128, dough: 64, segments: 0.5, sparks: 0.5, dust: 0.5, bloomRes: 0.5, aoRes: 0.5 },
  balanced: { material: "standard", wood: 512, letter: 256, dough: 128, segments: 0.75, sparks: 0.75, dust: 0.75, bloomRes: 0.5, aoRes: 0.5 },
  high: { material: "physical", wood: 512, letter: 256, dough: 128, segments: 1, sparks: 1, dust: 1, bloomRes: 0.5, aoRes: 0.5 },
  ultra: { material: "physical", wood: 1024, letter: 512, dough: 256, segments: 1.5, sparks: 1.5, dust: 1, bloomRes: 1, aoRes: 1 },
};
/** The first level index of each tier. */
const TIER_FLOOR: Record<QualityTier, number> = { low: 0, balanced: 2, high: 4, ultra: 7 };

/** The look for a quality tier at a level index (0 … 9). */
export function lookFor(preset: QualityTier, levelIndex: number): Look {
  const b = { ...BUDGETS[preset] };
  // Levels are about 1.64× apart in GPU throughput: sparks grow with the level above the tier's first,
  // at most 2× the tier's budget (gfx.js budget()).
  const k = Math.min(2, Math.pow(1.64, Math.max(0, levelIndex - TIER_FLOOR[preset])));
  b.sparks = Math.round(b.sparks * k * 100) / 100;
  return { preset, ...TABLE[preset], budget: b };
}
