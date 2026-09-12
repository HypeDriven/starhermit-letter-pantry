// Letter Pantry — StarHermit platform adapter.
// Hosted mode activates iff a launch token was read from the URL fragment;
// every platform call then carries `Authorization: Bearer`. Without a token
// the game never touches platform routes: it either talks to its own
// server.js (local dev backend, probed separately) or runs fully offline.
// Cloud save mirrors the localStorage progress doc; localStorage stays the
// authoritative offline cache.

import { loadJSON, saveJSON } from './session.js';

const REFRESH_MS = 45 * 60 * 1000;   // re-mint cadence (token lifetime 60 min)
const REFRESH_RETRY_MS = 60 * 1000;  // retry a failed re-mint after ~60 s
const REFRESH_MAX_RETRIES = 3;
const SAVE_DEBOUNCE_MS = 2000;
const SAVE_RETRY_MS = 30000;
const SAVE_MAX_RETRIES = 3;
const LEADERBOARD_PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Minimal ZIP writer/reader (stored entries only, no compression).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(name, dataBytes) {
  const enc = new TextEncoder();
  const nameB = enc.encode(name);
  const crc = crc32(dataBytes);
  const out = [];
  const u16 = (v) => out.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v) => out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  u32(0x04034b50); u16(20); u16(0); u16(0); u16(0); u16(0);
  u32(crc); u32(dataBytes.length); u32(dataBytes.length);
  u16(nameB.length); u16(0);
  const local = out.length;
  const head = new Uint8Array(out);
  const cd = [];
  const c16 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff);
  const c32 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  c32(0x02014b50); c16(20); c16(20); c16(0); c16(0); c16(0); c16(0);
  c32(crc); c32(dataBytes.length); c32(dataBytes.length);
  c16(nameB.length); c16(0); c16(0); c16(0); c16(0); c32(0); c32(0); // attrs + local-header offset
  const cdHead = new Uint8Array(cd);
  const cdOff = head.length + nameB.length + dataBytes.length;
  const parts = [head, nameB, dataBytes, cdHead, nameB];
  const eocd = [];
  const e32 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const e16 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff);
  e32(0x06054b50); e16(0); e16(0); e16(1); e16(1);
  e32(cdHead.length + nameB.length); e32(cdOff); e16(0);
  parts.push(new Uint8Array(eocd));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  return buf;
}
function unzipFirstEntry(zipBytes) {
  // Stored single-entry reader: scan local headers for compression 0.
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  let off = 0;
  while (off + 30 <= zipBytes.length && dv.getUint32(off, true) === 0x04034b50) {
    const method = dv.getUint16(off + 8, true);
    const size = dv.getUint32(off + 18, true);
    const nameLen = dv.getUint16(off + 26, true);
    const extraLen = dv.getUint16(off + 28, true);
    const dataOff = off + 30 + nameLen + extraLen;
    if (method !== 0) throw new Error('unsupported zip entry');
    return zipBytes.slice(dataOff, dataOff + size);
  }
  throw new Error('bad zip');
}
function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToBytes(b64) {
  const s = atob(b64);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

// Exported for the test-suite (strict zip validation, token decode).
export { zipStore, unzipFirstEntry, bytesToBase64, base64ToBytes, decodeJwtPayload };

// ---------------------------------------------------------------------------
// Launch token. Fragment `#game_token=` is authoritative and read once, then
// stripped; query fallbacks exist for local dev only and are never read on
// *.starhermit.com hosts.

function readLaunchToken() {
  if (typeof window === 'undefined' || !window.location) return null;
  const host = window.location.hostname || '';
  const isPlatformHost = /(^|\.)starhermit\.com$/.test(host);
  let token = null;
  const hash = window.location.hash || '';
  if (hash.length > 1) {
    const params = new URLSearchParams(hash.slice(1));
    token = params.get('game_token');
    if (token) {
      // Read once: strip the fragment without reloading the page.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }
  if (!token && !isPlatformHost) {
    const q = new URLSearchParams(window.location.search);
    token = q.get('game_token') || q.get('launch_token') || q.get('launch') || q.get('token');
  }
  return token || null;
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const claims = JSON.parse(json);
    return (claims && typeof claims === 'object') ? claims : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Cloud doc: one mirror of every persistent progress key. Remote wins merges.

const CLOUD_ENTRY = 'save.json';
const CLOUD_KEYS = ['progression', 'tutorial', 'stats', 'achievements', 'boards'];

function buildCloudDoc() {
  const doc = { schemaVersion: 1, savedAt: Date.now() };
  for (const key of CLOUD_KEYS) doc[key] = loadJSON(key) || {};
  return doc;
}

// ---------------------------------------------------------------------------

export function createPlatform({ onStatus } = {}) {
  return {
    active: false,   // true once a launch token was read and decoded
    onStatus: onStatus || null, // (status, platform) — settable post-creation
    token: null,
    sub: null,       // user id from the JWT `sub` claim
    slug: null,      // game key from the JWT `game_scope` claim (never hard-coded)
    playerName: null,
    _profiles: new Map(),
    _saveTimer: null,
    _retryTimer: null,
    _saveRetries: 0,
    _refreshTimer: null,
    _refreshRetries: 0,

    setStatus(status) {
      this.syncStatus = status;
      if (this.onStatus) this.onStatus(status, this);
    },

    init() {
      const token = readLaunchToken();
      if (!token) { this.setStatus('offline'); return false; }
      const claims = decodeJwtPayload(token);
      if (!claims || claims.sub == null) { this.setStatus('offline'); return false; }
      this.token = token;
      this.sub = String(claims.sub);
      this.slug = typeof claims.game_scope === 'string' && claims.game_scope ? claims.game_scope : null;
      this.active = true;
      this.playerName = 'Player ' + this.sub.slice(0, 8);
      // With a game key a cloud load is imminent; without one there is
      // nothing platform-side to sync.
      this.setStatus(this.slug ? 'saving' : 'synced');
      this._scheduleRefresh();
      return true;
    },

    authHeaders(extra) {
      const headers = Object.assign({}, extra);
      if (this.token) headers.authorization = 'Bearer ' + this.token;
      return headers;
    },

    async api(path, options = {}) {
      const headers = this.authHeaders(options.headers);
      if (typeof options.body === 'string') headers['content-type'] = 'application/json';
      const res = await fetch(path, Object.assign({}, options, { headers }));
      const body = await res.json().catch(() => null);
      if (!res.ok || (body && body.error)) {
        const err = new Error((body && body.error) || `HTTP ${res.status}`);
        err.recoverable = true;
        err.status = res.status;
        throw err;
      }
      return body;
    },

    // -- Token refresh ------------------------------------------------------
    // Scoped tokens re-mint: POST with the current token, swap in {token}.
    _scheduleRefresh() {
      if (typeof setTimeout === 'undefined') return;
      clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => this.refreshToken(), REFRESH_MS);
    },
    async refreshToken() {
      if (!this.active || !this.slug) return;
      try {
        const body = await this.api(`/api/v1/games/${encodeURIComponent(this.slug)}/launch-token`, { method: 'POST', body: '{}' });
        if (body && typeof body.token === 'string' && body.token) this.token = body.token;
        this._refreshRetries = 0;
        this._scheduleRefresh();
      } catch {
        this._refreshRetries++;
        if (this._refreshRetries <= REFRESH_MAX_RETRIES && typeof setTimeout !== 'undefined') {
          this._refreshTimer = setTimeout(() => this.refreshToken(), REFRESH_RETRY_MS);
        } else {
          this._refreshRetries = 0;
          this._scheduleRefresh();
        }
      }
    },

    // -- Profile / nickname -------------------------------------------------
    // NEVER /api/v1/me (403 for launch tokens); display nickname only.
    async fetchProfile(userId) {
      const id = userId || this.sub;
      if (!this.active || !id) return null;
      if (this._profiles.has(id)) return this._profiles.get(id);
      let profile = null;
      try {
        const body = await this.api(`/api/v1/users/${encodeURIComponent(id)}/profile`);
        if (body && typeof body === 'object') {
          profile = { id: body.id || id, nickname: typeof body.nickname === 'string' && body.nickname ? body.nickname : null };
        }
      } catch { /* offline or missing: fall through to the fallback name */ }
      this._profiles.set(id, profile);
      return profile;
    },
    async resolveName(userId) {
      const profile = await this.fetchProfile(userId);
      return (profile && profile.nickname) || 'Player ' + String(userId).slice(0, 8);
    },
    async loadOwnProfile() {
      const profile = await this.fetchProfile(this.sub);
      this.playerName = (profile && profile.nickname) || 'Player ' + this.sub.slice(0, 8);
      if (this.onStatus) this.onStatus(this.syncStatus, this);
      return this.playerName;
    },

    // -- Cloud save ---------------------------------------------------------
    async loadCloud() {
      if (!this.active || !this.slug) return false;
      this.setStatus('saving');
      try {
        const res = await fetch(`/api/v1/me/cloud-saves/${encodeURIComponent(this.slug)}`, {
          headers: this.authHeaders(),
        });
        if (res.status === 404) { this.setStatus('synced'); return false; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const doc = JSON.parse(new TextDecoder().decode(unzipFirstEntry(bytes)));
        // Remote-preferred merge: a cloud copy wins over the local cache.
        for (const key of CLOUD_KEYS) {
          if (doc[key] && typeof doc[key] === 'object') saveJSON(key, doc[key]);
        }
        this.setStatus('synced');
        return true;
      } catch {
        // Unreachable or malformed: local cache is authoritative for now.
        this.setStatus('offline');
        return false;
      }
    },
    markDirty() {
      if (!this.active || !this.slug || typeof setTimeout === 'undefined') return;
      this.setStatus('saving');
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.flushSave(), SAVE_DEBOUNCE_MS);
    },
    async flushSave() {
      if (!this.active || !this.slug) return;
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      this.setStatus('saving');
      try {
        const payload = new TextEncoder().encode(JSON.stringify(buildCloudDoc()));
        await fetch(`/api/v1/me/cloud-saves/${encodeURIComponent(this.slug)}`, {
          method: 'PUT',
          headers: this.authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({ dataBase64: bytesToBase64(zipStore(CLOUD_ENTRY, payload)) }),
        }).then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); });
        this._saveRetries = 0;
        this.setStatus('synced');
      } catch {
        this.setStatus('offline');
        if (this._saveRetries < SAVE_MAX_RETRIES && typeof setTimeout !== 'undefined') {
          this._saveRetries++;
          clearTimeout(this._retryTimer);
          this._retryTimer = setTimeout(() => this.flushSave(), SAVE_RETRY_MS);
        }
      }
    },

    // -- Leaderboard (read-only; clients can never submit scores) -----------
    async fetchLeaderboard({ friendsOnly = false, page = 1 } = {}) {
      if (!this.active || !this.slug) return null;
      try {
        const info = await this.api(`/api/v1/games/${encodeURIComponent(this.slug)}`);
        const leaderboardId = info && info.leaderboardId;
        if (!leaderboardId) return null;
        const q = new URLSearchParams({
          friendsOnly: friendsOnly ? 'true' : 'false',
          page: String(page),
          pageSize: String(LEADERBOARD_PAGE_SIZE),
        });
        const board = await this.api(`/api/v1/leaderboards/${encodeURIComponent(leaderboardId)}/entries?${q}`);
        const raw = (board && (board.entries || board.items)) || [];
        const entries = await Promise.all(raw.slice(0, LEADERBOARD_PAGE_SIZE).map(async (e) => {
          const userId = e.userId ?? e.user_id ?? e.user ?? null;
          return {
            name: userId ? await this.resolveName(userId) : (e.nickname || e.name || 'Player'),
            score: Number(e.score ?? e.value ?? 0),
            rank: e.rank,
          };
        }));
        return { entries, me: (info && info.me) || null };
      } catch {
        return null; // no board: callers show local records only
      }
    },
  };
}

export const platform = createPlatform();
