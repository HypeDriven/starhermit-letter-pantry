// Letter Pantry — pure deterministic rules engine.
// No DOM, no Three.js, no timers. All randomness flows through seeded streams.

export const RULESET = 'letter-pantry-rules/1';
export const SCHEMA_VERSION = 1;
export const BUILD_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Hashing & RNG

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0);
}

export function hashHex(str) {
  return fnv1a(str).toString(16).padStart(8, '0');
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.state = () => a >>> 0;
  next.setState = (s) => { a = s >>> 0; };
  return next;
}

// Three independent streams: rules (gameplay), decoration (visual), av (audio).
export function makeStreams(seed) {
  const base = typeof seed === 'number' ? seed >>> 0 : fnv1a(String(seed));
  return {
    rules: mulberry32(fnv1a('rules:' + base)),
    decoration: mulberry32(fnv1a('decoration:' + base)),
    av: mulberry32(fnv1a('av:' + base)),
  };
}

// ---------------------------------------------------------------------------
// Stable stringify + state hash (for replay equivalence and checksums).

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

export function hashState(state) {
  const core = {
    contentId: state.contentId,
    letters: state.letters,
    selected: state.selected,
    foundTargets: state.foundTargets,
    foundBonus: state.foundBonus,
    invalidCount: state.invalidCount,
    movesUsed: state.movesUsed,
    hintsUsed: state.hintsUsed,
    hintReveals: state.hintReveals,
    streak: state.streak,
    bestStreak: state.bestStreak,
    score: state.score,
    tick: state.tick,
    status: state.status,
    terminalReason: state.terminalReason,
    elapsedMs: state.elapsedMs,
    rngRulesState: state.rngRulesState,
  };
  return hashHex(stableStringify(core));
}

// ---------------------------------------------------------------------------
// Content descriptor shape:
// { id, seed, letters: string, targets: string[], bonus: string[],
//   mechanics: { moveLimit?, undo?, shuffle?, hints? },
//   par: { timeMs, moves }, theme }

function normalizeDescriptor(d) {
  if (!d || typeof d !== 'object') throw new Error('descriptor missing');
  if (typeof d.id !== 'string' || !d.id) throw new Error('descriptor id missing');
  if (typeof d.letters !== 'string' || d.letters.length < 3) throw new Error('descriptor letters invalid');
  if (!Array.isArray(d.targets) || d.targets.length === 0) throw new Error('descriptor targets invalid');
  const mechanics = Object.assign({ moveLimit: null, undo: true, shuffle: true, hints: 3 }, d.mechanics || {});
  const par = Object.assign({ timeMs: 180000, moves: d.targets.length + 6 }, d.par || {});
  return {
    id: d.id,
    seed: d.seed,
    letters: d.letters.toLowerCase(),
    targets: d.targets.map((w) => w.toLowerCase()),
    bonus: (d.bonus || []).map((w) => w.toLowerCase()),
    mechanics,
    par,
    theme: d.theme || 'classic',
  };
}

export function createState(descriptor) {
  const d = normalizeDescriptor(descriptor);
  const streams = makeStreams(d.seed);
  const state = {
    schemaVersion: SCHEMA_VERSION,
    ruleset: RULESET,
    contentId: d.id,
    seed: d.seed,
    letters: d.letters.split(''),
    targets: d.targets,
    bonus: d.bonus,
    mechanics: d.mechanics,
    par: d.par,
    theme: d.theme,
    selected: [],
    foundTargets: [],
    foundBonus: [],
    invalidCount: 0,
    movesUsed: 0,
    hintsUsed: 0,
    hintReveals: {},
    streak: 0,
    bestStreak: 0,
    score: { target: 0, bonus: 0, length: 0, streak: 0, penalty: 0, time: 0, total: 0 },
    tick: 0,
    status: 'active',
    terminalReason: null,
    elapsedMs: 0,
    rngRulesState: streams.rules.state(),
    history: [],
  };
  state._rng = streams.rules; // runtime only, never serialized
  return state;
}

function rngOf(state) {
  if (!state._rng) {
    const r = mulberry32(0);
    r.setState(state.rngRulesState);
    state._rng = r;
  }
  return state._rng;
}

function syncRng(state) {
  state.rngRulesState = rngOf(state).state();
}

// ---------------------------------------------------------------------------
// Scoring — integer components only.

export function scoreWord(word) {
  return 100 + Math.max(0, word.length - 3) * 25;
}

export function scoreBonusWord(word) {
  return 50 + Math.max(0, word.length - 3) * 10;
}

function recomputeScore(state) {
  const s = state.score;
  s.target = 0; s.length = 0; s.bonus = 0;
  for (const w of state.foundTargets) {
    s.target += 100;
    s.length += Math.max(0, w.length - 3) * 25;
  }
  for (const w of state.foundBonus) {
    s.bonus += scoreBonusWord(w);
  }
  s.penalty = -25 * state.invalidCount;
  s.total = s.target + s.bonus + s.length + s.streak + s.penalty + s.time;
  if (state.status === 'terminal' && state.terminalReason === 'completed' && s.time === 0) {
    const remaining = state.par.timeMs - state.elapsedMs;
    if (remaining > 0) {
      s.time = Math.round(remaining / 1000) * 5;
      s.total = s.target + s.bonus + s.length + s.streak + s.penalty + s.time;
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Legal-action query API — the single source of truth for what is allowed.

export function listActions(state) {
  if (state.status !== 'active') return [];
  const actions = [];
  const selectedSet = new Set(state.selected);
  for (let i = 0; i < state.letters.length; i++) {
    if (selectedSet.has(i)) actions.push({ type: 'deselect', index: i });
    else actions.push({ type: 'select', index: i });
  }
  if (state.selected.length > 0) {
    actions.push({ type: 'clear' });
    if (state.selected.length >= 3) actions.push({ type: 'submit' });
    actions.push({ type: 'deselect', index: state.selected[state.selected.length - 1], pop: true });
  }
  if (state.mechanics.shuffle !== false) actions.push({ type: 'shuffle' });
  if (state.mechanics.undo !== false && state.history.length > 0) actions.push({ type: 'undo' });
  if ((state.mechanics.hints || 0) > state.hintsUsed) actions.push({ type: 'hint' });
  actions.push({ type: 'resign' });
  return actions;
}

export function isLegal(state, cmd) {
  if (!cmd || typeof cmd.type !== 'string') return false;
  if (cmd.type === 'tick') return state.status === 'active';
  return listActions(state).some((a) => {
    if (a.type !== cmd.type) return false;
    if ((cmd.type === 'select' || cmd.type === 'deselect') && a.index !== cmd.index) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// History snapshots (undo). Stored without runtime fields.

function snapshotForHistory(state) {
  return {
    letters: state.letters.slice(),
    selected: state.selected.slice(),
    foundTargets: state.foundTargets.slice(),
    foundBonus: state.foundBonus.slice(),
    invalidCount: state.invalidCount,
    movesUsed: state.movesUsed,
    hintsUsed: state.hintsUsed,
    hintReveals: JSON.parse(JSON.stringify(state.hintReveals)),
    streak: state.streak,
    bestStreak: state.bestStreak,
    score: Object.assign({}, state.score),
    elapsedMs: state.elapsedMs,
    rngRulesState: state.rngRulesState,
  };
}

function restoreFromHistory(state, snap) {
  state.letters = snap.letters.slice();
  state.selected = snap.selected.slice();
  state.foundTargets = snap.foundTargets.slice();
  state.foundBonus = snap.foundBonus.slice();
  state.invalidCount = snap.invalidCount;
  state.movesUsed = snap.movesUsed;
  state.hintsUsed = snap.hintsUsed;
  state.hintReveals = JSON.parse(JSON.stringify(snap.hintReveals));
  state.streak = snap.streak;
  state.bestStreak = snap.bestStreak;
  state.score = Object.assign({}, snap.score);
  state.elapsedMs = snap.elapsedMs;
  state.rngRulesState = snap.rngRulesState;
  state._rng = null;
}

// ---------------------------------------------------------------------------
// Command application. Returns { ok, reason?, events? } — never throws on bad input.

const FAIL = (reason) => ({ ok: false, reason });

export function applyCommand(state, cmd) {
  if (!state || typeof state !== 'object') return FAIL('bad-state');
  if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') return FAIL('bad-command');
  if (cmd.type !== 'tick' && state.status !== 'active') return FAIL('terminal');

  const events = [];
  const fail = (reason) => FAIL(reason);

  switch (cmd.type) {
    case 'tick': {
      const ms = Number(cmd.elapsedMs);
      if (!Number.isFinite(ms) || ms < 0 || ms > 24 * 3600 * 1000) return fail('bad-command');
      if (ms > state.elapsedMs) state.elapsedMs = Math.floor(ms);
      state.tick += 1;
      return { ok: true, events };
    }

    case 'select': {
      const i = cmd.index;
      if (!Number.isInteger(i) || i < 0 || i >= state.letters.length) return fail('bad-index');
      if (state.selected.includes(i)) return fail('already-selected');
      state.history.push(snapshotForHistory(state));
      state.selected.push(i);
      events.push({ type: 'select', index: i, letter: state.letters[i], word: currentWord(state) });
      break;
    }

    case 'deselect': {
      const i = cmd.index;
      if (!Number.isInteger(i)) return fail('bad-index');
      const pos = state.selected.indexOf(i);
      if (pos === -1) return fail('not-selected');
      state.history.push(snapshotForHistory(state));
      state.selected.splice(pos, 1);
      events.push({ type: 'deselect', index: i, word: currentWord(state) });
      break;
    }

    case 'clear': {
      if (state.selected.length === 0) return fail('empty-selection');
      state.history.push(snapshotForHistory(state));
      state.selected = [];
      events.push({ type: 'clear' });
      break;
    }

    case 'shuffle': {
      if (state.mechanics.shuffle === false) return fail('not-allowed');
      state.history.push(snapshotForHistory(state));
      const rng = rngOf(state);
      const letters = state.letters.slice();
      for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
      }
      // Preserve selection by letter identity is impossible post-shuffle; clear it.
      state.selected = [];
      state.letters = letters;
      syncRng(state);
      events.push({ type: 'shuffle', letters: letters.join('') });
      break;
    }

    case 'submit': {
      if (state.selected.length === 0) return fail('empty-selection');
      const word = currentWord(state);
      if (word.length < 3) return fail('too-short');
      if (state.foundTargets.includes(word) || state.foundBonus.includes(word)) return fail('already-found');
      state.history.push(snapshotForHistory(state));
      state.movesUsed += 1;
      if (state.targets.includes(word)) {
        state.foundTargets.push(word);
        state.streak += 1;
        if (state.streak > state.bestStreak) state.bestStreak = state.streak;
        if (state.streak > 1) state.score.streak += 15 * (state.streak - 1);
        state.selected = [];
        events.push({ type: 'word-target', word, remaining: state.targets.length - state.foundTargets.length });
      } else if (state.bonus.includes(word)) {
        state.foundBonus.push(word);
        state.streak += 1;
        if (state.streak > state.bestStreak) state.bestStreak = state.streak;
        if (state.streak > 1) state.score.streak += 15 * (state.streak - 1);
        state.selected = [];
        events.push({ type: 'word-bonus', word });
      } else {
        state.invalidCount += 1;
        state.streak = 0;
        state.selected = [];
        events.push({ type: 'word-invalid', word });
      }
      recomputeScore(state);
      // Terminal evaluation.
      if (state.foundTargets.length === state.targets.length) {
        state.status = 'terminal';
        state.terminalReason = 'completed';
        recomputeScore(state);
        events.push({ type: 'terminal', reason: 'completed', score: Object.assign({}, state.score) });
      } else if (state.mechanics.moveLimit != null && state.movesUsed >= state.mechanics.moveLimit) {
        state.status = 'terminal';
        state.terminalReason = 'out-of-moves';
        events.push({ type: 'terminal', reason: 'out-of-moves', score: Object.assign({}, state.score) });
      }
      break;
    }

    case 'undo': {
      if (state.mechanics.undo === false) return fail('undo-unavailable');
      if (state.history.length === 0) return fail('nothing-to-undo');
      const snap = state.history.pop();
      restoreFromHistory(state, snap);
      events.push({ type: 'undo' });
      break;
    }

    case 'hint': {
      if ((state.mechanics.hints || 0) <= state.hintsUsed) return fail('no-hints');
      const unfound = state.targets.filter((w) => !state.foundTargets.includes(w));
      if (unfound.length === 0) return fail('no-hints');
      state.history.push(snapshotForHistory(state));
      const rng = rngOf(state);
      const word = unfound[Math.floor(rng() * unfound.length)];
      const revealed = state.hintReveals[word] || [];
      const next = [];
      for (let p = 0; p < word.length; p++) {
        if (revealed.includes(p)) next.push(p);
      }
      const hidden = word.split('').map((_, p) => p).filter((p) => !next.includes(p));
      if (hidden.length > 0) next.push(hidden[Math.floor(rng() * hidden.length)]);
      state.hintReveals[word] = next.sort((a, b) => a - b);
      state.hintsUsed += 1;
      syncRng(state);
      events.push({ type: 'hint', word, positions: state.hintReveals[word] });
      break;
    }

    case 'resign': {
      state.status = 'terminal';
      state.terminalReason = 'resigned';
      recomputeScore(state);
      events.push({ type: 'terminal', reason: 'resigned', score: Object.assign({}, state.score) });
      break;
    }

    default:
      return fail('bad-command');
  }

  state.tick += 1;
  syncRng(state);
  recomputeScore(state);
  return { ok: true, events };
}

export function currentWord(state) {
  return state.selected.map((i) => state.letters[i]).join('');
}

// ---------------------------------------------------------------------------
// Serialization: versioned JSON with migration.

export function toJSON(state) {
  const copy = {};
  for (const k of Object.keys(state)) {
    if (k.startsWith('_')) continue;
    copy[k] = state[k];
  }
  return JSON.parse(JSON.stringify(copy));
}

export function fromJSON(data) {
  if (!data || typeof data !== 'object') throw new Error('bad snapshot');
  let d = data;
  if (d.schemaVersion === 0 || d.schemaVersion == null) {
    // Migration v0 -> v1: fill fields introduced in v1.
    d = Object.assign({
      hintReveals: {}, hintsUsed: 0, streak: 0, bestStreak: 0,
      score: { target: 0, bonus: 0, length: 0, streak: 0, penalty: 0, time: 0, total: 0 },
      elapsedMs: 0, rngRulesState: 0,
    }, d);
    d.schemaVersion = 1;
  }
  if (d.schemaVersion !== SCHEMA_VERSION) throw new Error('unsupported schema version: ' + d.schemaVersion);
  const state = Object.assign({}, d);
  state._rng = null;
  recomputeScore(state);
  return state;
}

// ---------------------------------------------------------------------------
// Replay: descriptor + ordered commands -> identical state & hash.

export function replay(descriptor, commands) {
  let state = createState(descriptor);
  const initialHash = hashState(state);
  const stateHashes = [initialHash];
  for (let i = 0; i < commands.length; i++) {
    const res = applyCommand(state, commands[i]);
    if (!res.ok) return { ok: false, failedIndex: i, reason: res.reason };
    stateHashes.push(hashState(state));
  }
  return { ok: true, state, initialHash, stateHashes, hash: stateHashes[stateHashes.length - 1] };
}
