// Letter Pantry — WebAudio. Authored one-shot samples (sfx/*.opus) are
// preferred per event; procedural synthesis remains as the fallback while a
// sample loads or if it is missing. Buses: music / effects / ambience.
// Seeded pitch variants.

import { mulberry32, fnv1a } from './rules.js';

export class PantryAudio {
  // Event method name -> sfx/<name>.opus basename (see sfx/manifest.json).
  static SAMPLES = {
    select: 'tile-select',
    deselect: 'tile-deselect',
    clear: 'tray-clear',
    shuffle: 'tray-shuffle',
    uiClick: 'ui-click',
    submitInvalid: 'submit-invalid',
    wordBonus: 'word-bonus',
    wordComplete: 'word-complete',
    roundComplete: 'round-complete',
    roundFailed: 'round-failed',
    hint: 'hint-reveal',
    undo: 'undo',
  };

  constructor(options = {}) {
    this.ctx = null;
    this.buses = {};
    this.volumes = { music: 0.6, effects: 0.8, ambience: 0.5 };
    this.caption = options.caption || null; // fn(text) -> routed to ARIA live region
    this.rng = mulberry32(fnv1a('av:' + (options.seed || 'default')));
    this.musicTimer = null;
    this.ambienceNodes = null;
    this.started = false;
    this.sampleCache = new Map(); // name -> AudioBuffer | Promise | null (failed)
    this._onVisibility = () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else if (this.started) this.ctx.resume().catch(() => {});
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibility);
    }
  }

  // Must be called from a user gesture.
  start() {
    if (this.started) { this.ctx && this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const master = this.ctx.createGain();
      master.gain.value = 1;
      master.connect(this.ctx.destination);
      this.master = master;
      for (const name of ['music', 'effects', 'ambience']) {
        const g = this.ctx.createGain();
        g.gain.value = this.volumes[name];
        g.connect(master);
        this.buses[name] = g;
      }
      this.started = true;
      this._startAmbience();
      this._startMusic();
    } catch { /* audio unavailable — game remains playable */ }
  }

  setVolume(bus, v) {
    this.volumes[bus] = Math.max(0, Math.min(1, v));
    if (this.buses[bus]) this.buses[bus].gain.value = this.volumes[bus];
  }

  getVolume(bus) { return this.volumes[bus]; }

  _say(text) { if (this.caption) this.caption(text); }

  // Sample one-shots ----------------------------------------------------------
  // Lazy fetch/decode/cache; only attempted after the user-gesture unlock.
  _loadSample(name) {
    if (!this.ctx || typeof fetch !== 'function') return null;
    if (this.sampleCache.has(name)) return this.sampleCache.get(name);
    const pending = fetch('sfx/' + name + '.opus')
      .then((res) => {
        if (!res.ok) throw new Error('sfx http ' + res.status);
        return res.arrayBuffer();
      })
      .then((bytes) => this.ctx.decodeAudioData(bytes))
      .then((buffer) => { this.sampleCache.set(name, buffer); return buffer; })
      .catch(() => { this.sampleCache.set(name, null); return null; });
    this.sampleCache.set(name, pending);
    return pending;
  }

  // Prefer the mapped sample; run the synthesized fallback while it loads or
  // if it failed. Samples play through the effects bus (mute/volume apply).
  _playSample(eventName, fallback) {
    if (!this.started || !this.ctx) return;
    const name = PantryAudio.SAMPLES[eventName];
    const entry = name ? this._loadSample(name) : null;
    if (entry && typeof entry === 'object' && typeof entry.getChannelData === 'function') {
      const src = this.ctx.createBufferSource();
      src.buffer = entry;
      src.connect(this.buses.effects);
      src.start();
      return;
    }
    fallback();
  }

  _pitch(base) {
    return base * (0.94 + this.rng() * 0.12); // seeded variant
  }

  _blip(bus, { freq = 440, dur = 0.08, type = 'triangle', gain = 0.25, slide = 0 }) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(this._pitch(freq), t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, this._pitch(freq + slide)), t + dur);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env); env.connect(this.buses[bus]);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  _thock(freq = 180, dur = 0.12, gain = 0.3) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this._pitch(freq), t);
    osc.frequency.exponentialRampToValueAtTime(50, t + dur);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env); env.connect(this.buses.effects);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // Event sounds ------------------------------------------------------------
  select() { this._playSample('select', () => this._blip('effects', { freq: 660, dur: 0.06, gain: 0.18 })); }
  deselect() { this._playSample('deselect', () => this._blip('effects', { freq: 440, dur: 0.05, gain: 0.14 })); }
  clear() { this._playSample('clear', () => this._blip('effects', { freq: 330, dur: 0.08, gain: 0.14, slide: -120 })); }
  shuffle() {
    this._playSample('shuffle', () => {
      for (let i = 0; i < 3; i++) setTimeout(() => this._blip('effects', { freq: 500 + i * 90, dur: 0.05, gain: 0.12 }), i * 45);
    });
    this._say('Tray shuffled.');
  }
  uiClick() { this._playSample('uiClick', () => this._blip('effects', { freq: 520, dur: 0.04, gain: 0.1 })); }
  submitInvalid() {
    this._playSample('submitInvalid', () => this._blip('effects', { freq: 220, dur: 0.18, type: 'sawtooth', gain: 0.12, slide: -80 }));
    this._say('Not a valid word.');
  }
  wordBonus() {
    this._playSample('wordBonus', () => {
      this._thock(240);
      this._blip('effects', { freq: 760, dur: 0.12, gain: 0.2, slide: 120 });
    });
    this._say('Bonus word found.');
  }
  wordComplete() {
    this._playSample('wordComplete', () => {
      this._thock(200);
      [523, 659, 784].forEach((f, i) => setTimeout(() => this._blip('effects', { freq: f, dur: 0.14, gain: 0.2 }), i * 70));
    });
    this._say('Target word found.');
  }
  roundComplete() {
    this._playSample('roundComplete', () => {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._blip('effects', { freq: f, dur: 0.22, gain: 0.22 }), i * 110));
    });
    this._say('Round complete.');
  }
  roundFailed() {
    this._playSample('roundFailed', () => {
      [392, 330, 262].forEach((f, i) => setTimeout(() => this._blip('effects', { freq: f, dur: 0.2, gain: 0.16, type: 'triangle' }), i * 120));
    });
    this._say('Round over.');
  }
  hint() {
    this._playSample('hint', () => this._blip('effects', { freq: 880, dur: 0.16, gain: 0.14, slide: 220 }));
    this._say('Hint revealed.');
  }
  undo() { this._playSample('undo', () => this._blip('effects', { freq: 380, dur: 0.08, gain: 0.14, slide: 140 })); }

  // Ambience: quiet filtered noise loop -------------------------------------
  _startAmbience() {
    if (!this.ctx || this.ambienceNodes) return;
    const len = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (this.rng() * 2 - 1) * 0.5;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer; src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 320; filter.Q.value = 0.4;
    const g = this.ctx.createGain(); g.gain.value = 0.06;
    src.connect(filter); filter.connect(g); g.connect(this.buses.ambience);
    src.start();
    this.ambienceNodes = { src, filter, g };
  }

  // Adaptive music bed: slow two-chord arpeggio, denser as words are found --
  _startMusic() {
    if (!this.ctx) return;
    const chords = [
      [261.6, 329.6, 392.0],   // C
      [220.0, 261.6, 329.6],   // Am
      [196.0, 246.9, 293.7],   // G
      [174.6, 220.0, 261.6],   // F
    ];
    let step = 0;
    this.intensity = 0;
    const tickFn = () => {
      if (!this.ctx || document.hidden) return;
      const chord = chords[Math.floor(step / 8) % chords.length];
      const note = chord[step % chord.length] * (step % 2 ? 1 : 0.5);
      const dur = 0.5 + this.intensity * 0.1;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = note;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.05 + this.intensity * 0.02, t + 0.05);
      env.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(env); env.connect(this.buses.music);
      osc.start(t); osc.stop(t + dur + 0.02);
      step++;
    };
    this.musicTimer = setInterval(tickFn, 420);
  }

  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }

  dispose() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibility);
    }
    if (this.ctx) this.ctx.close().catch(() => {});
    this.started = false;
  }
}
