// Letter Pantry — StarHermit platform adapter over the shared SDK
// (window.StarHermit from starhermit-sdk.js). The SDK owns the launch token,
// renewal, profile lookup, the game:<slug> cloud-save slot, the settings KV
// and key bindings; this adapter keeps the game's API (active, playerName,
// syncStatus, markDirty …). Without a token nothing here touches the network.
// Cloud save mirrors the localStorage progress doc; localStorage stays the
// authoritative offline cache.

import { loadJSON, saveJSON } from './session.js';

const SAVE_DEBOUNCE_MS = 2000;
const SETTINGS_DEBOUNCE_MS = 1500;
const LEADERBOARD_PAGE_SIZE = 10;

// Cloud doc: one mirror of every persistent progress key. Remote wins merges.
const CLOUD_KEYS = ['progression', 'tutorial', 'stats', 'achievements', 'boards'];

function buildCloudDoc() {
  const doc = { schemaVersion: 1, savedAt: Date.now() };
  for (const key of CLOUD_KEYS) doc[key] = loadJSON(key) || {};
  return doc;
}

// deps: {sh} SDK instance (default globalThis.StarHermit, resolved lazily),
// {onStatus(status, platform)}.
export function createPlatform({ sh: shDep, onStatus } = {}) {
  const S = () => shDep || globalThis.StarHermit || null;
  const authListeners = new Set();
  let settingsTimer = null;
  let pendingPatch = null;
  let lastSettings = null;

  const platform = {
    active: false,   // true while a launch token is held
    onStatus: onStatus || null, // (status, platform) — settable post-creation
    syncStatus: 'offline',
    playerName: null,
    get sub() { const sh = S(); return sh ? sh.userId : null; },
    get slug() { const sh = S(); return sh ? sh.slug : null; },

    setStatus(status) {
      this.syncStatus = status;
      if (this.onStatus) this.onStatus(status, this);
    },

    // Reads the launch token (fragment) once and wires auth/save events.
    init() {
      const sh = S();
      if (!sh) { this.setStatus('offline'); return false; }
      sh.init();
      sh.on('saved', (ok) => this.setStatus(ok ? 'synced' : 'offline'));
      sh.on('auth', (a) => {
        this.active = !!a.signedIn;
        if (!a.signedIn) { this.playerName = null; this.setStatus('offline'); }
        for (const fn of authListeners) { try { fn(a); } catch { /* listener errors are ignored */ } }
      });
      this.active = !!sh.signedIn;
      if (!this.active) { this.setStatus('offline'); return false; }
      this.playerName = 'Player ' + String(sh.userId).slice(0, 6);
      this.setStatus('saving'); // a cloud load is imminent
      return true;
    },
    onAuth(fn) { authListeners.add(fn); },

    // -- Profile / nickname -------------------------------------------------
    async resolveName(userId) {
      const p = this.active ? await S().profile(userId) : null;
      return p ? p.displayName : 'Player ' + String(userId).slice(0, 6);
    },
    async loadOwnProfile() {
      if (!this.active) return null;
      const p = await S().profile();
      if (p) this.playerName = p.displayName;
      if (this.onStatus) this.onStatus(this.syncStatus, this);
      return this.playerName;
    },

    // -- Cloud save ---------------------------------------------------------
    async loadCloud() {
      if (!this.active) return false;
      this.setStatus('saving');
      const doc = await S().loadJSON();
      if (doc && typeof doc === 'object') {
        // Remote-preferred merge: a cloud copy wins over the local cache.
        for (const key of CLOUD_KEYS) {
          if (doc[key] && typeof doc[key] === 'object') saveJSON(key, doc[key]);
        }
      }
      this.setStatus('synced');
      return !!doc;
    },
    markDirty() {
      if (!this.active) return;
      this.setStatus('saving');
      S().saveJSON(buildCloudDoc(), SAVE_DEBOUNCE_MS);
    },
    flushSave() {
      if (!this.active) return Promise.resolve(false);
      flushSettings();
      return S().flushSave(true);
    },

    // -- Settings KV (per-player preferences) -------------------------------
    async loadSettings() {
      if (!this.active) return {};
      return (await S().getSettings()) || {};
    },
    // Seed the change detector once platform values are applied.
    primeSettings(settings) { lastSettings = JSON.stringify(settings); },
    // Patch changed top-level keys (debounced); ignored until primed.
    pushSettings(settings) {
      if (!this.active || lastSettings === null) return;
      const json = JSON.stringify(settings);
      if (json === lastSettings) return;
      const prev = JSON.parse(lastSettings);
      lastSettings = json;
      pendingPatch = pendingPatch || {};
      for (const k of Object.keys(settings)) {
        if (JSON.stringify(settings[k]) !== JSON.stringify(prev[k])) pendingPatch[k] = settings[k];
      }
      clearTimeout(settingsTimer);
      settingsTimer = setTimeout(flushSettings, SETTINGS_DEBOUNCE_MS);
    },

    // -- Controls / sign-in / invite ----------------------------------------
    loadBindings(defaults) { return this.active ? S().loadBindings(defaults) : Promise.resolve(defaults); },
    canSignIn() { const sh = S(); return !!sh && sh.canSignIn(); },
    signIn() { const sh = S(); return !!sh && sh.signIn(); },
    inviteLink() { return this.active ? S().inviteLink() : null; },

    // -- High-score board (score-script.js) --------------------------------
    // Post a finished round's total via StarHermit.submitScores; resolves
    // {posted, rank} — the player's rank on the `high-score` board, or null.
    async postHighScore(total) {
      const sh = S();
      if (!this.active || !sh) return { posted: false, rank: null };
      try {
        const keys = await sh.submitScores({ 'high-score': total });
        if (!keys || keys.indexOf('high-score') < 0) return { posted: false, rank: null };
        try {
          const r = await sh.leaderboard('high-score', { pageSize: 100 });
          const me = ((r && r.items) || []).find((i) => i.userId === sh.userId);
          return { posted: true, rank: me ? me.rank : null };
        } catch { return { posted: true, rank: null }; }
      } catch { return { posted: false, rank: null }; }
    },

    // -- Leaderboard (read-only reads of the game's default board) ----------
    async fetchLeaderboard() {
      if (!this.active) return null;
      const board = await S().leaderboard(null, { pageSize: LEADERBOARD_PAGE_SIZE });
      if (!board || !board.board) return null;
      const entries = await Promise.all((board.items || []).slice(0, LEADERBOARD_PAGE_SIZE).map(async (e) => ({
        name: e.userId ? await this.resolveName(e.userId) : (e.nickname || 'Player'),
        score: Number(e.score ?? e.value ?? 0),
        rank: e.rank,
      })));
      return { entries, me: null };
    },
  };

  function flushSettings() {
    clearTimeout(settingsTimer);
    settingsTimer = null;
    if (!pendingPatch || !platform.active) return Promise.resolve(null);
    const patch = pendingPatch;
    pendingPatch = null;
    return S().patchSettings(patch);
  }
  platform.flushSettings = flushSettings;
  return platform;
}

export const platform = createPlatform();
