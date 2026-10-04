// Letter Pantry — test suite. Run: node tests/run-tests.mjs (no framework).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as rules from '../rules.js';
import * as content from '../content.js';
import { Session, loadJSON, saveJSON } from '../session.js';
import fs from 'node:fs';
import { createPlatform } from '../platform.js';
import * as gfx from '../gfx.js';
import { GFX_STRINGS, pickLocale, gfxT } from '../gfx-i18n.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`ok   ${name}`); })
    .catch((err) => { failed++; console.error(`FAIL ${name}\n     ${err.stack || err}`); });
}

// Build commands that spell `word` from the current letters.
function selectWord(state, word) {
  const cmds = [];
  const used = new Set();
  for (const ch of word) {
    const idx = state.letters.findIndex((l, i) => l === ch && !used.has(i));
    assert.notEqual(idx, -1, `letter ${ch} unavailable for ${word}`);
    used.add(idx);
    cmds.push({ type: 'select', index: idx });
  }
  cmds.push({ type: 'submit' });
  return cmds;
}

function completionCommands(descriptor, { withInvalid = 0, withBonus = 0 } = {}) {
  let state = rules.createState(descriptor);
  const cmds = [];
  for (let i = 0; i < withInvalid; i++) {
    // 'zzz' is never in the dictionary for these letter sets; craft an invalid
    // submission from actual letters: pick the first 3 letters twice-found word.
    cmds.push({ type: 'select', index: 0 }, { type: 'select', index: 1 }, { type: 'select', index: 2 }, { type: 'submit' });
    const r = rules.replay(descriptor, cmds);
    state = r.state;
    if (!state.foundTargets.length && !state.foundBonus.length) continue; // was invalid
  }
  // Ensure exactly withInvalid invalids by brute forcing distinct triples is
  // overkill; instead rebuild deterministically below.
  return null;
}

// Deterministic script generator: solves a descriptor, optionally adding an
// invalid submission (first 3 letters that don't form a listed word).
function solveCommands(descriptor, opts = {}) {
  const state = rules.createState(descriptor);
  const cmds = [];
  const apply = (c) => {
    const r = rules.applyCommand(state, c);
    if (r.ok) cmds.push(c);
    return r;
  };
  if (opts.invalidFirst) {
    // Find a 3-letter combo that is not a target/bonus word.
    outer:
    for (let a = 0; a < state.letters.length; a++)
      for (let b = 0; b < state.letters.length; b++)
        for (let c = 0; c < state.letters.length; c++) {
          if (a === b || b === c || a === c) continue;
          const w = state.letters[a] + state.letters[b] + state.letters[c];
          if (!state.targets.includes(w) && !state.bonus.includes(w)) {
            apply({ type: 'select', index: a });
            apply({ type: 'select', index: b });
            apply({ type: 'select', index: c });
            const r = apply({ type: 'submit' });
            if (r.ok) break outer;
          }
        }
  }
  if (opts.bonusFirst && state.bonus.length) {
    for (const c of selectWord(state, state.bonus[0])) apply(c);
  }
  for (const target of descriptor.targets) {
    for (const c of selectWord(state, target)) apply(c);
  }
  return cmds;
}

// ---------------------------------------------------------------------------

await test('rules: legal actions and invalid reasons', () => {
  const d = content.JOURNEY[0];
  const state = rules.createState(d);
  const actions = rules.listActions(state);
  assert.ok(actions.some((a) => a.type === 'select'));
  assert.ok(actions.some((a) => a.type === 'shuffle'));
  assert.ok(actions.some((a) => a.type === 'resign'));
  assert.ok(!actions.some((a) => a.type === 'submit'), 'submit requires 3 letters');

  assert.equal(rules.applyCommand(state, { type: 'select', index: 99 }).ok, false);
  assert.equal(rules.applyCommand(state, { type: 'select', index: 99 }).reason, 'bad-index');
  assert.equal(rules.applyCommand(state, { type: 'select', index: 0 }).ok, true);
  assert.equal(rules.applyCommand(state, { type: 'select', index: 0 }).reason, 'already-selected');
  assert.equal(rules.applyCommand(state, { type: 'deselect', index: 1 }).reason, 'not-selected');
  assert.equal(rules.applyCommand(state, { type: 'submit' }).reason, 'too-short');
  rules.applyCommand(state, { type: 'select', index: 1 });
  rules.applyCommand(state, { type: 'select', index: 2 });
  const word = rules.currentWord(state);
  const res = rules.applyCommand(state, { type: 'submit' });
  assert.ok(res.ok);
  if (d.targets.includes(word) || d.bonus.includes(word)) {
    assert.ok(res.events.some((e) => e.type.startsWith('word-')));
  }
});

await test('rules: scoring components are exact integers', () => {
  const d = content.JOURNEY[5];
  const state = rules.createState(d);
  const target = d.targets[d.targets.length - 1]; // longest
  for (const c of selectWord(state, target)) rules.applyCommand(state, c);
  const s = state.score;
  assert.equal(s.target, 100);
  assert.equal(s.length, Math.max(0, target.length - 3) * 25);
  assert.equal(s.total, s.target + s.length + s.bonus + s.streak + s.penalty + s.time);
  // Invalid submission penalty.
  const before = state.score.total;
  const a = 0, b = 1, c = 2;
  const w = state.letters[a] + state.letters[b] + state.letters[c];
  rules.applyCommand(state, { type: 'select', index: a });
  rules.applyCommand(state, { type: 'select', index: b });
  rules.applyCommand(state, { type: 'select', index: c });
  const res = rules.applyCommand(state, { type: 'submit' });
  if (!d.targets.includes(w) && !d.bonus.includes(w)) {
    assert.ok(res.ok);
    assert.equal(state.score.penalty, -25);
    assert.equal(state.score.total, before - 25);
  }
});

await test('rules: terminal states completed / out-of-moves / resigned', () => {
  const d = content.JOURNEY[0];
  // completed
  const state = rules.createState(d);
  for (const t of d.targets) for (const c of selectWord(state, t)) rules.applyCommand(state, c);
  assert.equal(state.status, 'terminal');
  assert.equal(state.terminalReason, 'completed');
  assert.equal(rules.listActions(state).length, 0, 'no actions after terminal');
  assert.equal(rules.applyCommand(state, { type: 'shuffle' }).reason, 'terminal');
  // out-of-moves
  const limited = Object.assign({}, d, { mechanics: Object.assign({}, d.mechanics, { moveLimit: 1 }) });
  const s2 = rules.createState(limited);
  s2.letters.forEach((_, i) => { if (i < 3) rules.applyCommand(s2, { type: 'select', index: i }); });
  rules.applyCommand(s2, { type: 'submit' });
  if (s2.foundTargets.length < s2.targets.length) {
    assert.equal(s2.status, 'terminal');
    assert.equal(s2.terminalReason, 'out-of-moves');
  }
  // resigned
  const s3 = rules.createState(d);
  assert.ok(rules.applyCommand(s3, { type: 'resign' }).ok);
  assert.equal(s3.terminalReason, 'resigned');
});

await test('rules: undo and hint', () => {
  const d = content.JOURNEY[0];
  const state = rules.createState(d);
  assert.equal(rules.applyCommand(state, { type: 'undo' }).reason, 'nothing-to-undo');
  rules.applyCommand(state, { type: 'select', index: 0 });
  assert.ok(rules.applyCommand(state, { type: 'undo' }).ok);
  assert.equal(state.selected.length, 0);
  assert.ok(rules.applyCommand(state, { type: 'hint' }).ok);
  assert.equal(state.hintsUsed, 1);
  // hint limit
  const noHints = Object.assign({}, d, { mechanics: Object.assign({}, d.mechanics, { hints: 0 }) });
  assert.equal(rules.applyCommand(rules.createState(noHints), { type: 'hint' }).reason, 'no-hints');
  const noUndo = Object.assign({}, d, { mechanics: Object.assign({}, d.mechanics, { undo: false }) });
  const s = rules.createState(noUndo);
  rules.applyCommand(s, { type: 'select', index: 0 });
  assert.equal(rules.applyCommand(s, { type: 'undo' }).reason, 'undo-unavailable');
});

await test('rules: serialization round-trip + migration', () => {
  const d = content.JOURNEY[7];
  const state = rules.createState(d);
  for (const c of selectWord(state, d.targets[0])) rules.applyCommand(state, c);
  rules.applyCommand(state, { type: 'hint' });
  const json = rules.toJSON(state);
  const hashBefore = rules.hashState(state);
  const restored = rules.fromJSON(json);
  assert.equal(rules.hashState(restored), hashBefore);
  // Continue identically from restored state.
  const a = rules.toJSON(state), b = rules.toJSON(restored);
  for (const c of selectWord(state, d.targets[1])) rules.applyCommand(state, c);
  for (const c of selectWord(restored, d.targets[1])) rules.applyCommand(restored, c);
  assert.equal(rules.hashState(state), rules.hashState(restored));
  assert.deepEqual(rules.toJSON(state), rules.toJSON(restored));
  // migration v0 -> v1
  const legacy = { schemaVersion: 0, contentId: 'x', letters: ['t', 'e', 'a'], targets: ['tea'], bonus: [], selected: [], foundTargets: [], foundBonus: [], invalidCount: 0, movesUsed: 0, tick: 1, status: 'active', terminalReason: null, mechanics: { undo: true, shuffle: true, hints: 1 }, par: { timeMs: 1000 }, history: [] };
  const migrated = rules.fromJSON(legacy);
  assert.equal(migrated.schemaVersion, rules.SCHEMA_VERSION);
  assert.throws(() => rules.fromJSON({ schemaVersion: 99 }), /unsupported/);
});

await test('rules: deterministic replay across seeds (property loop)', () => {
  for (let i = 0; i < 12; i++) {
    const d = i % 2 ? content.JOURNEY[i % content.JOURNEY.length] : content.deriveDaily(`2026-03-${String(i + 1).padStart(2, '0')}`);
    const cmds = solveCommands(d, { invalidFirst: i % 3 === 0, bonusFirst: i % 4 === 0 });
    const r1 = rules.replay(d, cmds);
    const r2 = rules.replay(d, cmds);
    assert.ok(r1.ok && r2.ok);
    assert.equal(r1.hash, r2.hash, `hash mismatch for ${d.id}`);
    assert.deepEqual(r1.stateHashes, r2.stateHashes);
    assert.equal(r1.state.terminalReason, 'completed');
  }
});

await test('rules: fuzz malformed commands — no throws, no hangs', () => {
  const d = content.JOURNEY[2];
  const fuzz = [
    null, undefined, 42, 'select', {}, { type: 1 }, { type: 'select' },
    { type: 'select', index: -1 }, { type: 'select', index: 1.5 }, { type: 'select', index: 'a' },
    { type: 'deselect', index: NaN }, { type: 'tick', elapsedMs: -5 }, { type: 'tick', elapsedMs: 'x' },
    { type: 'submit', junk: {} }, { type: 'nonsense' }, { type: '__proto__' },
  ];
  const state = rules.createState(d);
  for (let round = 0; round < 50; round++) {
    for (const cmd of fuzz) {
      const res = rules.applyCommand(state, cmd);
      assert.ok(res && typeof res.ok === 'boolean');
      if (!res.ok) assert.ok(typeof res.reason === 'string');
    }
  }
  assert.ok(Number.isFinite(state.score.total));
});

await test('rules: command stamps drive the round clock and par-time bonus', () => {
  const d = content.JOURNEY[0];
  const state = rules.createState(d);
  assert.equal(state.elapsedMs, 0);
  // Stamps advance the clock monotonically; a stale stamp never rewinds it.
  rules.applyCommand(state, { type: 'select', index: 0, elapsedMs: 4000 });
  assert.equal(state.elapsedMs, 4000);
  rules.applyCommand(state, { type: 'deselect', index: 0, elapsedMs: 1000 });
  assert.equal(state.elapsedMs, 4000);

  // A slow completion earns a smaller time bonus than a fast one.
  const solve = (ms) => {
    const s = rules.createState(d);
    for (const t of d.targets) for (const c of selectWord(s, t)) rules.applyCommand(s, Object.assign({ elapsedMs: ms }, c));
    assert.equal(s.terminalReason, 'completed');
    return s.score;
  };
  const fast = solve(10000);
  const slow = solve(d.par.timeMs - 5000);
  assert.equal(fast.time, Math.round((d.par.timeMs - 10000) / 1000) * 5);
  assert.equal(slow.time, 25);
  assert.ok(fast.total > slow.total, 'beating par time must pay more');
  // Past par there is no time bonus, and never a negative one.
  assert.equal(solve(d.par.timeMs + 60000).time, 0);
});

await test('content: practice seeds round-trip through descriptorFromSeed', () => {
  for (const diff of content.PRACTICE_DIFFICULTIES) {
    for (const n of [0, 7, Math.floor(Date.now() / 60000)]) {
      const d = content.derivePractice(diff, n);
      const back = content.descriptorFromSeed(d.seed);
      assert.ok(back, `no descriptor for ${d.seed}`);
      assert.equal(back.id, d.id);
      assert.equal(back.letters, d.letters);
      assert.deepEqual(back.targets, d.targets);
    }
  }
  assert.equal(content.descriptorFromSeed('practice:nope:1'), null);
  assert.equal(content.descriptorFromSeed('practice:easy:x'), null);
});

await test('content: validator passes all authored stages and sample dailies', () => {
  const r = content.validateContent();
  assert.ok(r.ok, r.errors.join('\n'));
  assert.ok(content.JOURNEY.length >= 40, 'need >= 40 journey stages');
  assert.equal(content.THEMES.length, 5);
  // Full daily sweep for a month.
  for (let day = 1; day <= 28; day++) {
    const d = content.deriveDaily(`2026-06-${String(day).padStart(2, '0')}`);
    for (const t of d.targets) assert.ok(content.canForm(d.letters, t), `${d.id}: ${t}`);
  }
});

await test('session: duplicate command ids rejected idempotently', () => {
  const d = content.JOURNEY[0];
  const session = new Session(d, { autoPause: false });
  session.resume('test');
  const r1 = session.dispatch({ id: 'cmd-1', type: 'select', index: 0 });
  assert.ok(r1.ok);
  const r2 = session.dispatch({ id: 'cmd-1', type: 'select', index: 1 });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'duplicate');
  assert.equal(session.state.selected.length, 1, 'duplicate must not apply');
  assert.ok(session.verifyReplay().ok);
  session.dispose();
});

await test('session: envelope records hashes and terminal result', () => {
  const d = content.JOURNEY[0];
  const session = new Session(d, { autoPause: false });
  session.resume('test');
  for (const t of d.targets) {
    for (const c of selectWord(session.state, t)) session.dispatch(c);
  }
  assert.equal(session.state.terminalReason, 'completed');
  assert.ok(session.envelope.terminalResult);
  assert.equal(session.envelope.stateHashes.length, session.envelope.commands.length + 1);
  assert.ok(session.verifyReplay().ok);
  session.dispose();
});

// ---------------------------------------------------------------------------
// Platform adapter

// The adapter runs over the real shared SDK with a stubbed fetch + launch hash.
const SDK_SRC = fs.readFileSync(path.join(ROOT, 'starhermit-sdk.js'), 'utf8');
function loadSdk() {
  const mod = { exports: {} };
  new Function('module', 'exports', 'self', SDK_SRC)(mod, mod.exports, globalThis);
  return mod.exports;
}
const SH_USER = 'a1b2c3d4-0000-4000-8000-000000000001';
const SH_SLUG = 'letter-pantry';
function shFixture(href) {
  const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64url({ alg: 'none' })}.${b64url({ sub: SH_USER, game_scope: SH_SLUG, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  const u = new URL(href.replace('{jwt}', jwt));
  const win = {
    location: { href: u.href, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin, assign() {} },
    history: { state: null, replaceState(_s, _t, url) { win.replaced = url; } },
  };
  const calls = [];
  let slot = null;
  const kv = { music: 0.2 };
  const res = (status, body, bytes) => ({
    ok: status >= 200 && status < 300, status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body, auth: (init.headers || {}).Authorization });
    if (url === `/api/v1/users/${SH_USER}/profile`) return res(200, { nickname: 'Baker Bo', username: 'secretname' });
    if (url === `/api/v1/me/cloud-saves/${encodeURIComponent('game:' + SH_SLUG)}`) {
      if (method === 'PUT') { slot = new Uint8Array(Buffer.from(body.dataBase64, 'base64')); return res(204); }
      return slot ? res(200, null, slot) : res(404);
    }
    if (url === `/api/v1/games/${SH_SLUG}/settings`) {
      if (method === 'PATCH') Object.assign(kv, body.settings);
      return res(200, { settings: kv });
    }
    return res(404);
  };
  const sh = loadSdk().create({ window: win, fetch });
  return { sh, win, calls, kv, platform: createPlatform({ sh }) };
}
const memStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
};

await test('platform: launch token read + stripped; profile nickname; Bearer', async () => {
  const { platform: p, win, calls } = shFixture('https://letter-pantry.starhermit.com/#game_token={jwt}');
  assert.equal(p.init(), true);
  assert.equal(p.active, true);
  assert.equal(p.sub, SH_USER);
  assert.equal(p.slug, SH_SLUG);
  assert.ok(!String(win.replaced).includes('game_token'));
  assert.equal(await p.loadOwnProfile(), 'Baker Bo');
  assert.match(calls[0].auth, /^Bearer /);
  assert.ok(!calls.some((c) => c.url.includes('/api/v1/me/') && !c.url.includes('cloud-saves')));
});

await test('platform: cloud save round-trips at game:<slug>', async () => {
  const { platform: p, calls } = shFixture('https://x.example/#game_token={jwt}');
  p.init();
  saveJSON('stats', { roundsCompleted: 9 });
  p.markDirty();
  await p.flushSave();
  const put = calls.find((c) => c.method === 'PUT');
  assert.equal(put.url, '/api/v1/me/cloud-saves/game%3Aletter-pantry');
  saveJSON('stats', { roundsCompleted: 0 });
  assert.equal(await p.loadCloud(), true);
  assert.deepEqual(loadJSON('stats'), { roundsCompleted: 9 });
  assert.equal(p.syncStatus, 'synced');
});

await test('platform: settings KV load + changed-key patch', async () => {
  const { platform: p, calls, kv } = shFixture('https://x.example/#game_token={jwt}');
  p.init();
  assert.deepEqual(await p.loadSettings(), { music: 0.2 });
  p.primeSettings({ music: 0.2, effects: 0.8 });
  p.pushSettings({ music: 0.2, effects: 0.4 });
  await p.flushSettings();
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.equal(patch.url, `/api/v1/games/${SH_SLUG}/settings`);
  assert.deepEqual(patch.body, { settings: { effects: 0.4 } });
  assert.equal(kv.effects, 0.4);
  assert.equal(p.inviteLink(), `https://dashboard.starhermit.com/game-invite/${SH_USER}/${SH_SLUG}`);
});

await test('platform: standalone makes no fetch and stays local', async () => {
  const { platform: p, calls } = shFixture('http://localhost:8080/index.html');
  assert.equal(p.init(), false);
  assert.equal(await p.loadCloud(), false);
  assert.deepEqual(await p.loadSettings(), {});
  assert.equal(await p.fetchLeaderboard(), null);
  assert.equal(await p.resolveName('abcdefgh'), 'Player abcdef');
  assert.deepEqual(await p.loadBindings({ pause: ['KeyP'] }), { pause: ['KeyP'] });
  p.markDirty();
  p.primeSettings({});
  p.pushSettings({ music: 1 });
  await p.flushSave();
  assert.equal(p.canSignIn(), false);
  assert.equal(p.inviteLink(), null);
  assert.equal(calls.length, 0);
  const onHost = shFixture('https://letter-pantry.starhermit.com/');
  assert.equal(onHost.platform.init(), false);
  assert.equal(onHost.platform.canSignIn(), true);
  assert.equal(onHost.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Server integration

async function startServer(port) {
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(port) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => { if (String(d).includes('listening')) resolve(); });
    proc.stderr.on('data', (d) => console.error('[server]', String(d)));
    proc.on('exit', (code) => reject(new Error('server exited early: ' + code)));
    setTimeout(() => reject(new Error('server start timeout')), 5000);
  });
  return proc;
}

async function post(port, pathName, body) {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

await test('server: daily derivation parity with client', async () => {
  const port = 18321;
  const proc = await startServer(port);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/daily?date=2026-08-29`);
    assert.equal(res.status, 200);
    const body = await res.json();
    const client = content.deriveDaily('2026-08-29');
    assert.equal(body.seed, client.seed);
    assert.equal(body.targetCount, client.targets.length);
    assert.equal(body.letterCount, client.letters.length);
    assert.equal(body.ruleset, rules.RULESET);
    assert.equal(body.contentVersion, content.CONTENT_VERSION);
  } finally { proc.kill(); }
});

await test('server: score validation accepts valid replay, rejects tampered', async () => {
  const port = 18322;
  const proc = await startServer(port);
  try {
    const date = '2026-08-29';
    const d = content.deriveDaily(date);
    const session = new Session(d, { autoPause: false });
    session.resume('test');
    for (const t of d.targets) for (const c of selectWord(session.state, t)) session.dispatch(c);
    const submission = {
      ruleset: rules.RULESET,
      contentVersion: content.CONTENT_VERSION,
      seed: d.seed,
      assists: {},
      durationMs: session.state.elapsedMs + 1000,
      commands: session.envelope.commands,
      score: session.state.score.total,
      board: 'daily',
      name: 'tester',
    };
    const good = await post(port, '/api/v1/score', submission);
    assert.equal(good.status, 200, JSON.stringify(good.body));
    assert.equal(good.body.accepted, true);

    // Tampered score.
    const tampered = Object.assign({}, submission, { score: submission.score + 500 });
    const bad = await post(port, '/api/v1/score', tampered);
    assert.equal(bad.status, 422);
    assert.match(bad.body.error, /mismatch/);

    // Stale ruleset.
    const stale = Object.assign({}, submission, { ruleset: 'old/0' });
    const staleRes = await post(port, '/api/v1/score', stale);
    assert.equal(staleRes.status, 422);

    // Corrupted command log.
    const corrupt = Object.assign({}, submission, { commands: submission.commands.slice(0, 3) });
    const corruptRes = await post(port, '/api/v1/score', corrupt);
    assert.equal(corruptRes.status, 422);

    // Leaderboard reflects the accepted entry.
    const lb = await fetch(`http://127.0.0.1:${port}/api/v1/leaderboard?board=daily&seed=${encodeURIComponent(d.seed)}`);
    const lbBody = await lb.json();
    assert.ok(lbBody.entries.some((e) => e.score === submission.score));

    // Achievements idempotent.
    const a1 = await post(port, '/api/v1/achievements', { ids: ['first_completion', 'bogus', 'first_completion'] });
    assert.deepEqual(a1.body.unlocked, ['first_completion']);
    const a2 = await post(port, '/api/v1/achievements', { id: 'first_completion' });
    assert.deepEqual(a2.body.unlocked, ['first_completion']);
    session.dispose();
  } finally { proc.kill(); }
});

await test('server: path traversal blocked, JSON 404s', async () => {
  const port = 18323;
  const proc = await startServer(port);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/%2e%2e%2fspec.md`);
    assert.ok([403, 404].includes(res.status), 'status ' + res.status);
    const res2 = await fetch(`http://127.0.0.1:${port}/%2e%2e/%2e%2e/etc/passwd`);
    assert.ok([403, 404].includes(res2.status));
    const res3 = await fetch(`http://127.0.0.1:${port}/nope.js`);
    assert.equal(res3.status, 404);
    assert.deepEqual(Object.keys(await res3.json()), ['error']);
  } finally { proc.kill(); }
});

await test('gfx: detectPreset maps GPU strings to tiers; touch caps at balanced', () => {
  assert.equal(gfx.detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.equal(gfx.detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)'), 'low');
  assert.equal(gfx.detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)'), 'high');
  assert.equal(gfx.detectPreset('Apple M2'), 'high');
  assert.equal(gfx.detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), 'balanced');
  assert.equal(gfx.detectPreset('Adreno (TM) 740'), 'balanced');
  assert.equal(gfx.detectPreset(''), 'balanced');
  assert.equal(gfx.detectPreset('Apple M2', { mobile: true }), 'balanced');
  assert.equal(gfx.detectPreset('SwiftShader', { mobile: true }), 'low');
});

await test('gfx: resolve applies preset, overrides, scale clamp and post flag', () => {
  const auto = gfx.resolve({}, 'low');
  assert.equal(auto.preset, 'low');
  assert.equal(auto.auto, true);
  assert.equal(auto.shadows, 'off');
  assert.equal(auto.post, false, 'Low renders without a post chain');
  assert.equal(auto.adaptive, true);
  assert.equal(auto.showFps, false);
  const high = gfx.resolve({ preset: 'high', shadows: 'off', bloom: 'bogus', render_scale: 9 }, 'low');
  assert.equal(high.preset, 'high');
  assert.equal(high.auto, false);
  assert.equal(high.shadows, 'off', 'override wins');
  assert.equal(high.bloom, gfx.presetTier('high', 'bloom'), 'invalid override falls back to preset');
  assert.equal(high.renderScale, 2, 'render scale clamps to 200%');
  assert.equal(high.post, true);
  assert.equal(gfx.resolve({ render_scale: 0.1 }, 'balanced').renderScale, 0.5);
  assert.equal(gfx.resolve({ preset: 'nope' }, undefined).preset, 'balanced');
  for (const p of gfx.PRESETS) {
    const r = gfx.resolve({ preset: p });
    for (const [cat, tiers] of Object.entries(gfx.CATEGORIES)) assert.ok(tiers.includes(r[cat]), `${p}.${cat}`);
  }
  assert.match(gfx.describe(high, [1280, 800]), /no shadows .* 1280×800 px$/);
});

await test('gfx: choosing a preset clears overrides but keeps scale/toggles', () => {
  const saved = { preset: 'high', shadows: 'off', ao: 'high', render_scale: 1.5, adaptive: false, show_fps: true };
  const next = gfx.choosePreset(saved, 'low');
  assert.deepEqual(next, { preset: 'low', render_scale: 1.5, adaptive: false, show_fps: true });
  assert.equal(gfx.choosePreset(saved, 'auto').preset, 'auto');
  assert.equal(gfx.resolve(next, 'high').shadows, 'off');
  assert.equal(gfx.resolve(gfx.choosePreset(saved, 'ultra'), 'low').ao, 'high');
});

await test('gfx: Graphics strings exist in every required locale', () => {
  const locales = ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT'];
  const keys = Object.keys(GFX_STRINGS['en-US']);
  for (const l of locales) {
    assert.ok(GFX_STRINGS[l], l);
    for (const k of keys) assert.ok(GFX_STRINGS[l][k], `${l}.${k}`);
  }
  assert.equal(pickLocale('de'), 'de-DE');
  assert.equal(pickLocale('es-MX'), 'es-419');
  assert.equal(pickLocale('fr-CA'), 'fr-CA');
  assert.equal(pickLocale('ja-JP'), 'en-US');
  assert.equal(gfxT('en-US', 'auto', { tier: 'Low' }), 'Auto (detected: Low)');
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
