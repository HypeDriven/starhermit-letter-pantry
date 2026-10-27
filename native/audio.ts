// Sound, as the browser build's audio.js: the authored one-shots
// (sfx/<name>.opus, sfx/manifest.json) per game event, the generative music
// bed (a four-chord C–Am–G–F arpeggio, one note every 420 ms, its level
// growing with the round's progress through setIntensity) and the pantry's
// room tone (a two-second seeded noise loop through a 320 Hz low-pass).
//
// The browser build's three buses become the runtime's (Options › Audio owns
// the volumes, the mute and the voice limit): music → "music", effects and
// ambience → "effects", the menu click → "interface"; the old default bus
// levels (music 60 %, effects 80 %, ambience 50 %) are folded into each
// sound's gain. The arpeggio's sine notes and the noise loop are rendered
// into clips once (createClip) — a live synthesis graph makes clip loads
// fail on the engine's web runtime. The synthesized stand-ins the browser
// build played while a clip decoded are not ported, so a clip still loading
// is silent. Clips load once the mixer runs (natively at once, in a browser
// after the first press), one at a time; rendered clips one a frame.
import { context, createClip, loadClip, play as playClip, type AudioClip, type Bus, type Sound } from "starhermit:audio";
import { Rules } from "./game.ts";

const LEVEL = { music: 0.6, effects: 0.8, ambience: 0.5 };
/** Event → sfx/<name>.opus (audio.js PantryAudio.SAMPLES). */
const SAMPLES: Record<string, string> = {
  select: "tile-select", deselect: "tile-deselect", clear: "tray-clear", shuffle: "tray-shuffle", uiClick: "ui-click",
  submitInvalid: "submit-invalid", wordBonus: "word-bonus", wordComplete: "word-complete", roundComplete: "round-complete",
  roundFailed: "round-failed", hint: "hint-reveal", undo: "undo", roundStart: "round-start", achievement: "achievement-unlock",
  countdownTick: "countdown-tick",
};
const INTERFACE = new Set(["uiClick"]);

const clips = new Map<string, AudioClip>();
const queue: string[] = [];
let loading = false;
let wantClips = false;
let suspended = false;

function load(name: string): void { if (!queue.includes(name) && !clips.has(name)) queue.push(name); }
function pump(): void {
  if (loading || !queue.length) return;
  const name = queue.shift()!;
  loading = true;
  loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); loading = false; }, (e: unknown) => { console.warn(`sfx ${name}: ${String(e)}`); loading = false; });
}
/** Asks for the clips; they load once the mixer runs (see update). */
export function loadSfx(): void { wantClips = true; }

/** A game event's sample (once loaded). */
export function play(event: string): void {
  const file = SAMPLES[event];
  if (!file || suspended) return;
  const clip = clips.get(file);
  if (!clip) return;
  const bus: Bus = INTERFACE.has(event) ? "interface" : "effects";
  try { playClip(clip, { bus, gain: LEVEL.effects }); }
  catch { clips.delete(file); load(file); } // a clip the mixer lost: load it again
}

// -- rendered clips -------------------------------------------------------------------
const RATE = 22050;
const NOTE_DUR = 0.55;
/** audio.js _startMusic's note: a sine, 50 ms linear attack, exponential to 0.001 at `dur`. */
function noteClip(freq: number): AudioClip {
  const n = Math.round((NOTE_DUR + 0.02) * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = t < 0.05 ? t / 0.05 : t < NOTE_DUR ? Math.pow(0.001, (t - 0.05) / (NOTE_DUR - 0.05)) : 0;
    out[i] = Math.sin(2 * Math.PI * freq * t) * env;
  }
  return createClip([out], RATE);
}
/** audio.js _startAmbience: two seconds of seeded noise (±0.5) through a 320 Hz low-pass, looped. */
function roomToneClip(): AudioClip {
  const n = 2 * RATE;
  const rng = Rules.mulberry32(Rules.fnv1a("av:session"));
  const a = 1 - Math.exp(-2 * Math.PI * 320 / RATE);
  const out = new Float32Array(n);
  let y = 0, y2 = 0;
  // Two passes of the one-pole (a gentler stand-in for the biquad), warmed over the loop once so the seam is quiet.
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) noise[i] = (rng() * 2 - 1) * 0.5;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      y += a * (noise[i]! - y);
      y2 += a * (y - y2);
      if (pass === 1) out[i] = y2 * 2.2;
    }
  }
  return createClip([out], RATE);
}

// -- music and the room tone ---------------------------------------------------------------
const CHORDS = [
  [261.6, 329.6, 392.0], // C
  [220.0, 261.6, 329.6], // Am
  [196.0, 246.9, 293.7], // G
  [174.6, 220.0, 261.6], // F
];
const FREQS = [...new Set(CHORDS.flat().flatMap((f) => [f, f * 0.5]))];
const notes = new Map<number, AudioClip>();
let roomTone: AudioClip | null = null;
let roomSound: Sound | null = null;
let step = 0;
let nextNote = 0;
let intensity = 0;

/** audio.js setIntensity: (targets + bonus × 0.5) / target count, 0–1. */
export function setIntensity(v: number): void { intensity = Math.max(0, Math.min(1, v)); }
/** A hidden window: the bed and the room tone hold (audio.js suspended its context). */
export function setSuspended(on: boolean): void { suspended = on; }

/** Each frame: the clips once the mixer runs (one at a time), the rendered notes and room tone one a
 * frame after them, then the room tone by state and the arpeggio's next note by mixer time. */
export function update(): void {
  if (context.state !== "running") return;
  if (wantClips) {
    wantClips = false;
    for (const name of Object.values(SAMPLES)) load(name);
    return;
  }
  pump();
  if (loading || queue.length) return;
  if (!roomTone) { roomTone = roomToneClip(); return; }
  for (const f of FREQS) if (!notes.has(f)) { notes.set(f, noteClip(f)); return; }
  try {
    if (!suspended && !roomSound) roomSound = playClip(roomTone, { bus: "effects", gain: 0.06 * LEVEL.ambience, loop: true });
    else if (suspended && roomSound) { roomSound.stop(); roomSound = null; }
  } catch (e) { console.warn(`audio: ${String(e)}`); return; }
  if (suspended) return;
  const now = context.currentTime;
  if (now < nextNote) return;
  nextNote = Math.max(now, nextNote) + 0.42;
  const chord = CHORDS[Math.floor(step / 8) % CHORDS.length]!;
  const freq = chord[step % chord.length]! * (step % 2 ? 1 : 0.5);
  step++;
  const note = notes.get(freq);
  try { if (note) playClip(note, { bus: "music", gain: (0.05 + intensity * 0.02) * LEVEL.music }); } catch { /* the mixer is full */ }
}
