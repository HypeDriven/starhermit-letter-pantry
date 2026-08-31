// Letter Pantry — session orchestration.
// Every state change goes through rules.applyCommand. Sessions stamp each
// command with an id (idempotent duplicate rejection) and a monotonic
// elapsedMs, record a replay envelope, and persist versioned snapshots.

import * as rules from './rules.mjs';
import { CONTENT_VERSION } from './content.mjs';

const STORAGE_PREFIX = 'letter-pantry:';
const SNAPSHOT_VERSION = 1;

// ---------------------------------------------------------------------------
// Versioned, checksummed localStorage helpers (used for settings, progression,
// snapshots, stats). Fails soft when storage is unavailable (private mode).

export function storageAvailable() {
  try {
    const k = STORAGE_PREFIX + 'probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch { return false; }
}

export function saveJSON(key, payload) {
  try {
    const body = JSON.stringify({ version: SNAPSHOT_VERSION, payload });
    const record = { v: SNAPSHOT_VERSION, checksum: rules.hashHex(body), body };
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(record));
    return true;
  } catch { return false; }
}

export function loadJSON(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || typeof record.body !== 'string') return null;
    if (rules.hashHex(record.body) !== record.checksum) return null; // corrupted
    const parsed = JSON.parse(record.body);
    if (parsed.version > SNAPSHOT_VERSION) return null;
    return parsed.payload;
  } catch { return null; }
}

// ---------------------------------------------------------------------------

let sessionCounter = 0;

export class Session {
  constructor(descriptor, options = {}) {
    this.descriptor = descriptor;
    this.state = rules.createState(descriptor);
    this.sessionId = `s${Date.now().toString(36)}-${++sessionCounter}`;
    this.cmdSeq = 0;
    this.seenCommandIds = new Set();
    this.paused = false;
    this.accumulatedMs = 0;
    this.lastStamp = nowMs();
    this.listeners = new Set();
    this.envelope = {
      schemaVersion: rules.SCHEMA_VERSION,
      buildVersion: rules.BUILD_VERSION,
      contentVersion: CONTENT_VERSION,
      seed: descriptor.seed,
      initialHash: rules.hashState(this.state),
      commands: [],
      stateHashes: [rules.hashState(this.state)],
      terminalResult: null,
    };
    this._onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) this.pause('tab-hidden');
      else this.resume('tab-visible');
    };
    if (typeof document !== 'undefined' && options.autoPause !== false) {
      document.addEventListener('visibilitychange', this._onVisibility);
    }
  }

  onEvent(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  _emit(kind, data) {
    for (const fn of this.listeners) {
      try { fn(kind, data); } catch { /* listener errors must not break the session */ }
    }
  }

  elapsedMs() {
    return this.paused ? this.accumulatedMs
      : this.accumulatedMs + (nowMs() - this.lastStamp);
  }

  pause(reason = 'pause') {
    if (this.paused) return;
    this.accumulatedMs = this.elapsedMs();
    this.paused = true;
    this._emit('paused', { reason });
  }

  resume(reason = 'resume') {
    if (!this.paused) return;
    this.lastStamp = nowMs();
    this.paused = false;
    this._emit('resumed', { reason });
  }

  // Dispatch a command. Duplicate command ids are rejected idempotently.
  dispatch(cmd) {
    if (!cmd || typeof cmd !== 'object') return { ok: false, reason: 'bad-command' };
    const id = cmd.id || `${this.sessionId}:${++this.cmdSeq}`;
    if (this.seenCommandIds.has(id)) return { ok: false, reason: 'duplicate', id };
    if (this.paused && cmd.type !== 'tick') {
      // Solo simulation freezes while backgrounded/paused.
      return { ok: false, reason: 'paused' };
    }
    const stamped = Object.assign({}, cmd, { id, elapsedMs: this.elapsedMs() });
    const result = rules.applyCommand(this.state, stamped);
    if (!result.ok) {
      this._emit('rejected', { command: stamped, reason: result.reason });
      return { ok: false, reason: result.reason, id };
    }
    this.seenCommandIds.add(id);
    this.envelope.commands.push(stamped);
    const hash = rules.hashState(this.state);
    this.envelope.stateHashes.push(hash);
    if (this.state.status === 'terminal' && !this.envelope.terminalResult) {
      this.envelope.terminalResult = {
        reason: this.state.terminalReason,
        score: Object.assign({}, this.state.score),
        finalHash: hash,
        durationMs: this.state.elapsedMs,
      };
    }
    this._emit('command', { command: stamped, events: result.events, state: this.snapshot() });
    this.saveSnapshot();
    return { ok: true, id, events: result.events };
  }

  // Immutable-ish snapshot for render/UI consumption.
  snapshot() {
    return rules.toJSON(this.state);
  }

  actions() {
    return rules.listActions(this.state);
  }

  saveSnapshot() {
    return saveJSON('last-snapshot', {
      descriptor: this.descriptor,
      state: rules.toJSON(this.state),
      envelope: this.envelope,
      sessionId: this.sessionId,
    });
  }

  static restoreSnapshot() {
    const data = loadJSON('last-snapshot');
    if (!data || !data.descriptor || !data.state) return null;
    try {
      const session = new Session(data.descriptor, { autoPause: false });
      session.state = rules.fromJSON(data.state);
      session.envelope = data.envelope || session.envelope;
      session.sessionId = data.sessionId || session.sessionId;
      for (const c of session.envelope.commands) session.seenCommandIds.add(c.id);
      session.cmdSeq = session.envelope.commands.length;
      session.accumulatedMs = session.state.elapsedMs;
      session.paused = true; // resume explicitly via UI
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', session._onVisibility);
      }
      return session;
    } catch { return null; }
  }

  // Verify our envelope replays to the same terminal hash.
  verifyReplay() {
    const r = rules.replay(this.descriptor, this.envelope.commands);
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: r.hash === this.envelope.stateHashes[this.envelope.stateHashes.length - 1], hash: r.hash };
  }

  dispose() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibility);
    }
    this.listeners.clear();
  }
}

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
