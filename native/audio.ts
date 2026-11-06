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
// offline into clips once — a live synthesis graph makes clip loads fail on
// the engine's web runtime. The synthesized stand-ins the browser
// build played while a clip decoded are not ported, so a clip still loading
// is silent. Every clip starts loading and rendering at start-up (the mixer
// takes them before it runs); the room tone and the arpeggio wait for it.
import { OfflineAudioContext, context, createClip, loadClip, play as playClip, type AudioClip, type Bus, type Sound } from "starhermit:audio";

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
let suspended = false;

/** Loads every clip at once (onStart); a cue whose clip is still loading is skipped. */
export function loadSfx(): void {
  void renderBeds().catch((e: unknown) => console.warn(`audio render: ${String(e)}`));
  for (const name of new Set(Object.values(SAMPLES))) {
    loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); }, (e: unknown) => console.warn(`sfx ${name}: ${String(e)}`));
  }
}

/** A game event's sample (once loaded). */
export function play(event: string): void {
  const file = SAMPLES[event];
  if (!file || suspended) return;
  const clip = clips.get(file);
  if (!clip) return;
  const bus: Bus = INTERFACE.has(event) ? "interface" : "effects";
  try { playClip(clip, { bus, gain: LEVEL.effects }); }
  catch { /* the mixer is full this frame: skip it */ }
}

// -- rendered clips -------------------------------------------------------------------
const RATE = 22050;
const NOTE_DUR = 0.55;
/** audio.js _startMusic's note: a sine, 50 ms linear attack, exponential to 0.001 at `dur`. */
async function renderNote(freq: number): Promise<AudioClip> {
  const off = new OfflineAudioContext(1, Math.round((NOTE_DUR + 0.02) * RATE), RATE);
  const osc = off.createOscillator();
  osc.frequency.value = freq;
  const env = off.createGain();
  env.gain.setValueAtTime(0, 0);
  env.gain.linearRampToValueAtTime(1, 0.05);
  env.gain.exponentialRampToValueAtTime(0.001, NOTE_DUR);
  env.gain.setValueAtTime(0, NOTE_DUR);
  osc.connect(env).connect(off.destination);
  osc.start();
  return createClip(await off.startRendering());
}
/** Make-up gain: the old two one-pole passes gave rms 0.0959, this biquad 0.1334 at unity (both measured). */
const ROOM_GAIN = 0.72;
/** audio.js _startAmbience: two seconds of seeded noise through a 320 Hz low-pass, looped (periodic once settled). */
async function renderRoomTone(): Promise<AudioClip> {
  const n = 2 * RATE, settle = Math.round(0.25 * RATE);
  const off = new OfflineAudioContext(1, settle + n, RATE);
  const noise = off.createNoise({ seed: 0x7a11, seconds: 2 });
  const lp = off.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 320;
  const g = off.createGain();
  g.gain.value = ROOM_GAIN;
  noise.connect(lp).connect(g).connect(off.destination);
  noise.start();
  const r = await off.startRendering();
  return createClip([r.getChannelData(0).slice(settle)], RATE);
}
/** One context at a time: at most 16 may render at once, and there are 17 notes and the room tone. */
async function renderBeds(): Promise<void> {
  roomTone = await renderRoomTone();
  for (const f of FREQS) notes.set(f, await renderNote(f));
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

/** Each frame once the mixer runs: the room tone by state and the arpeggio's next note by mixer time. */
export function update(): void {
  if (context.state !== "running") return;
  if (!roomTone) return;
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
