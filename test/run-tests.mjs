// Letter Pantry — test suite. Run: node test/run-tests.mjs (no framework).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as rules from '../rules.mjs';
import * as content from '../content.mjs';
import { Session } from '../session.mjs';

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

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
